# -*- coding: utf-8 -*-
"""
cast_references.py — THCHS-30 选角 + 参考片段构建
====================================================
输入: D:\\GPT-SoVITS-v5\\datasets\\thchs30\\{SPK}\\*.wav (54 个说话人)
输出: scripts/voice/out/voices.json   (音色 → 说话人/参考片段/人设/版权)
      scripts/voice/out/cast_report.txt
      D:\\GPT-SoVITS-v5\\voice_refs\\{voice}_{emotion}.wav

流程:
  1. 每个说话人抽 10 个候选片段, 计算 F0/能量/时长统计
  2. paraformer ASR 全部候选片段 (A/B/C 系 trn 损坏, 文本靠 ASR)
  3. 26 音色 × 说话人 贪心匹配 (性别硬约束 + F0/语速/能量软匹配)
  4. 每音色每情绪选 1-3 句拼接成 3-9.5s 参考音频 (API 硬限制 3-10s), prompt_text 取各句文本拼接
"""
import os, re, json, glob, math, random, collections

# --- GSV runtime 的 python 禁用 site (._pth 机制), setuptools 的 distutils shim 不会自动激活;
#     Python 3.12 已移除标准库 distutils, funasr 的标点模型(CTTransformer)导入会失败。
#     手动激活 shim, 必须在 import funasr 之前。---
try:
    import distutils  # noqa: F401
except ImportError:
    try:
        import _distutils_hack
        _distutils_hack.add_shim()
    except Exception as _e:
        print(f"[warn] distutils shim 激活失败: {_e}", flush=True)

import numpy as np
import soundfile as sf
import librosa

random.seed(42)

DATA_DIR = r"D:\GPT-SoVITS-v5\datasets\thchs30"
AISHELL_DIR = r"D:\GPT-SoVITS-v5\datasets\aishell1\data_aishell"
AISHELL_SPK_INFO = r"D:\GPT-SoVITS-v5\datasets\aishell1\resource_aishell\speaker.info"
AISHELL_TRANSCRIPT = os.path.join(AISHELL_DIR, "transcript", "aishell_transcript_v0.8.txt")
REFS_DIR = r"D:\GPT-SoVITS-v5\voice_refs"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts", "voice", "out")
os.makedirs(REFS_DIR, exist_ok=True)

# 两个数据集均为 Apache-2.0 (OpenSLR SLR18 / SLR33)
DATASET_LICENSES = {"THCHS-30": "Apache-2.0", "AISHELL-1": "Apache-2.0"}

