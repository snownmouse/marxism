# -*- coding: utf-8 -*-
"""
extract_dialogs.py — marxism 小镇对话台词清单生成器
====================================================
输入: src/data/dialogs.json (210 条) + src/data/stages.json (8 个时期)
输出: scripts/voice/out/lines.json  (合成流水线的输入)
      scripts/voice/out/lines.csv   (人类审阅用)
      scripts/voice/out/report.txt  (统计报告)

角色 → 音色映射: ROLE_TO_VOICE (99 个细分角色 → 26 个音色, 显式字典)
情绪映射: chatType → emotion (educational=neutral / chatter=happy / quirky=playful)
文本清洗: emoji 去除、标点规范化、阿拉伯数字转中文、多音字风险标记
长句切分: > LONG_LINE_THRESHOLD 字的句子按标点切块 (块号 *_p1, *_p2 ...)
"""
import json, csv, hashlib, os, re, sys, collections

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # marxism/
DATA = os.path.join(BASE, "src", "data")
OUT = os.path.join(BASE, "scripts", "voice", "out")
os.makedirs(OUT, exist_ok=True)

LONG_LINE_THRESHOLD = 55  # 超过此字数按标点切块

# ---------------------------------------------------------------------------
# 角色 → 音色映射表 (v3.0 名册, 26 音色)
# ---------------------------------------------------------------------------
ROLE_TO_VOICE = {
    # --- A 市井百姓: chat/quirky 在下面按 id 哈希对半拆, 不在此表 ---
    # --- B 原始公社 S0 ---
    "hunter":     "tribal_m",       # 猎人 3
    "craftsman":  "tribal_m",       # 匠人(打制石器) 1
    "gatherer":   "tribal_f",       # 采集者 1
    "shaman":     "shaman_m",       # 萨满 1
    "elder":      "elder_m",        # 长老(跨 S0/S1/S7) 4
    "child":      "child_n",        # 孩童(跨 S0/S7) 2
    # --- C 奴隶制 S1 ---
    "freeman":    "freeman_m",      # 自由民 3
    "noble":      "noble_antiquity_m",  # 奴隶主 3
    "master":     "noble_antiquity_m",  # 奴隶主(封建口径) 2
    "captive":    "slave_f",        # 俘虏/奴隶 1
    "slave":      "slave_f",        # 奴隶 2
    # --- D 封建 S2-S3 ---
    "lord":       "lord_m",         # 领主 3
    "serf":       "serf_m",         # 农奴 2
    "peasant":    "serf_m",         # 贫苦农民(跨 S3/S4) 2
    "artisan":    "serf_m",         # 工匠(底层口) 1
    "doubter":    "serf_m",         # 怀疑者 1
    "priest":     "priest_m",       # 神职 2
    "philosopher":"philosopher_n",  # 哲人(跨 S2/S7) 2
    "scribe":     "philosopher_n",  # 文人书吏 1
    "thinker":    "philosopher_n",  # 民间智者(全时期) 9
    "rebel":      "rebel_m",        # 觉醒者(跨 S1/S2/S5) 3
    "masses":     "rebel_m",        # "是我们，可史上从来不写我们" 1
    # --- E 资本主义 S4-S5 ---
    "capitalist": "capitalist_m",   # 资本家 2
    "merchant":   "capitalist_m",   # 商人 1
    "trader":     "capitalist_m",   # 以物易物者(S1, 精明腔) 1
    "banker":     "banker_m",       # 银行家 4
    "general":    "banker_m",       # 将军(炮舰逻辑=资本逻辑) 1
    "worker":     "worker_m",       # 工人 7
    "striker":    "worker_m",       # 罢工者 1
    "unemployed": "worker_m",       # 失业者 1
    "engineer":   "worker_m",       # 工程师(跨 S4/S6) 2
    "tech":       "worker_m",       # 技术员 1
    "intellectual":"intellectual_m",# 知识分子 2
    "theorist":   "intellectual_m", # 理论家 1
    # --- F 社会主义过渡 S6 ---
    "cadre":      "cadre_n",        # 干部 1
    "leader":     "cadre_n",        # 领袖 1
    "party":      "cadre_n",        # 党 1
    "doctor":     "citizen_new_n",  # 医生 1
    "student":    "citizen_new_n",  # 学生 1
    "historian":  "citizen_new_n",  # 史学家 1
    "farmer":     "citizen_new_n",  # 农夫 1
    "woman":      "citizen_new_n",  # 妇女 1
    "spread":     "citizen_new_n",  # "风刮到窝棚窝棚就盖起来" 1
    # --- G 共产主义情景 S7 ---
    "resident":   "FUTURE_SPLIT",   # 未来居民 3 → 哈希拆 future_f/future_m
    "artist":     "future_f",       # 艺术家 1
    "scientist":  "future_m",       # 科学家 1
    # --- H 拟人概念 ---
    "cause":      "concept_philosophy_n",
    "essence":    "concept_philosophy_n",
    "truth":      "concept_philosophy_n",
    "knowledge":  "concept_philosophy_n",
    "necessity":  "concept_philosophy_n",
    "possibility":"concept_philosophy_n",
    "contradiction":"concept_philosophy_n",
    "change":     "concept_philosophy_n",
    "initiative": "concept_philosophy_n",
    "principal":  "concept_philosophy_n",
    "leap1":      "concept_philosophy_n",
    "leap2":      "concept_philosophy_n",
    "content":    "concept_philosophy_n",
    "individual": "concept_philosophy_n",
    "law":        "concept_philosophy_n",
    "money":      "concept_economy_m",
    "value":      "concept_economy_m",
    "wage":       "concept_economy_m",
    "profit":     "concept_economy_m",
    "surplus":    "concept_economy_m",
    "labor":      "concept_economy_m",
    "motion":     "concept_economy_m",
    "global":     "concept_economy_m",
    "state":      "concept_economy_m",
    # --- I 拟人建筑: building_* 前缀统一处理 ---
}

