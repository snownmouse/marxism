# -*- coding: utf-8 -*-
"""
synthesize_v2.py — 【已废弃, 请改用 synthesize_v3.py】

本脚本包含两个**已被实测推翻**的错误配置, 保留仅供对照:
  1) `cfg_rate=0.6` —— 结论来自被 ffmpeg 单遍 loudnorm 污染的测量数据。
     真实结论是 cfg=1.0 音色保真度最优 (f0_match 3.3% vs 13.4%),
     cfg 过低会让模型退化成没有个人特征的通用嗓音 —— 即「人机感」的根因。
  2) `loudnorm=I=-15:TP=-1.5:LRA=11` —— 实测把原本 1.59dB 的电平离散度
     搅成 16.56dB, 造成 220 条音频忽大忽小。

详见 VOICE_QUALITY_NOTES.md 与 synthesize_v3.py 头部注释。

原文档(保留):
=============================================================================
synthesize_v2.py — 音质保真版批量合成 (替代 synthesize.py)
====================================================
针对「太人机了 / 音质有问题」的四处修复, 全部经 A/B 实测确认:

  1) 参考音频: 16kHz → 48kHz (AP_BWE 超分) + 单句连续 (rebuild_refs.py 产出)
     实测: 退化率 40% → 0%  (根因: 16k 参考缺高频, 语义 prompt 被污染)
  2) 切分方式: 按标点切 → 不切 (cut0), 段间静音 0.3s → 0
     实测: 段内静音 3.2 段/条 → 0.8 段/条 (碎片拼接感消失)
  3) 模型: v2ProPlus (32kHz) → v5dev (BigVGAN 48kHz 神经声码器)
     实测: 频谱质心 266 → 507
  4) 编码: 32kbps/48kHz → 96kbps/32kHz
     实测: 8-12kHz 能量从 0 恢复到 0.0002+ (不再削掉刚做出来的高频)
  +) cfg_rate: v5dev 默认 1.30 会让部分样本音量塌陷, 改用 0.6
     ^^^^^^ 这一条是错的! 见上方说明。真实最优是 1.0。

质检除语速外, 增加「音量一致性」检查(抓 rms 塌陷的近静音样本)。

用法: runtime\\python.exe synthesize_v2.py [--force] [--only VOICE] [--limit N]
"""
import os, sys, json, time, zlib, argparse, subprocess, urllib.request
from pathlib import Path
from collections import defaultdict

ROOT = Path(r"D:\GPT-SoVITS-v5")
BASE = ROOT / "marxism"
GSV = ROOT / "GPT-SoVITS-v2pro-20261006"
OUT = BASE / "scripts" / "voice" / "out"
AUDIO_DIR = BASE / "public" / "audio" / "dialog"
FFMPEG = GSV / "runtime" / "ffmpeg.exe"
FFPROBE = GSV / "runtime" / "ffprobe.exe"
API = "http://127.0.0.1:8001"          # v5 实例 (api_v2.py)

VOICES_JSON = OUT / "voices_sr.json"   # 超分+单句 参考
LINES_JSON = OUT / "lines.json"

MODEL_DESC = "GPT-SoVITS v5dev (s1v3 + s2Gv5dev + BigVGAN 48kHz) 零样本克隆"

RATE_LIMIT = 6.5          # 字/s, 超过判退化
RMS_LIMIT = 0.05          # 低于此值判「近静音塌陷」
MAX_ATTEMPTS = 24


def stable_seed(s: str) -> int:
    return zlib.crc32(s.encode("utf-8")) % (2 ** 31 - 1)


def is_degenerate(text: str, dur: float, rms: float) -> bool:
    if dur <= 0:
        return True
    if len(text) / dur > RATE_LIMIT:
        return True
    if rms < RMS_LIMIT:
        return True
    return False


def http_bytes(url, payload, timeout=300, retries=2):
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


def wav_rms(path):
    """用 ffmpeg volumedetect 取 mean_volume (dBFS) -> rms 线性值"""
    try:
        out = subprocess.run([str(FFMPEG), "-v", "info", "-i", str(path), "-af", "volumedetect",
                              "-f", "null", "-"], check=False, capture_output=True, text=True)
        for line in (out.stderr or "").splitlines():
            if "mean_volume:" in line:
                db = float(line.split("mean_volume:")[1].replace("dB", "").strip())
                return 10 ** (db / 20.0)
    except Exception:
        pass
    return 0.0


def wav_duration(path):
    try:
        out = subprocess.run([str(FFPROBE), "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", str(path)], check=True, capture_output=True, text=True)
        return round(float(out.stdout.strip()), 2)
    except Exception:
        return 0.0


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
    """(ref_key, ref, seed) 尝试序列。
    修复后单句参考质量高, 首次即大概率成功; 仍保留完整重试链以防个别组合退化。"""
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

    add(emo, base)                     # 1. 目标情绪 + 稳定种子
    add("neutral", base)               # 2. 换参考
    for s in (1, 2, 3, 5, 7, 11, 13, 17, 19, 23):   # 3. 小种子扫 neutral
        add("neutral", s)
    for s in (1, 2, 3, 5, 7, 11):       # 4. 小种子扫目标情绪
        add(emo, s)
    for k in refs:                     # 5. 其余参考兜底
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


