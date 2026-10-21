# -*- coding: utf-8 -*-
"""
synthesize_v3.py — 音质保真版批量合成 (最终版, 替代 synthesize.py)
==================================================================
本版基于 ab_test5/6/7 的实测结论, 修复了「声音太人机」的**四个真实根因**:

  [1] cfg_rate 拧反了 —— 最核心的根因
      v5dev 的 cfg_rate 是 CFM 流匹配的 CFG 引导强度:
          velocity = velocity + cfg * (velocity - negative)
      其中 negative 分支是 `drop_audio_cond=True` 的「丢音色条件」前向。
      cfg 越低, 负向分支权重越大, 音色条件被压过 -> 模型退化成
      **没有个人特征的通用默认嗓音** —— 这就是听感上的「人机」。

      实测 (原始 wav, 8 台词 x 2 seed, 指标 f0_match = 合成基频与参考基频的相对偏差):
          cfg   f0_match   偏差>20% 条数   rms
          0.0     28.7%          4          0.0450
          0.5     13.4%          3          0.0670
          1.0      3.3%          0          0.0907   <- 采用
          1.3      3.4%          0          0.1012
          1.6      3.9%          0          0.1102
      典型案例 philosopher_n(参考 121.8Hz):
          cfg=0.0 -> 231.3Hz (男声变女声!)   cfg=1.0 -> 124.5Hz (完全一致)
      历史用的 0.6 是次优区间, 且该结论建立在被 loudnorm 污染的数据上。

  [2] ffmpeg 单遍 loudnorm 必须删除
      实测 33 条样本的电平离散度 (rms 标准差):
          原始 wav        1.59 dB   <- 模型输出本身已经非常一致
          单遍 loudnorm  16.56 dB   <- 归一化后离散度暴涨 15dB!
          两遍 loudnorm  16.28 dB   <- 两遍法同样坏(问题在 LUFS 短句积分测量)
          峰值归一        2.00 dB
          裸转码          1.59 dB
      结论: 短句上的 LUFS 积分测量本身不可靠, 强行归一化才是「忽大忽小」的
      真凶。模型输出电平天然就在健康区间, 保留原样即可。

  [3] 参考音频: 48kHz 超分 + 单句连续 (由 rebuild_refs.py 产出)
      原做法把 1-3 句用 150ms 硬静音拼成参考, 断裂节奏会写进语义 prompt。
      实测退化率 40% -> 0%。

  [4] 切分: cut0 + fragment_interval=0
      按标点切会造成碎片拼接感 (段内静音 3.2 段/条 -> 0.8 段/条)。

  [5] 采样参数: top_k=5, temperature=0.7
      实测 (cfg=1.0, 8 台词 x 2 seed):
          配置       f0_match   塌陷   韵律起伏f0_rg   语速
          k5_t0.7      2.6%      0        248.5       4.01
          k10_t0.7     4.2%      0        197.7       4.28
          k10_t0.85    3.6%      0        224.4       4.18
          k10_t1.0     2.9%      1        233.3       9.48
          k5_t1.0      3.6%      1        222.9       9.33
          k15_t1.0     3.6%      1        220.8       9.70
          k20_t1.0     3.7%      1        238.4       9.72
      所有 temperature=1.0 的组合都出现内容塌陷, temperature<=0.85 全部干净。
      k5_t0.7 同时拿到最高韵律起伏(248.5)与最低塌陷率, 且语速落在中文自然
      叙述区间(3.5~5.5 字/s)。降低 temperature 让 AR 语义采样更收敛 -> 更稳。

其他:
  - 模型: v5dev + BigVGAN 48kHz 神经声码器 (频谱质心 266 -> 507)
  - 编码: 96kbps / 32kHz (8-12kHz 能量 0.0000 -> 0.0002)
  - 质检升级: 新增「音色保真度 f0_match」判定 —— 比 rms 更能抓「人机」

用法: runtime\\python.exe synthesize_v3.py [--force] [--only VOICE] [--limit N]
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.request
import zlib
from collections import defaultdict
from pathlib import Path

ROOT = Path(r"D:\GPT-SoVITS-v5")
sys.path.insert(0, str(ROOT))
import qmetrics

BASE = ROOT / "marxism"
GSV = ROOT / "GPT-SoVITS-v2pro-20261006"
OUT = BASE / "scripts" / "voice" / "out"
AUDIO_DIR = BASE / "public" / "audio" / "dialog"
FFMPEG = GSV / "runtime" / "ffmpeg.exe"
FFPROBE = GSV / "runtime" / "ffprobe.exe"
API = "http://127.0.0.1:8001"          # v5 实例 (api_v2.py + tts_infer_v5.yaml)

VOICES_JSON = OUT / "voices_sr.json"   # 超分 + 单句参考
LINES_JSON = OUT / "lines.json"

MODEL_DESC = "GPT-SoVITS v5dev (s1v3 + s2Gv5dev + BigVGAN 48kHz) 零样本克隆"

# ---- 参数 (全部经 ab_test5 实测确定) ----
CFG_RATE = 1.0        # [1] 音色保真最优 (f0_match 3.3%, 0 条超 20%)
TOP_K = 5              # [5] 采样: k5_t0.7 组 0 塌陷 + 韵律起伏最高
TEMPERATURE = 0.7      # [5] temp<=0.85 全部 0 塌陷; temp=1.0 每组都塌 1 条
SPLIT_METHOD = "cut0"  # [4] 不切
FRAGMENT_INTERVAL = 0.0

# ---- 质检阈值 ----
RATE_LIMIT = 6.5          # 字/s, 超过判语速异常
F0_MATCH_LIMIT = 0.25     # 合成基频与参考基频的相对偏差上限
MIN_DUR = 0.4             # 短于此视为塌陷
MAX_ATTEMPTS = 24

REF_F0_CACHE = {}


def stable_seed(s: str) -> int:
    return zlib.crc32(s.encode("utf-8")) % (2 ** 31 - 1)


def ref_f0(path):
    """参考音频自身的基频 (缓存) —— 音色保真度判定的基准"""
    if path not in REF_F0_CACHE:
        REF_F0_CACHE[path] = qmetrics.analyze(path).get("f0_med", 0.0) or 0.0
    return REF_F0_CACHE[path]


def http_bytes(url, payload, timeout=600, retries=2):
    """POST 返回原始字节 (api_v2.py 的 /tts 直接吐 wav 流, 不是 JSON)"""
    data = json.dumps(payload).encode("utf-8")
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=data,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
    raise last


def analyze_wav(path, chars=None):
    return qmetrics.analyze(path, chars=chars)


def judge(m, r_f0, chars=0):
    """返回 (是否退化, 退化原因列表)

    判定项:
      塌陷   —— speech_ratio 过低 / 语音电平近零 / 时长过短
      语速   —— 字/s 超限 (内容被截断)
      音色   —— f0 与参考偏差过大 (听起来不像这个人 -> 「人机感」)
    """
    reasons = []
    if m.get("collapsed"):
        reasons.append("塌陷")
    if m.get("dur", 0) < MIN_DUR:
        reasons.append("过短")
    if chars and m.get("dur", 0) > 0 and chars / m["dur"] > RATE_LIMIT:
        reasons.append(f"语速{chars / m['dur']:.1f}字/s")
    if r_f0 > 0 and m.get("f0_med", 0) > 0:
        dev = abs(m["f0_med"] - r_f0) / r_f0
        if dev > F0_MATCH_LIMIT:
            reasons.append(f"音色偏差{dev * 100:.0f}%")
    return (len(reasons) > 0), reasons


def ref_plan(v: dict, emotion: str):
    refs = v.get("refs", {})
    order = [emotion, "neutral"] + [k for k in refs if k not in (emotion, "neutral")]
    seen, out = set(), []
    for k in order:
        if k in refs and k not in seen:
            seen.add(k)
            out.append((k, refs[k]))
    return out


def attempt_plan(ln: dict, v: dict):
    """(ref_key, ref, seed) 尝试序列 —— 先目标情绪, 再换参考, 最后扫种子"""
    plan = ref_plan(v, ln.get("emotion", "neutral"))
    if not plan:
        return []
    refs = dict(plan)
    emo = ln.get("emotion", "neutral")
    base = stable_seed(ln["id"])
    seq = []

    def add(k, seed):
        if k in refs:
            seq.append((k, refs[k], seed))

    add(emo, base)
    add("neutral", base)
    for s in (1, 2, 3, 5, 7, 11, 13, 17, 19, 23):
        add("neutral", s)
    for s in (1, 2, 3, 5, 7, 11):
        add(emo, s)
    for k in refs:
        if k not in (emo, "neutral"):
            add(k, base)
            for s in (1, 2, 3):
                add(k, s)
    seen, out = set(), []
    for item in seq:
        key = (item[0], item[2])
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def render(ln: dict, ref: dict, seed: int, tag: int):
    payload = {
        "text": ln["text"],
        "text_lang": "zh",
        "ref_audio_path": ref["path"],
        "prompt_text": ref["text"],
        "prompt_lang": "zh",
        "top_k": TOP_K,
        "top_p": 1.0,
        "temperature": TEMPERATURE,
        "text_split_method": SPLIT_METHOD,     # [4] 不切
        "batch_size": 1,
        "speed_factor": 1.0,
        "fragment_interval": FRAGMENT_INTERVAL,  # [4] 去掉段间硬静音
        "media_type": "wav",
        "seed": seed,
        "cfg_rate": CFG_RATE,                   # [1] 音色保真
    }
    r = http_bytes(f"{API}/tts", payload)
    if not r or len(r) < 1000:
        raise RuntimeError(f"empty/short response: {len(r) if r else 0} bytes")
    tmp = AUDIO_DIR / f"_tmp_{ln['id']}_{tag}.wav"
    tmp.write_bytes(r)
    return tmp


def synthesize_line(ln: dict, v: dict):
    plan = attempt_plan(ln, v)
    if not plan:
        raise RuntimeError("no_ref")
    attempts, tried, winner = [], 0, None
    chars = len(ln["text"])
    for ref_key, ref, seed in plan:
        if tried >= MAX_ATTEMPTS:
            break
        if not (3.0 <= ref.get("dur", 0) <= 10.0):
            continue
        tried += 1
        try:
            tmp = render(ln, ref, seed, tried)
        except Exception as e:
            if tried <= 2:
                print(f"    [debug] attempt {tried} ref={ref_key} seed={seed} "
                      f"refpath={ref.get('path')} -> {type(e).__name__}: {e}", flush=True)
            continue
        m = analyze_wav(tmp, chars=chars)
        r_f0 = ref_f0(ref["path"])
        bad, reasons = judge(m, r_f0, chars)
        attempts.append((m, r_f0, ref_key, tmp, reasons))
        if not bad:
            winner = (tmp, m, r_f0, ref_key)
            break
    if winner:
        keep, m, r_f0, ref_key = winner
        result = (keep, m, r_f0, ref_key, len(attempts), [])
    else:
        if not attempts:
            raise RuntimeError("all_attempts_failed")
        # 全退化: 取「最接近正常」的一条 (音色偏差最小 + 时长够长)
        best = min(attempts, key=lambda x: (
            0 if x[1].get("collapsed") else 1,
            abs(x[1].get("f0_med", 0) - x[2]) / max(x[2], 1),
            -x[1].get("dur", 0)))
        keep = best[3]
        result = (keep, best[0], best[1], best[2], len(attempts), best[4])
    for m, r_f0, ref_key, tmp, reasons in attempts:
        if tmp != keep:
            try:
                tmp.unlink()
            except OSError:
                pass
    return result


def wav_to_mp3(wav_path, mp3_path, br=96, sr=32000):
    """96kbps / 32kHz 单声道。

    [2] 关键: **不做 loudnorm**。实测 ffmpeg 单遍/两遍 loudnorm 都会把
    原本只有 1.59dB 离散度的电平搅成 16dB+ 离散度 (忽大忽小)。
    模型输出电平天然就在 -30~-15 dBFS 舒适区, 原样保留即可。
    """
    cmd = [str(FFMPEG), "-y", "-v", "error", "-i", str(wav_path),
           "-codec:a", "libmp3lame", "-b:a", f"{br}k", "-ar", str(sr), "-ac", "1",
           str(mp3_path)]
    subprocess.run(cmd, check=True, capture_output=True)


def mp3_duration(mp3_path):
    try:
        out = subprocess.run([str(FFPROBE), "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", str(mp3_path)], check=True,
                             capture_output=True, text=True)
        return round(float(out.stdout.strip()), 2)
    except Exception:
        return 0.0


def main():
    global CFG_RATE
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--cfg", type=float, default=CFG_RATE)
    ap.add_argument("--report", default="")
    args = ap.parse_args()

    CFG_RATE = args.cfg

    lines = json.load(open(LINES_JSON, encoding="utf-8"))["lines"]
    voices = json.load(open(VOICES_JSON, encoding="utf-8"))
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    todo = []
    for ln in lines:
        if only and ln["voice"] not in only:
            continue
        mp3 = AUDIO_DIR / f"{ln['id']}.mp3"
        if not args.force and mp3.exists():
            continue
        todo.append(ln)
    if args.limit:
        todo = todo[: args.limit]

    print(f"待合成: {len(todo)} / {len(lines)} 条  "
          f"(v5dev + 超分单句参考 + cut0 + cfg={CFG_RATE} + 96kbps/32k + 无loudnorm)",
          flush=True)

    failed, done, retried, degraded = [], 0, 0, []
    report_rows = []
    t0 = time.time()
    for ln in todo:
        v = voices.get(ln["voice"])
        if not v:
            failed.append((ln["id"], "no_voice"))
            continue
        try:
            tmp, m, r_f0, ref_key, attempts, reasons = synthesize_line(ln, v)
            mp3 = AUDIO_DIR / f"{ln['id']}.mp3"
            wav_to_mp3(tmp, mp3)
            tmp.unlink(missing_ok=True)
            dur = m.get("dur", 0.0)
            ln["duration"] = dur
            ln["file"] = f"audio/dialog/{ln['id']}.mp3"
            done += 1
            f0m = m.get("f0_med", 0.0)
            dev = abs(f0m - r_f0) / r_f0 if (r_f0 > 0 and f0m > 0) else None
            report_rows.append({
                "id": ln["id"], "voice": ln["voice"], "chars": len(ln["text"]),
                "dur": dur, "rate": round(len(ln["text"]) / dur, 2) if dur else None,
                "rms": m.get("rms"), "f0": f0m, "ref_f0": r_f0,
                "f0_dev": round(dev, 3) if dev is not None else None,
                "f0_range": m.get("f0_range"), "sil_segs": m.get("sil_segs"),
                "speech_ratio": m.get("speech_ratio"), "attempts": attempts,
                "ref": ref_key, "degraded": bool(reasons),
                "reasons": reasons,
            })
            if attempts > 1:
                retried += 1
                print(f"  RETRY {ln['id']}: {attempts}次 -> {dur}s "
                      f"f0={f0m:.0f}/{r_f0:.0f} ref={ref_key}", flush=True)
            if reasons:
                degraded.append((ln["id"], dur, reasons))
                print(f"  !! DEGEN {ln['id']}: dur={dur}s f0={f0m:.0f}/{r_f0:.0f} "
                      f"{'/'.join(reasons)}", flush=True)
            if done % 20 == 0:
                el = time.time() - t0
                print(f"  {done}/{len(todo)} 用时{el / 60:.1f}min 均速{done / el:.1f}条/s", flush=True)
        except Exception as e:
            failed.append((ln["id"], str(e)[:80]))
            print(f"  FAIL {ln['id']}: {e}", flush=True)

    # ---- manifest ----
    by_dialog = defaultdict(list)
    for ln in lines:
        if "file" in ln or (AUDIO_DIR / f"{ln['id']}.mp3").exists():
            by_dialog[ln["dialog_id"]].append(ln)

    dialogs = {}
    for did, group in by_dialog.items():
        group.sort(key=lambda x: x["id"])
        parts = []
        for ln in group:
            mp3 = AUDIO_DIR / f"{ln['id']}.mp3"
            if not mp3.exists():
                continue
            dur = ln.get("duration") or mp3_duration(mp3)
            parts.append({"file": f"audio/dialog/{ln['id']}.mp3", "duration": dur})
        if parts:
            dialogs[did] = {"voice": group[0]["voice"], "parts": parts}

    manifest_voices = {}
    for vid, v in voices.items():
        manifest_voices[vid] = {
            "family": v["family"], "gender": v["gender"],
            "persona": v["persona"], "source": v["source"],
        }

    manifest = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": MODEL_DESC,
        "totalDialogs": len(dialogs),
        "totalFiles": sum(len(d["parts"]) for d in dialogs.values()),
        "dialogs": dialogs,
        "voices": manifest_voices,
    }
    with open(BASE / "public" / "audio" / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    if report_rows:
        rp = Path(args.report) if args.report else (OUT / "synth_report.json")
        with open(rp, "w", encoding="utf-8") as f:
            json.dump(report_rows, f, ensure_ascii=False, indent=1)
        devs = [r["f0_dev"] for r in report_rows if r.get("f0_dev") is not None]
        if devs:
            import statistics as st
            print(f"\n音色保真 f0_dev: 均值 {st.mean(devs) * 100:.1f}%  "
                  f"最大 {max(devs) * 100:.1f}%  超阈 {sum(1 for d in devs if d > F0_MATCH_LIMIT)} 条",
                  flush=True)
        print(f"-> {rp}", flush=True)

    print(f"\nDONE 成功 {done}, 失败 {len(failed)}, 重试 {retried}, 仍退化 {len(degraded)}", flush=True)
    for fid, msg in failed[:20]:
        print(f"  FAIL {fid}: {msg}", flush=True)
    for fid, dur, reasons in degraded[:25]:
        print(f"  DEGEN {fid}: dur={dur}s {'/'.join(reasons)}", flush=True)
    print(f"manifest: {len(dialogs)} 个对话, {manifest['totalFiles']} 个音频文件", flush=True)


if __name__ == "__main__":
    main()