# 音色人设 (供 manifest / 音色图鉴页使用)
VOICE_PROFILES = {
    "chatter_f":          {"family": "市井百姓", "gender": "F", "persona": "市井女声，亲切爱聊，带方言烟火气"},
    "chatter_m":          {"family": "市井百姓", "gender": "M", "persona": "市井男声，朴实憨厚，爱唠嗑"},
    "tribal_m":           {"family": "原始公社", "gender": "M", "persona": "猎人/匠人，粗犷直接，嗓子带风沙感"},
    "tribal_f":           {"family": "原始公社", "gender": "F", "persona": "采集者/部落妇女，明快利落"},
    "shaman_m":           {"family": "原始公社", "gender": "M", "persona": "萨满，神秘悠远，拖长音"},
    "elder_m":            {"family": "原始公社", "gender": "M", "persona": "长老，苍老缓慢有分量（跨时期呼应）"},
    "child_n":            {"family": "原始公社", "gender": "N", "persona": "孩童，稚嫩明快（跨 S0/S7）"},
    "freeman_m":          {"family": "奴隶制",   "gender": "M", "persona": "自由民，傲气、自我庆幸"},
    "noble_antiquity_m":  {"family": "奴隶制",   "gender": "M", "persona": "奴隶主，高傲冷酷"},
    "slave_f":            {"family": "奴隶制",   "gender": "F", "persona": "奴隶，怯懦疲惫（跨 S1-S2）"},
    "lord_m":             {"family": "封建时代", "gender": "M", "persona": "封建领主，傲慢拖腔"},
    "serf_m":             {"family": "封建时代", "gender": "M", "persona": "农奴/贫苦农民，悲苦麻木"},
    "priest_m":           {"family": "封建时代", "gender": "M", "persona": "神职人员，虔诚腔调"},
    "philosopher_n":      {"family": "封建时代", "gender": "N", "persona": "民间智者，深沉缓重（全时期）"},
    "rebel_m":            {"family": "封建时代", "gender": "M", "persona": "觉醒者，低沉转激昂（跨 S1/S2/S5）"},
    "capitalist_m":       {"family": "资本主义", "gender": "M", "persona": "资本家/商人，傲慢圆滑"},
    "banker_m":           {"family": "资本主义", "gender": "M", "persona": "银行家，精明世故"},
    "worker_m":           {"family": "资本主义", "gender": "M", "persona": "工人，沙哑沉稳，疲惫但有力量"},
    "intellectual_m":     {"family": "资本主义", "gender": "M", "persona": "知识分子/理论家，文气沉思"},
    "cadre_n":            {"family": "社会主义", "gender": "N", "persona": "干部/领袖，正直昂扬"},
    "citizen_new_n":      {"family": "社会主义", "gender": "N", "persona": "新社会公民，明快亲切"},
    "future_f":           {"family": "共产主义", "gender": "F", "persona": "未来居民（女），自由明亮"},
    "future_m":           {"family": "共产主义", "gender": "M", "persona": "未来居民（男），明朗洒脱"},
    "concept_philosophy_n": {"family": "拟人概念", "gender": "N", "persona": "哲思之声，空灵中性，画外音"},
    "concept_economy_m":  {"family": "拟人概念", "gender": "M", "persona": "世间规则之声，冷峻低沉"},
    "building_n":         {"family": "拟人建筑", "gender": "N", "persona": "建筑，古朴沧桑，历史本人在说话"},
}