def render(ln: dict, ref: dict, seed: int, tag: int, cfg_rate: float):
    payload = {
        "text": ln["text"],
        "text_lang": "zh",
        "ref_audio_path": ref["path"],
        "prompt_text": ref["text"],
        "prompt_lang": "zh",
        "top_k": 10,
        "top_p": 1.0,
        "temperature": 1.0,
        "text_split_method": "cut0",     # 修复2: 不切, 整句一次推理
        "batch_size": 1,
        "speed_factor": 1.0,
        "fragment_interval": 0.0,        # 修复2: 去掉段间硬静音
        "media_type": "wav",
        "seed": seed,
        "cfg_rate": cfg_rate,            # 修复: 0.6 (默认 1.30 会致音量塌陷)
    }
    r = http_bytes(f"{API}/tts", payload)
    if not r or len(r) < 1000:
        raise RuntimeError(f"empty/short response: {len(r) if r else 0} bytes")
    tmp = AUDIO_DIR / f"_tmp_{ln['id']}_{tag}.wav"
    tmp.write_bytes(r)
    dur = wav_duration(tmp)
    rms = wav_rms(tmp)
    return tmp, dur, rms


def synthesize_line(ln: dict, v: dict, args_cfg: float):
    plan = attempt_plan(ln, v)
    if not plan:
        raise RuntimeError("no_ref")
    attempts, tried, winner = [], 0, None
    for ref_key, ref, seed in plan:
        if tried >= MAX_ATTEMPTS:
            break
        if not (3.0 <= ref.get("dur", 0) <= 10.0):
            continue
        tried += 1
        try:
            tmp, dur, rms = render(ln, ref, seed, tried, args_cfg)
        except Exception as e:
            if tried <= 2:
                import traceback
                print(f"    [debug] attempt {tried} ref={ref_key} seed={seed} "
                      f"refpath={ref.get('path')} -> {type(e).__name__}: {e}", flush=True)
                traceback.print_exc()
            continue
        attempts.append((dur, rms, ref_key, tmp))
        if not is_degenerate(ln["text"], dur, rms):
            winner = (tmp, dur, rms, ref_key)
            break
    if winner:
        keep = winner[0]
        result = (winner[0], winner[1], winner[2], winner[3], len(attempts))
    else:
        if not attempts:
            raise RuntimeError("all_attempts_failed")
        # 全退化: 取「最接近正常」的一条 (时长够长且音量不塌)
        dur, rms, ref_key, tmp = max(attempts, key=lambda x: (x[1] >= RMS_LIMIT, x[0]))
        keep = tmp
        result = (tmp, dur, rms, ref_key, len(attempts))
    for dur, rms, ref_key, tmp in attempts:
        if tmp != keep:
            try:
                tmp.unlink()
            except OSError:
                pass
    return result


def wav_to_mp3(wav_path, mp3_path, br=96, sr=32000):
    """96kbps / 32kHz 单声道 (修复4)"""
    cmd = [str(FFMPEG), "-y", "-v", "error", "-i", str(wav_path),
           "-af", "loudnorm=I=-15:TP=-1.5:LRA=11",
           "-codec:a", "libmp3lame", "-b:a", f"{br}k", "-ar", str(sr), "-ac", "1",
           str(mp3_path)]
    subprocess.run(cmd, check=True, capture_output=True)


def mp3_duration(mp3_path):
    try:
        out = subprocess.run([str(FFPROBE), "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", str(mp3_path)], check=True, capture_output=True, text=True)
        return round(float(out.stdout.strip()), 2)
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--cfg", type=float, default=0.6)
    args = ap.parse_args()

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

    print(f"待合成: {len(todo)} / {len(lines)} 条  (v5dev + 超分单句参考 + cut0 + 96kbps)",
          flush=True)

    failed, done, retried, degraded = [], 0, 0, []
    t0 = time.time()
    for ln in todo:
        v = voices.get(ln["voice"])
        if not v:
            failed.append((ln["id"], "no_voice"))
            continue
        try:
            tmp, dur, rms, ref_key, attempts = synthesize_line(ln, v, args.cfg)
            mp3 = AUDIO_DIR / f"{ln['id']}.mp3"
            wav_to_mp3(tmp, mp3)
            tmp.unlink(missing_ok=True)
            ln["duration"] = dur
            ln["file"] = f"audio/dialog/{ln['id']}.mp3"
            done += 1
            if attempts > 1:
                retried += 1
                rate = len(ln["text"]) / dur if dur else 999
                print(f"  RETRY {ln['id']}: {attempts}次 -> {dur}s ({rate:.1f}字/s "
                      f"rms={rms:.3f} ref={ref_key})", flush=True)
            if is_degenerate(ln["text"], dur, rms):
                degraded.append((ln["id"], dur, rms))
                print(f"  !! DEGEN {ln['id']}: dur={dur}s rms={rms:.4f} rate={len(ln['text'])/dur:.1f}",
                      flush=True)
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

    print(f"\nDONE 成功 {done}, 失败 {len(failed)}, 重试 {retried}, 仍退化 {len(degraded)}", flush=True)
    for fid, msg in failed[:20]:
        print(f"  FAIL {fid}: {msg}", flush=True)
    for fid, dur, rms in degraded[:20]:
        print(f"  DEGEN {fid}: dur={dur}s rms={rms:.4f}", flush=True)
    print(f"manifest: {len(dialogs)} 个对话, {manifest['totalFiles']} 个音频文件", flush=True)


if __name__ == "__main__":
    main()