# ---------------------------------------------------------------------------
# 26 音色需求表: gender(M/F/N) + f0 目标 + 语速偏好 + 能量偏好
# f0_target 为近似中位基频 (Hz): 男 95-140, 女 180-240, 童 >250
# rate: slow/normal/fast ; energy: low/normal/high
# ---------------------------------------------------------------------------
VOICE_SPECS = {
    "chatter_f":           {"gender": "F", "f0": 215, "rate": "fast",   "energy": "normal", "family": "市井百姓", "persona": "市井女声，亲切爱聊，带方言烟火气"},
    "chatter_m":           {"gender": "M", "f0": 122, "rate": "normal", "energy": "normal", "family": "市井百姓", "persona": "市井男声，朴实憨厚，爱唠嗑"},
    "tribal_m":            {"gender": "M", "f0": 108, "rate": "normal", "energy": "high",   "family": "原始公社", "persona": "猎人/匠人，粗犷直接，嗓子带风沙感"},
    "tribal_f":            {"gender": "F", "f0": 205, "rate": "normal", "energy": "normal", "family": "原始公社", "persona": "采集者/部落妇女，明快利落"},
    "shaman_m":            {"gender": "M", "f0": 100, "rate": "slow",   "energy": "low",    "family": "原始公社", "persona": "萨满，神秘悠远，拖长音"},
    "elder_m":             {"gender": "M", "f0": 112, "rate": "slow",   "energy": "low",    "family": "原始公社", "persona": "长老，苍老缓慢有分量（跨时期呼应）"},
    "child_n":             {"gender": "F", "f0": 250, "rate": "fast",   "energy": "normal", "family": "原始公社", "persona": "孩童，稚嫩明快（跨 S0/S7）"},
    "freeman_m":           {"gender": "M", "f0": 126, "rate": "normal", "energy": "normal", "family": "奴隶制",   "persona": "自由民，傲气、自我庆幸"},
    "noble_antiquity_m":   {"gender": "M", "f0": 112, "rate": "slow",   "energy": "normal", "family": "奴隶制",   "persona": "奴隶主，高傲冷酷"},
    "slave_f":             {"gender": "F", "f0": 195, "rate": "slow",   "energy": "low",    "family": "奴隶制",   "persona": "奴隶，怯懦疲惫（跨 S1-S2）"},
    "lord_m":              {"gender": "M", "f0": 108, "rate": "slow",   "energy": "normal", "family": "封建时代", "persona": "封建领主，傲慢拖腔"},
    "serf_m":              {"gender": "M", "f0": 118, "rate": "slow",   "energy": "low",    "family": "封建时代", "persona": "农奴/贫苦农民，悲苦麻木"},
    "priest_m":            {"gender": "M", "f0": 112, "rate": "slow",   "energy": "low",    "family": "封建时代", "persona": "神职人员，虔诚腔调"},
    "philosopher_n":       {"gender": "N", "f0": 128, "rate": "slow",   "energy": "low",    "family": "封建时代", "persona": "民间智者，深沉缓重（全时期）"},
    "rebel_m":             {"gender": "M", "f0": 138, "rate": "fast",   "energy": "high",   "family": "封建时代", "persona": "觉醒者，低沉转激昂（跨 S1/S2/S5）"},
    "capitalist_m":        {"gender": "M", "f0": 120, "rate": "normal", "energy": "high",   "family": "资本主义", "persona": "资本家/商人，傲慢圆滑"},
    "banker_m":            {"gender": "M", "f0": 114, "rate": "normal", "energy": "normal", "family": "资本主义", "persona": "银行家，精明世故"},
    "worker_m":            {"gender": "M", "f0": 104, "rate": "slow",   "energy": "normal", "family": "资本主义", "persona": "工人，沙哑沉稳，疲惫但有力量"},
    "intellectual_m":      {"gender": "M", "f0": 122, "rate": "normal", "energy": "normal", "family": "资本主义", "persona": "知识分子/理论家，文气沉思"},
    "cadre_n":             {"gender": "N", "f0": 132, "rate": "normal", "energy": "high",   "family": "社会主义", "persona": "干部/领袖，正直昂扬"},
    "citizen_new_n":       {"gender": "N", "f0": 148, "rate": "normal", "energy": "normal", "family": "社会主义", "persona": "新社会公民，明快亲切"},
    "future_f":            {"gender": "F", "f0": 228, "rate": "fast",   "energy": "high",   "family": "共产主义", "persona": "未来居民（女），自由明亮"},
    "future_m":            {"gender": "M", "f0": 136, "rate": "normal", "energy": "high",   "family": "共产主义", "persona": "未来居民（男），明朗洒脱"},
    "concept_philosophy_n":{"gender": "N", "f0": 138, "rate": "slow",   "energy": "low",    "family": "拟人概念", "persona": "哲思之声，空灵中性，画外音"},
    "concept_economy_m":   {"gender": "M", "f0": 98,  "rate": "slow",   "energy": "low",    "family": "拟人概念", "persona": "世间规则之声，冷峻低沉"},
    "building_n":          {"gender": "N", "f0": 95,  "rate": "slow",   "energy": "low",    "family": "拟人建筑", "persona": "建筑，古朴沧桑，历史本人在说话"},
}

RATE_RANK = {"slow": 0, "normal": 1, "fast": 2}
ENERGY_RANK = {"low": 0, "normal": 1, "high": 2}

# ---------------------------------------------------------------------------
# ASR (paraformer, 本地模型, 不下载)
# ---------------------------------------------------------------------------
_asr_model = None

def get_asr():
    global _asr_model
    if _asr_model is None:
        from funasr import AutoModel
        _asr_model = AutoModel(
            model="tools/asr/models/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
            model_revision="v2.0.4",
            vad_model="tools/asr/models/speech_fsmn_vad_zh-cn-16k-common-pytorch",
            vad_model_revision="v2.0.4",
            punc_model="tools/asr/models/punc_ct-transformer_zh-cn-common-vocab272727-pytorch",
            punc_model_revision="v2.0.4",
            device="cuda",
        )
    return _asr_model