CHAT_TO_EMOTION = {"educational": "neutral", "chatter": "happy", "quirky": "playful"}

# 多音字风险词 (GPT-SoVITS 内置 G2PW 大部分能处理, 这些抽查)
POLYPHONE_WORDS = ["银行", "行动", "重要", "利益", "剥削", "剩余价值", "压迫", "矛盾",
                   "积累", "重利", "着重", "宝藏", "发行", "行业", "觉悟", "角色"]

CN_DIGITS = "零一二三四五六七八九"
CN_UNITS = ["", "十", "百", "千"]

def int_to_cn(n):
    """0-9999 的阿拉伯数字转中文 (台词里只会出现小数字/年份片段)"""
    if n == 0:
        return "零"
    s = ""
    unit_i = 0
    while n > 0:
        d = n % 10
        if d:
            s = CN_DIGITS[d] + CN_UNITS[unit_i] + s
        elif s and not s.startswith("零"):
            s = "零" + s
        n //= 10
        unit_i += 1
    s = s.rstrip("零")
    if s.startswith("一十"):
        s = s[1:]
    return s

def normalize_text(t):
    """TTS 文本规范化"""
    # 去 emoji 与非语言符号
    t = re.sub(r"[\U0001F000-\U0001FAFF☀-➿️✀-➿]", "", t)
    t = re.sub(r"[★☆♡♥]", "", t)
    # 全角空格 → 删除; 连续空白 → 单空格
    t = t.replace("\u3000", "")
    t = re.sub(r"\s+", " ", t).strip()
    # 阿拉伯数字 → 中文 (逐个独立处理, 台词里无连续大数)
    t = re.sub(r"\d+", lambda m: int_to_cn(int(m.group())), t)
    # 标点规范化 (TTS 友好)
    t = t.replace("~", "，").replace("～", "，")
    t = t.replace("/", "，").replace("|", "，")
    t = t.replace("·", "、")
    # 中文引号内是引用内容, 保留; 去掉首尾多余标点
    t = re.sub(r"^[，。！？、；：\s]+", "", t)
    t = re.sub(r"[，。！？、；：\s]+$", "", t)
    return t

def split_long_text(t, limit=LONG_LINE_THRESHOLD):
    """长句按标点切块, 每块尽量不超过 limit 字"""
    if len(t) <= limit:
        return [t]
    # 在强标点后切
    pieces = re.split(r"(?<=[。！？；])", t)
    chunks, cur = [], ""
    for p in pieces:
        p = p.strip()
        if not p:
            continue
        if len(cur) + len(p) <= limit:
            cur += p
        else:
            if cur:
                chunks.append(cur)
            # 单块仍超长则按逗号硬切
            while len(p) > limit:
                cut = p.rfind("，", 0, limit)
                cut = cut if cut > limit // 2 else limit
                chunks.append(p[:cut])
                p = p[cut:]
            cur = p
    if cur:
        chunks.append(cur)
    return [c for c in chunks if c.strip()]

def role_of(item):
    i = item["id"]
    if i.startswith("bldg_"):
        return "building"
    parts = i.split("_")
    if len(parts) >= 3:
        return parts[1]
    return parts[0]

