# -*- coding: utf-8 -*-
"""
synthesize.py — GPT-SoVITS 批量合成小镇对话音频
====================================================
输入: scripts/voice/out/lines.json   (台词清单, extract_dialogs.py 生成)
      scripts/voice/out/voices.json  (音色与参考片段, cast_references.py 生成)
      http://127.0.0.1:8000 推理 API (需先启动 启动API.bat)
输出: marxism/public/audio/dialog/{line_id}.mp3   (32kbps 单声道)
      marxism/public/audio/manifest.json

增量: 已存在的 mp3 跳过; --force 全部重合成
用法: runtime\\python.exe synthesize.py [--force] [--only VOICE1,VOICE2]
"""
import os, sys, json, time, base64, zlib, subprocess, argparse, urllib.request
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent.parent      # marxism/
OUT = BASE / "scripts" / "voice" / "out"
AUDIO_DIR = BASE / "public" / "audio" / "dialog"
FFMPEG = r"D:\GPT-SoVITS-v5\GPT-SoVITS-v2pro-20261006\runtime\ffmpeg.exe"
API = "http://127.0.0.1:8000/infer_ref"

MODEL_DESC = "GPT-SoVITS s1v3 + s2Gv2ProPlus（零样本克隆）"


def stable_seed(s: str) -> int:
    return zlib.crc32(s.encode("utf-8")) % (2 ** 31 - 1)


# ---- 退化语速质检 -----------------------------------------------------------
# 实测结论 (test_isolate.py / test_params.py):
# 1. 短文本 AR 过早停止(EOS 提前)的根因是 (文本, 参考音频) 组合, 与种子/温度/切分方式无关
#    —— 同种子下换任何推理参数输出逐字节一致;
# 2. 换同音色其它参考(neutral 等)可救一部分;
# 3. 大 crc32 种子(1e7-1e9)在部分文本上 0/9 全败, 而小种子(1-12)合格率 2/10~6/10。
# 中文正常对话 4-6 字/s, >6.5 判退化, 触发重试。
RATE_LIMIT = 6.5          # 字/s, 超过即判退化
MAX_ATTEMPTS = 20         # 每条最多推理次数(含首次)


def is_degenerate(text: str, dur: float) -> bool:
    """语速异常(AR 过早停止产生的截断音频)"""
    if dur <= 0:
        return True
    return len(text) / dur > RATE_LIMIT


def ref_plan(v: dict, emotion: str):
    """参考去重有序列表: 指定情绪 -> neutral -> 其余变体"""
    refs = v.get("refs", {})
    order = [emotion, "neutral"]
    order += [k for k in refs if k not in order]
    seen, out = set(), []
    for k in order:
        if k in refs and k not in seen:
            seen.add(k)
            out.append((k, refs[k]))
    return out


def attempt_plan(ln: dict, v: dict):
    """(ref_key, ref, seed) 尝试序列。
    保情绪首试 -> neutral+原种子保底 -> 小种子扫 neutral -> 小种子扫原情绪 -> 其它参考。"""
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

    add(emo, base)                    # 1.  intended render
    add("neutral", base)              # 2.  neutral + crc32 (隔离实验验证有效)
    for s in range(1, 13):            # 3.  小种子扫 neutral (合格率最高)
        add("neutral", s)
    for s in range(1, 5):             # 4.  小种子扫原情绪(尽量保情绪色彩)
        add(emo, s)
    for k in refs:                    # 5.  其余参考变体兜底
        if k not in (emo, "neutral"):
            add(k, base)
            for s in (1, 2, 3):
                add(k, s)
    # 去重
    seen, out = set(), []
    for item in seq:
        key = (item[0], item[2])
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def render(ln: dict, ref: dict, seed: int, tag: int):
    """单次推理, 返回 (tmp_wav_path, dur); 失败抛异常"""
    with open(ref["path"], "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    payload = {
        "model_name": "",
        "ref_audio_b64": b64,
        "text": ln["text"],
        "text_lang": "中文",
        "prompt_text": ref["text"],
        "prompt_text_lang": "中文",
        "top_k": 10,
        "top_p": 1.0,
        "temperature": 1.0,
        "text_split_method": "按标点符号切",
        "batch_size": 1,
        "speed_facter": 1.0,
        "media_type": "wav",
        "seed": seed,
    }
    r = http_json(API, payload)
    if not r.get("audio_url"):
        raise RuntimeError(r.get("msg", "empty audio_url"))
    tmp_wav = AUDIO_DIR / f"_tmp_{ln['id']}_{tag}.wav"
    http_download(r["audio_url"], tmp_wav)
    dur = wav_duration(tmp_wav)
    return tmp_wav, dur