def asr_text(wav_path):
    try:
        m = get_asr()
        r = m.generate(input=wav_path)
        return r[0]["text"].replace(" ", "").replace(",", "，").replace(".", "。").strip()
    except Exception as e:
        print(f"  ASR FAIL {wav_path}: {e}")
        return ""

# ---------------------------------------------------------------------------
# 声学分析
# ---------------------------------------------------------------------------

def f0_stats(wav_path):
    y, sr = sf.read(wav_path)
    if y.ndim > 1:
        y = y.mean(axis=1)
    if len(y) < sr // 4:
        return None
    try:
        f0 = librosa.yin(y, fmin=60, fmax=500, sr=sr)
    except Exception:
        return None
    f0 = f0[~np.isnan(f0)]
    f0 = f0[f0 > 0]
    if len(f0) < 5:
        return None
    rms = float(np.sqrt(np.mean(y ** 2)))
    return {
        "f0_med": float(np.median(f0)),
        "f0_p25": float(np.percentile(f0, 25)),
        "f0_p75": float(np.percentile(f0, 75)),
        "rms": rms,
        "dur": len(y) / sr,
    }

def scan_speakers():
    """THCHS-30: F0 统计 + 候选片段 (文本后补 ASR; 该库 51女/4男, 女声为主)"""
    speakers = {}
    for spk_dir in sorted(glob.glob(os.path.join(DATA_DIR, "*"))):
        if not os.path.isdir(spk_dir):
            continue
        spk = os.path.basename(spk_dir)
        wavs = sorted(glob.glob(os.path.join(spk_dir, "*.wav")))
        if len(wavs) < 5:
            continue
        # 均匀抽 14 个做候选, 计算统计
        picks = [wavs[i] for i in np.linspace(0, len(wavs) - 1, min(14, len(wavs))).astype(int)]
        stats, cands = [], []
        for w in picks:
            st = f0_stats(w)
            if st is None:
                continue
            stats.append(st)
            # THCHS-30 单句实际时长 6-13s (不是 2-5s), 窗口按实际放宽
            if 3.0 <= st["dur"] <= 13.0:
                cands.append({"path": w, "dur": st["dur"]})
        if len(stats) < 3 or len(cands) < 3:
            continue
        speakers[spk] = {
            "f0_med": float(np.median([s["f0_med"] for s in stats])),
            "f0_lo": float(np.median([s["f0_p25"] for s in stats])),
            "f0_hi": float(np.median([s["f0_p75"] for s in stats])),
            "rms": float(np.median([s["rms"] for s in stats])),
            "cands": cands[:10],
            "prefix": spk[0],
            "dataset": "THCHS-30",
        }
    return speakers


def load_aishell_meta():
    """AISHELL-1 官方说话人性别表 + 全量转录文件"""
    gender, transcripts = {}, {}
    if os.path.exists(AISHELL_SPK_INFO):
        for line in open(AISHELL_SPK_INFO, encoding="utf-8"):
            p = line.split()
            if len(p) == 2:
                gender[p[0]] = p[1]
    if os.path.exists(AISHELL_TRANSCRIPT):
        for line in open(AISHELL_TRANSCRIPT, encoding="utf-8"):
            p = line.strip().split(maxsplit=1)
            if len(p) == 2:
                transcripts[p[0]] = p[1].strip()
    return gender, transcripts