def voice_of(item):
    role = role_of(item)
    if role == "building":
        return "building_n"
    if role in ("chat", "quirky"):
        h = int(hashlib.md5(item["id"].encode("utf-8")).hexdigest(), 16)
        return "chatter_f" if h % 2 == 0 else "chatter_m"
    if role == "resident":
        h = int(hashlib.md5(item["id"].encode("utf-8")).hexdigest(), 16)
        return "future_f" if h % 2 == 0 else "future_m"
    v = ROLE_TO_VOICE.get(role)
    if v is None:
        raise SystemExit(f"未映射角色: {role} (id={item['id']}) — 请补 ROLE_TO_VOICE")
    return v

def main():
    dialogs = json.load(open(os.path.join(DATA, "dialogs.json"), encoding="utf-8"))
    stages = {s["id"]: s for s in json.load(open(os.path.join(DATA, "stages.json"), encoding="utf-8"))}

    lines, unmapped = [], []
    voice_counter = collections.Counter()
    split_counter = 0
    poly_flags = []

    for item in dialogs:
        voice = voice_of(item)
        emotion = CHAT_TO_EMOTION.get(item.get("chatType"), "neutral")
        text = normalize_text(item.get("text", ""))
        if not text:
            unmapped.append((item["id"], "EMPTY_TEXT"))
            continue
        # 多音字风险标记
        for w in POLYPHONE_WORDS:
            if w in text:
                poly_flags.append((item["id"], w))
        chunks = split_long_text(text)
        if len(chunks) > 1:
            split_counter += 1
        for idx, ch in enumerate(chunks):
            lid = item["id"] if idx == 0 else f"{item['id']}_p{idx+1}"
            lines.append({
                "id": lid,
                "dialog_id": item["id"],
                "stage_id": item.get("stageId"),
                "stage_name": stages.get(item.get("stageId"), {}).get("name", ""),
                "role": role_of(item),
                "voice": voice,
                "emotion": emotion,
                "chat_type": item.get("chatType"),
                "text": ch,
                "chars": len(ch),
                "part": f"{idx+1}/{len(chunks)}",
            })
            voice_counter[voice] += 1

    # 输出 lines.json
    payload = {
        "source": "src/data/dialogs.json",
        "total_dialogs": len(dialogs),
        "total_lines": len(lines),
        "split_lines": split_counter,
        "voices": dict(sorted(voice_counter.items())),
        "lines": lines,
    }
    with open(os.path.join(OUT, "lines.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    # 输出 lines.csv (审阅用)
    with open(os.path.join(OUT, "lines.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "voice", "emotion", "stage", "role", "chars", "part", "text"])
        for l in lines:
            w.writerow([l["id"], l["voice"], l["emotion"], l["stage_name"], l["role"],
                        l["chars"], l["part"], l["text"]])

    # 报告
    rep = []
    rep.append(f"对话总数: {len(dialogs)}")
    rep.append(f"合成条目(含切块): {len(lines)}  (长句切块 {split_counter} 条)")
    rep.append(f"未映射/异常: {unmapped if unmapped else '无'}")
    rep.append(f"多音字风险标记: {len(poly_flags)} 处 -> {poly_flags[:20]}")
    rep.append("")
    rep.append("音色分布:")
    for v, n in sorted(voice_counter.items(), key=lambda x: -x[1]):
        rep.append(f"  {v:24s} {n:4d}")
    missing_voices = [v for v in VOICE_PROFILES if v not in voice_counter]
    if missing_voices:
        rep.append(f"注意: 名册中无条目的音色: {missing_voices}")
    extra = [v for v in voice_counter if v not in VOICE_PROFILES]
    if extra:
        rep.append(f"注意: 清单中出现名册外音色: {extra}")
    rep.append("")
    rep.append("情绪分布: " + str(dict(collections.Counter(l['emotion'] for l in lines))))
    total_chars = sum(l["chars"] for l in lines)
    rep.append(f"总字符: {total_chars} (预估音频 {total_chars/5/60:.1f} 分钟)")
    with open(os.path.join(OUT, "report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(rep))

    print("\n".join(rep))

if __name__ == "__main__":
    main()