def synthesize_line(ln: dict, v: dict):
    """带退化重试的合成。返回 (tmp_wav, dur, ref_key, attempts)"""
    plan = attempt_plan(ln, v)
    if not plan:
        raise RuntimeError("no_ref")
    attempts, tried = [], 0
    winner = None
    for ref_key, ref, seed in plan:
        if tried >= MAX_ATTEMPTS:
            break
        # API 硬限制: 参考音频须在 3-10s
        if not (3.0 <= ref.get("dur", 0) <= 10.0):
            continue
        tried += 1
        try:
            tmp_wav, dur = render(ln, ref, seed, tried)
        except Exception:
            continue
        attempts.append((dur, ref_key, tmp_wav))
        if not is_degenerate(ln["text"], dur):
            winner = (tmp_wav, dur, ref_key)
            break
    # 选出保留文件: 有合格者用合格者; 全退化则保留最长的一条(尽力而为)
    if winner:
        keep = winner[0]
        result = winner + (len(attempts),)
    else:
        if not attempts:
            raise RuntimeError("all_attempts_failed")
        dur, ref_key, tmp_wav = max(attempts, key=lambda x: x[0])
        keep = tmp_wav
        result = (tmp_wav, dur, ref_key, len(attempts))
    # 清理落选的临时文件
    for dur, ref_key, tmp_wav in attempts:
        if tmp_wav != keep:
            try:
                tmp_wav.unlink()
            except OSError:
                pass
    return result


def http_json(url, payload, timeout=180, retries=2):
    data = json.dumps(payload).encode("utf-8")
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
    raise last


def http_download(url, dest, timeout=180):
    with urllib.request.urlopen(url, timeout=timeout) as r, open(dest, "wb") as f:
        f.write(r.read())


def wav_to_mp3(wav_path, mp3_path):
    """32kbps 单声道 mp3 + 响度归一化"""
    cmd = [FFMPEG, "-y", "-v", "error", "-i", str(wav_path),
           "-af", "loudnorm=I=-15:TP=-1.5:LRA=11",
           "-codec:a", "libmp3lame", "-b:a", "32k", "-ac", "1",
           str(mp3_path)]
    subprocess.run(cmd, check=True, capture_output=True)


def wav_duration(wav_path):
    import soundfile as sf
    info = sf.info(str(wav_path))
    return round(info.duration, 2)


def mp3_duration(mp3_path):
    """ffprobe 实测 mp3 时长 (增量运行时回填 manifest, 避免跳过条目时长为 0)"""
    try:
        ffprobe = FFMPEG.replace("ffmpeg.exe", "ffprobe.exe")
        out = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", str(mp3_path)],
                             check=True, capture_output=True, text=True)
        return round(float(out.stdout.strip()), 2)
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="忽略已存在文件, 全部重合成")
    ap.add_argument("--only", default="", help="只合成指定音色, 逗号分隔")
    ap.add_argument("--limit", type=int, default=0, help="最多合成几条(调试用)")
    args = ap.parse_args()

    lines = json.load(open(OUT / "lines.json", encoding="utf-8"))["lines"]
    voices = json.load(open(OUT / "voices.json", encoding="utf-8"))
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

    print(f"待合成: {len(todo)} / {len(lines)} 条", flush=True)

    failed, done, retried = [], 0, 0
    t0 = time.time()
    for ln in todo:
        vid = ln["voice"]
        v = voices.get(vid)
        if not v:
            failed.append((ln["id"], "no_voice"))
            continue
        try:
            tmp_wav, dur, ref_key, attempts = synthesize_line(ln, v)
            mp3 = AUDIO_DIR / f"{ln['id']}.mp3"
            wav_to_mp3(tmp_wav, mp3)
            tmp_wav.unlink()
            ln["duration"] = dur
            ln["file"] = f"audio/dialog/{ln['id']}.mp3"
            done += 1
            if attempts > 1:
                retried += 1
                rate = len(ln["text"]) / dur if dur else 999
                print(f"  RETRY {ln['id']}: {attempts}次尝试 -> {dur}s "
                      f"({rate:.1f}字/s, ref={ref_key})", flush=True)
            if done % 20 == 0:
                el = time.time() - t0
                print(f"  {done}/{len(todo)} 用时{el/60:.1f}min 均速{done/el:.1f}条/s", flush=True)
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
            "family": v["family"],
            "gender": v["gender"],
            "persona": v["persona"],
            "source": v["source"],
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

    print(f"\nDONE 成功 {done}, 失败 {len(failed)}, 退化重试 {retried} 条", flush=True)
    if failed:
        print("失败列表:", flush=True)
        for fid, msg in failed[:30]:
            print(f"  {fid}: {msg}", flush=True)
    print(f"manifest: {len(dialogs)} 个对话, {manifest['totalFiles']} 个音频文件", flush=True)


if __name__ == "__main__":
    main()