def scan_aishell1():
    """AISHELL-1 男声: 扫 wav/train 与 wav/dev 下的说话人目录, 按官方性别表过滤男声。
    官方转录文件不在已下载的 3GB 前缀内, 文本统一走 ASR (干净录音识别率高)。"""
    if not os.path.isdir(AISHELL_DIR):
        print("   [skip] AISHELL-1 数据未就绪", flush=True)
        return {}
    gender, _transcripts = load_aishell_meta()
    speakers = {}
    for sub in ("train", "dev"):
        base = os.path.join(AISHELL_DIR, "wav", sub)
        if not os.path.isdir(base):
            continue
        for spk_dir in sorted(glob.glob(os.path.join(base, "*"))):
            if not os.path.isdir(spk_dir):
                continue
            spk = os.path.basename(spk_dir)          # S0002
            sid = spk.lstrip("S")                    # 0002
            if gender.get(sid) != "M":
                continue                             # 只收男声 (官方 speaker.info 过滤)
            wavs = sorted(glob.glob(os.path.join(spk_dir, "*.wav")))
            if len(wavs) < 5:
                continue
            picks = [wavs[i] for i in np.linspace(0, len(wavs) - 1, min(14, len(wavs))).astype(int)]
            stats, cands = [], []
            for w in picks:
                st = f0_stats(w)
                if st is None:
                    continue
                stats.append(st)
                if 2.0 <= st["dur"] <= 13.0:
                    cands.append({"path": w, "dur": st["dur"]})
            if len(stats) < 3 or len(cands) < 3:
                continue
            speakers["AS" + sid] = {
                "f0_med": float(np.median([s["f0_med"] for s in stats])),
                "f0_lo": float(np.median([s["f0_p25"] for s in stats])),
                "f0_hi": float(np.median([s["f0_p75"] for s in stats])),
                "rms": float(np.median([s["rms"] for s in stats])),
                "cands": cands[:10],
                "prefix": "M",
                "dataset": "AISHELL-1",
                "gender_explicit": "M",
            }
    return speakers

def gender_of(spk):
    """性别: AISHELL-1 用官方 speaker.info; THCHS-30 用 F0 (灰区用前缀先验 A/C=男)"""
    if spk.get("gender_explicit"):
        return spk["gender_explicit"]
    f0 = spk["f0_med"]
    if f0 < 152:
        return "M"
    if f0 >= 168:
        return "F"
    return "M" if spk["prefix"] in ("A", "C") else "F"

def rate_of(spk, texts):
    """语速: 已 ASR 文本的总字数 / 总时长 (字/秒), 中文朗读 ~4-6 字/秒"""
    chars = sum(len(t) for t in texts.values())
    durs = sum(c["dur"] for c in spk["cands"][:len(texts)])
    if durs <= 0 or chars <= 0:
        return 4.5
    return chars / durs

def rate_bucket(cps):
    if cps < 3.8:
        return "slow"
    if cps > 4.8:
        return "fast"
    return "normal"

def energy_bucket(rms):
    if rms < 0.035:
        return "low"
    if rms > 0.06:
        return "high"
    return "normal"

# ---------------------------------------------------------------------------
# 情绪线索
# ---------------------------------------------------------------------------
HAPPY_WORDS = ["好", "欢迎", "高兴", "庆祝", "笑", "棒", "美", "喜", "春", "新", "亮", "暖", "甜", "香"]
PLAYFUL_WORDS = ["呢", "吧", "啊", "吗", "猜", "玩", "奇怪", "为什么", "怎么"]

