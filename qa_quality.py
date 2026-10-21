# -*- coding: utf-8 -*-
"""
qa_quality.py — 音质保真质检 (替代 qa_deep.py)
===============================================
qa_deep.py 的两个问题:
  1. librosa.yin 在本环境对 20ms 短帧全部返回 0 -> f0_ok 恒为 False ->
     误判大量文件为「塌陷」;
  2. 只看 rms/时长, 抓不到「听起来不像这个人」这种**音色丢失**。

本脚本用 qmetrics.py (自相关 F0, 不依赖 librosa) 并新增核心指标:
    f0_dev = |f0_合成 - f0_参考| / f0_参考
  这是「人机感」最直接的量化 —— 零样本克隆丢了音色, 听起来就是通用嗓。

判定:
  塌陷   speech_ratio<0.35 / speech_rms<0.008 / dur<0.4
  音色失真 f0_dev > 25%
  偏小   speech_rms < 0.05
  平淡   f0_std<12 或 f0_range<35 (念稿感)
  碎片   sil_segs 过多 (相对时长)

用法: runtime\\python.exe qa_quality.py [目录或文件...]
"""
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, r"D:\GPT-SoVITS-v5")
import qmetrics

ROOT = Path(r"D:\GPT-SoVITS-v5")
VOICES_SR = ROOT / "marxism" / "scripts" / "voice" / "out" / "voices_sr.json"
LINES = ROOT / "marxism" / "scripts" / "voice" / "out" / "lines.json"

REF_F0 = {}
_cache = {}


def ref_f0(path):
    if path not in REF_F0:
        if path not in _cache:
            _cache[path] = qmetrics.analyze(path).get("f0_med", 0.0) or 0.0
        REF_F0[path] = _cache[path]
    return REF_F0[path]


def main():
    targets = sys.argv[1:] or [str(ROOT / "marxism" / "public" / "audio" / "dialog")]
    lines = {l["id"]: l for l in json.load(open(LINES, encoding="utf-8"))["lines"]}
    vsr = json.load(open(VOICES_SR, encoding="utf-8"))

    files = []
    for t in targets:
        p = Path(t)
        if p.is_dir():
            files += sorted(p.glob("*.mp3"))
        else:
            files.append(p)
    print(f"分析 {len(files)} 个文件\n", flush=True)

    rows = []
    n_col = n_voice = n_quiet = n_flat = 0
    for f in files:
        lid = f.stem
        m = qmetrics.analyze(f, chars=len(lines[lid]["text"]) if lid in lines else None)
        row = {"file": f.name, **m}
        ln = lines.get(lid)
        if ln:
            v = vsr.get(ln["voice"])
            if v:
                emo = ln.get("emotion", "neutral")
                r = v["refs"].get(emo) or v["refs"]["neutral"]
                rf0 = ref_f0(r["path"])
                of0 = m.get("f0_med", 0.0)
                row["ref_f0"] = rf0
                row["f0_dev"] = round(abs(of0 - rf0) / rf0, 3) if (rf0 > 0 and of0 > 0) else None
        rows.append(row)
        if m.get("collapsed"):
            n_col += 1
        if row.get("f0_dev") is not None and row["f0_dev"] > 0.25:
            n_voice += 1
        if m.get("quiet"):
            n_quiet += 1
        if m.get("monotone"):
            n_flat += 1
        tag = ""
        if m.get("collapsed"):
            tag += "  <<塌陷"
        if row.get("f0_dev") is not None and row["f0_dev"] > 0.25:
            tag += "  <<音色失真"
        if m.get("quiet"):
            tag += "  <偏小"
        if m.get("monotone"):
            tag += "  <平淡"
        fd = row.get("f0_dev")
        print(f"{f.name:28s} dur={m.get('dur', 0):6.2f} spR={m.get('speech_ratio', 0):.2f} "
              f"spRms={m.get('speech_rms', 0):.4f} sil={m.get('sil_segs', 0):3d} "
              f"f0={m.get('f0_med', 0):6.1f}/{row.get('ref_f0', 0) or 0:6.1f} "
              f"dev={fd if fd is None else round(fd * 100):>4} "
              f"f0rg={m.get('f0_range', 0):6.1f}{tag}", flush=True)

    print(f"\n===== 汇总 =====")
    print(f"总计 {len(rows)} | 塌陷 {n_col} | 音色失真 {n_voice} | 偏小 {n_quiet} | 平淡 {n_flat}")
    devs = [r["f0_dev"] for r in rows if r.get("f0_dev") is not None]
    if devs:
        print(f"音色保真 f0_dev: 均值 {st.mean(devs) * 100:.1f}%  中位 {st.median(devs) * 100:.1f}%  "
              f"最大 {max(devs) * 100:.1f}%  超阈(>25%) {sum(1 for d in devs if d > 0.25)} 条")
    rmss = [r["rms"] for r in rows if (r.get("rms") or 0) > 1e-3]
    if rmss:
        import math
        dbs = [20 * math.log10(v) for v in rmss]
        print(f"电平一致性: 均值 {st.mean(dbs):.1f}dB  标准差 {st.pstdev(dbs):.2f}dB  "
              f"极差 {max(dbs) - min(dbs):.2f}dB  (无 loudnorm, 期望 < 4dB)")

    out = Path(targets[0]).parent / "qa_quality.json" if Path(targets[0]).is_dir() \
        else Path("qa_quality.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f"-> {out}")


if __name__ == "__main__":
    main()