def emotion_of_text(text):
    if "？" in text or "?" in text:
        return "playful"
    if "！" in text or "!" in text:
        return "happy"
    for w in PLAYFUL_WORDS:
        if w in text:
            return "playful"
    for w in HAPPY_WORDS:
        if w in text:
            return "happy"
    return "neutral"

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def main():
    os.chdir(r"D:\GPT-SoVITS-v5\GPT-SoVITS-v2pro-20261006")  # ASR 模型用相对路径
    print("== 1. 扫描说话人声学特征 ==", flush=True)
    speakers = scan_speakers()
    n_th = len(speakers)
    speakers.update(scan_aishell1())
    n_as = len(speakers) - n_th
    print(f"   可用说话人: {len(speakers)} (THCHS-30 {n_th} + AISHELL-1 {n_as})", flush=True)

    print("== 2. ASR 候选片段 (双语料统一转写) ==", flush=True)
    for spk, info in speakers.items():
        for c in info["cands"]:
            c["text"] = asr_text(c["path"])
            c["emo"] = emotion_of_text(c["text"])
        ok = sum(1 for c in info["cands"] if c["text"])
        info["rate_cps"] = rate_of(info, {i: c["text"] for i, c in enumerate(info["cands"])})
        info["rate_bucket"] = rate_bucket(info["rate_cps"])
        info["energy_bucket"] = energy_bucket(info["rms"])
        info["gender"] = gender_of(info)
        print(f"   {spk}: f0={info['f0_med']:.0f}Hz {info['gender']} rate={info['rate_cps']:.1f}字/s({info['rate_bucket']}) energy={info['energy_bucket']} asr_ok={ok}/{len(info['cands'])} [{info['dataset']}]", flush=True)

    print("== 3. 音色匹配 (贪心) ==", flush=True)
    pairs = []
    for vid, spec in VOICE_SPECS.items():
        for spk, info in speakers.items():
            g = info["gender"]
            if spec["gender"] == "M" and g != "M":
                continue
            if spec["gender"] == "F" and g != "F":
                continue
            # N 音色接受男女, 但哲思/建筑偏男声低音, 新公民偏明亮
            if spec["gender"] == "N" and vid in ("citizen_new_n", "future_f") and g == "M" and info["f0_med"] < 130:
                pass  # 允许, 后面软匹配会拉开分差
            # 分数: F0 距离 + 语速差 + 能量差
            score = abs(info["f0_med"] - spec["f0"])
            score += 25 * abs(RATE_RANK[info["rate_bucket"]] - RATE_RANK[spec["rate"]])
            score += 25 * abs(ENERGY_RANK[info["energy_bucket"]] - ENERGY_RANK[spec["energy"]])
            # N 音色轻微偏好男声 (除 future_f / citizen_new_n)
            if spec["gender"] == "N":
                if vid in ("citizen_new_n",) and g == "F":
                    score -= 10
                elif g == "M":
                    score -= 5
            pairs.append((score, vid, spk))
    pairs.sort()

    assigned_voice, assigned_spk = {}, set()
    for score, vid, spk in pairs:
        if vid in assigned_voice or spk in assigned_spk:
            continue
        assigned_voice[vid] = spk
        assigned_spk.add(spk)
        print(f"   {vid:24s} -> {spk:5s} (score={score:.0f}, f0={speakers[spk]['f0_med']:.0f})", flush=True)

    missing = [v for v in VOICE_SPECS if v not in assigned_voice]
    if missing:
        print(f"   !! 未匹配音色: {missing}", flush=True)

    print("== 4. 构建参考片段 ==", flush=True)
    voices_out = {}
    for vid, spk in assigned_voice.items():
        info = speakers[spk]
        refs = {}
        for emo in ("neutral", "happy", "playful"):
            # 选 1-3 句: 目标情绪优先, 不足用 neutral 补, 再不足用任意有文本句;
            # 总长 ≤9.5s (API 硬限制 3-10s, 留 0.5s 余量防四舍五入)
            pool_emo = [c for c in info["cands"] if c["text"] and c["emo"] == emo]
            pool_neu = [c for c in info["cands"] if c["text"] and c["emo"] == "neutral"]
            pool_any = [c for c in info["cands"] if c["text"]]
            chosen, total = [], 0.0
            for c in pool_emo + pool_neu + pool_any:
                if len(chosen) >= 3:
                    break
                if c["path"] in [x["path"] for x in chosen]:
                    continue
                if chosen and (total + c["dur"]) > 9.5:
                    break
                chosen.append(c)
                total += c["dur"]
            if not chosen:
                continue
            # 拼接 (16kHz mono), 句间 150ms 静音; 单句超 9.5s 时截断音频并按比例截断文本
            ys, texts = [], []
            total = 0.0
            for c in chosen:
                y, sr = sf.read(c["path"])
                if y.ndim > 1:
                    y = y.mean(axis=1)
                if sr != 16000:
                    y = librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=16000)
                y = y.astype(np.float32)
                txt = c["text"]
                dur = len(y) / 16000
                if total + dur > 9.5:
                    if ys:
                        break                      # 已选若干句, 再加超限 → 停止
                    # 首句就超长: 截到 9.5s, 文本按比例截到最近的标点边界
                    keep = 9.5 / dur
                    y = y[: int(len(y) * keep)]
                    n = max(1, int(len(txt) * keep))
                    for p in ("，", "。", "、", "；", " "):
                        idx = txt.rfind(p, 0, n + 2)
                        if idx > 0:
                            n = idx + 1
                            break
                    txt = txt[:n]
                    dur = len(y) / 16000
                ys.append(y)
                ys.append(np.zeros(int(0.15 * 16000), dtype=np.float32))
                texts.append(txt)
                total += dur
            if total < 3.0:
                # API 要求 ≥3s; 太短就再补一句 (不会超 9.5+一句, 可接受)
                for c in info["cands"]:
                    if c["text"] and c["path"] not in [x["path"] for x in chosen]:
                        y, sr = sf.read(c["path"])
                        if y.ndim > 1:
                            y = y.mean(axis=1)
                        if sr != 16000:
                            y = librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=16000)
                        ys.append(y.astype(np.float32))
                        ys.append(np.zeros(int(0.15 * 16000), dtype=np.float32))
                        texts.append(c["text"])
                        total += len(y) / 16000
                        break
            ycat = np.concatenate(ys)
            # 轻限幅, 防爆音
            peak = np.max(np.abs(ycat))
            if peak > 0.95:
                ycat = ycat * (0.95 / peak)
            out_wav = os.path.join(REFS_DIR, f"{vid}_{emo}.wav")
            sf.write(out_wav, ycat, 16000)
            text = "，".join(t for t in texts if t)
            refs[emo] = {"path": out_wav, "text": text, "dur": round(len(ycat) / 16000, 2)}
            print(f"   {vid} [{emo}] {len(ycat)/16000:.1f}s text={text[:40]}", flush=True)
        spec = VOICE_SPECS[vid]
        voices_out[vid] = {
            "speaker": spk,
            "gender": info["gender"],
            "f0_med": round(info["f0_med"], 1),
            "rate_bucket": info["rate_bucket"],
            "energy_bucket": info["energy_bucket"],
            "family": spec["family"],
            "persona": spec["persona"],
            "source": {"dataset": info["dataset"], "speaker": spk, "license": DATASET_LICENSES[info["dataset"]]},
            "refs": refs,
        }

    # child_n 质检: 基频不够高就标记 (后面合成时决定是否加升调)
    if "child_n" in voices_out:
        f = voices_out["child_n"]["f0_med"]
        voices_out["child_n"]["child_pitch_risk"] = f < 235
        print(f"   child_n F0={f}Hz (儿童参考约需 >235Hz, 不足则标记)", flush=True)

    # 参考音频时长质检: API 要求 3-10s, 超出即告警
    bad_dur = []
    for vid, v in voices_out.items():
        for emo, ref in v["refs"].items():
            if not (3.0 <= ref["dur"] <= 10.0):
                bad_dur.append(f"{vid}/{emo}={ref['dur']}s")
    if bad_dur:
        print(f"   !! 时长越界参考: {bad_dur}", flush=True)
    else:
        print("   参考时长全部在 3-10s 区间 ✓", flush=True)

    with open(os.path.join(OUT_DIR, "voices.json"), "w", encoding="utf-8") as f:
        json.dump(voices_out, f, ensure_ascii=False, indent=1)

    # 报告
    lines = ["== 选角报告 ==", f"说话人总数: {len(speakers)} (THCHS-30 + AISHELL-1)", f"音色匹配: {len(assigned_voice)}/{len(VOICE_SPECS)}", ""]
    lines.append(f"{'音色':24s} {'说话人':7s} {'性别':4s} {'F0':>5s} {'语速':8s} {'能量':6s} {'来源':10s}")
    for vid, spk in sorted(assigned_voice.items()):
        i = speakers[spk]
        lines.append(f"{vid:24s} {spk:7s} {i['gender']:4s} {i['f0_med']:5.0f} {i['rate_bucket']:8s} {i['energy_bucket']:6s} {i['dataset']:10s}")
    # 重复/雷同检查: 同一说话人只用一次已保证; 检查 F0 接近的音色对
    used = sorted((v, speakers[s]["f0_med"]) for v, s in assigned_voice.items())
    close = [(a, b) for (a, fa), (b, fb) in zip(used, used[1:]) if abs(fa - fb) < 8]
    if close:
        lines.append("")
        lines.append(f"注意: F0 接近的音色对 (可能听感雷同): {close}")
    with open(os.path.join(OUT_DIR, "cast_report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[-6:]), flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
