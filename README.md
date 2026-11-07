# 原理社会 · 马克思主义动态模拟器

> 让一座像素小镇从原始社会一路演进到共产主义，把「生产力决定生产关系」这类抽象原理变成看得见、听得见的画面。

**React 19 · TypeScript · Vite 8 · Zustand 5 · Canvas 2D · 零 UI 组件库**

一句话理解：它更像一座会动的教学模型，而不是游戏——没有输赢、没有分支剧情，你只做一件事：**拖动时间轴，看小镇和镇上的人怎么变**。理论知识藏在居民对话、数据面板和词条里，想深挖再点开，不强制答题。

---

## 它能做什么

| 你想…… | 对应功能 |
| --- | --- |
| 看社会形态怎么变 | 8 阶段时间轴 + 像素小镇 Canvas（建筑、天空、氛围随阶段整体重绘） |
| 看懂「谁占有、谁干活、谁拿走」 | 右侧数据面板：生产力 / 生产关系 / 剥削率 / 阶级结构堆叠条 / 上层建筑（政治·法律·意识形态） |
| 听当时的人怎么说 | 居民对话气泡按阶级配色；点 ℹ️ 看词条定义与原文，点 💬 把这句话直接交给 AI 向导 |
| 系统梳理原理 | 理论卡片轮播、内容讲解、知识体系/概念总览、知识网络图、关键转折的理论聚焦弹窗 |
| 对照与自测 | 对比视图（并排两个阶段）、考试复习题库（单选 / 多选 / 判断） |
| 有个问题想问 | AI 向导「小原」，支持文字问答与朗读 |
| 想听 | 26 个音色的 220 条预制对话音频 + 音色图鉴；小原的回复也可实时合成语音 |

顶部还有「自动播放」（每 3 分钟前进一个阶段）和「帮助」。

## 8 个历史阶段

数据取自 [`src/data/stages.json`](src/data/stages.json)，剥削率为教学示意值，非统计数据。

| # | 阶段 | 生产力标志 | 剥削率 | 主要阶级 |
| --- | --- | --- | --- | --- |
| 0 | 原始共产主义 | 石器、火、采集狩猎 | 0% | 全体成员 |
| 1 | 私有制萌芽 | 磨制石器、原始农牧、金属工具 | 8% | 氏族贵族 / 自由民 / 战俘 |
| 2 | 奴隶社会 | 青铜器、灌溉农业、脑体分工 | 80% | 奴隶主 / 自由民 / 奴隶 |
| 3 | 封建制度 | 铁器、耕犁、行会、风车水磨 | 60% | 领主 / 农奴 / 手工业者 |
| 4 | 资本主义自由竞争 | 蒸汽机、机器大工业、铁路 | 125% | 资本家 / 工人 / 小资产阶级 |
| 5 | 垄断资本主义 | 电气化、流水线、金融资本 | 200% | 垄断资本 / 工人 / 失业者 |
| 6 | 社会主义过渡 | 电气化、集体化、计划工业化 | 0% | 工人阶级 / 农民 / 知识分子 |
| 7 | 共产主义远景 | 绿色能源、自动化、人工智能 | 0% | 自由人联合体 |

## 快速开始

```bash
# 需要 Node.js（建议 22 LTS 或更新）与 npm
git clone https://github.com/snownmouse/marxism.git
cd marxism
npm install
npm run dev
# 浏览器打开 http://localhost:3000
```

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（端口 3000） |
| `npm run build` | `tsc -b` 类型检查 + 构建，产物在 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `node validate.cjs` | 校验对话、词条、阶段之间的 ID 引用是否一致 |

**首次运行不需要任何 API Key**。前端是纯静态的，`dist/` 可以直接丢到任意静态托管上，除在线 AI 问答外的功能都能离线工作。

---

## 「小原」AI 向导（可选）

前端**不保存任何 API Key**，所有密钥都收在服务端环境变量里。

```
浏览器 ── POST /api/chat   ──▶ server/index.mjs ──▶ DashScope qwen-flash
浏览器 ── POST /api/tts    ──▶ server/index.mjs ──▶ qwen3-tts-flash（结果带磁盘缓存）
浏览器 ── GET  /api/health ──▶ server/index.mjs（前端据此显示在线 / 本地）
```

服务端是**零依赖**的，只用 Node 内置模块，不需要 `npm install`。

| 情况 | 实际表现 |
| --- | --- |
| 没启动服务端 / 没配 Key | 小原显示「本地引导」，用内置规则答复；朗读退回浏览器 `speechSynthesis`；小镇预制音频照常播放 |
| 配好 Key 且反代可用 | 在线模型实时回答，回复可实时合成语音 |
| 预制音频缺失或加载失败 | 自动降级为浏览器语音，不会「哑巴」 |

启动服务端：

```bash
DASHSCOPE_API_KEY=sk-xxx node server/index.mjs   # 默认 127.0.0.1:1960
curl -s http://127.0.0.1:1960/api/health
```

Windows PowerShell：

```powershell
$env:DASHSCOPE_API_KEY = "sk-xxx"
node server/index.mjs
```

主要环境变量（完整说明见 [`server/README.md`](server/README.md)）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 空 | **必填**（若要用在线模式），阿里云百炼 Key，一个 Key 同时管文本与语音 |
| `PORT` / `HOST` | `1960` / `127.0.0.1` | 仅监听本机，由 nginx 反代 |
| `QWEN_MODEL` | `qwen-flash` | 文本模型 |
| `COSYVOICE_MODEL` / `COSYVOICE_VOICE` | `qwen3-tts-flash` / `Cherry` | 语音模型与默认音色（键名沿用旧配置） |
| `TTS_CACHE_DIR` | `/opt/marxism-cache/tts` | 语音缓存目录，同一句话只合成一次 |
| `CHAT_TIMEOUT_MS` / `TTS_TIMEOUT_MS` | `35000` / `45000` | 上游超时 |

> **本地联调注意**：`vite.config.ts` 目前只配了端口，没有 `/api` 代理，前端的 `fetch('/api/chat')` 会打到 3000 而不是 1960。想在本机试在线模式，给 `server` 加一段：
>
> ```ts
> server: {
>   port: 3000,
>   host: true,
>   proxy: { '/api': 'http://127.0.0.1:1960' }
> }
> ```
>
> 生产环境不用改前端：`deploy/` 里已备好 nginx 反代片段与 systemd unit，把 `/api/` 同源转发到 1960 即可。

### 两条语音链路，别搞混

| | 小镇居民台词 | 小原的回复 |
| --- | --- | --- |
| 实现 | `src/services/tts.ts` | `src/lib/aiModel.ts` 的 `speakText` |
| 音源 | `public/audio/dialog/*.mp3` 预生成静态文件 + `manifest.json` | `/api/tts` 实时合成（带缓存） |
| 需要后端吗 | 不需要 | 需要；不可用时退回浏览器语音 |

两者互相独立：静态部署时小镇朗读完整可用，只有小原的实时语音会降级。

---

## 目录结构

```text
marxism/
├── src/
│   ├── components/          # 16 个功能面板与交互组件（小镇、时间轴、题库、AI 向导等）
│   ├── data/                # 7 个 JSON：阶段 / 对话 / 词条 / 卡片 / 题库 / 知识网络 / 理论聚焦
│   ├── pixelTown/           # Canvas 2D 瓦片渲染与类型定义
│   ├── lib/aiModel.ts       # 小原：在线 / 本地双模 + 实时语音
│   ├── services/tts.ts      # 预制音频播放器（含浏览器语音兜底）
│   ├── store/               # Zustand 全局状态
│   ├── styles/              # 手写 CSS，无 UI 组件库
│   └── App.tsx
├── public/audio/            # manifest.json + dialog/*.mp3（220 条，26 个音色）
├── server/index.mjs         # 零依赖 Node 服务端代理
├── deploy/                  # systemd unit + nginx 反代片段
├── docs/                    # 马理论考点.docx、马理论题库.md
├── scripts/voice/           # GPT-SoVITS 语音合成流水线
├── qa_quality.py            # 音质保真质检
├── parse_quiz.py            # 题库 Markdown → JSON
├── validate.cjs             # 数据引用一致性校验
├── PRD.md                   # 初期产品需求文档
├── VOICE_CREDITS.md         # 音色来源与许可
├── VOICE_QUALITY_NOTES.md   # 音质排查与参数实测记录
├── LICENSE                  # MIT（代码、文档、题库文本）
└── LICENSE-APACHE-2.0.txt   # 音频素材适用的 Apache-2.0 全文
```

> 根目录的三个 `*.zip` 和 `temp-build/` 是早期版本快照与构建残留，不参与运行，可以忽略。
> `PRD.md` 是最初的设计稿，其中「不做任何测验」等约定后来已经演进（现在有考试复习与内容讲解），**以代码和 `src/data/` 为准**。

## 数据与内容从哪来

| 文件 | 内容 | 怎么维护 |
| --- | --- | --- |
| `stages.json` | 8 个阶段的全部事实数据与小镇配色主题 | 手工编辑 |
| `dialogs.json` / `glossary.json` | 居民台词、词条定义与原文引用 | 手工编辑，改完跑 `node validate.cjs` |
| `knowledgeCards.json` / `theoryFocus.json` / `knowledgeNetwork.json` | 理论卡片、聚焦弹窗、概念网络 | 手工编辑 |
| `quizQuestions.json` | 单选 / 多选 / 判断题库 | 由 `parse_quiz.py` 从 `docs/马理论题库.md` 生成 |

重新生成题库时注意：`parse_quiz.py` 默认读取**当前目录**的 `马理论题库.md`，而文件实际在 `docs/` 下：

```bash
cp docs/马理论题库.md ./马理论题库.md
python parse_quiz.py        # 覆盖写入 src/data/quizQuestions.json
```

语音是离线预生成的（GPT-SoVITS v5dev + BigVGAN 48kHz），**运行时不需要任何推理服务**；合成参数、A/B 实测和质检口径见 [`VOICE_QUALITY_NOTES.md`](VOICE_QUALITY_NOTES.md)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite 8 |
| 状态管理 | Zustand 5 |
| 像素小镇 | Canvas 2D 手绘（`src/pixelTown/renderer.ts`），无游戏引擎 |
| 图表 / 样式 | 全部自绘，手写 CSS，无 UI / 图表库 |
| AI 代理 | Node.js 内置模块（`node:http` / `node:https`），零第三方依赖 |
| 在线模型 | 阿里云百炼 DashScope：`qwen-flash` + `qwen3-tts-flash` |
| 预制语音 | GPT-SoVITS v5dev 离线合成，96 kbps / 32 kHz 单声道 MP3 |

## 部署

1. **纯静态**：`npm run build` 后托管 `dist/`（`iga.json` 已写明安装命令 / 构建命令 / 输出目录）。无需后端，小原自动走本地引导，小镇朗读使用预制音频。
2. **完整版**：额外部署 `server/index.mjs`，用 `deploy/marxism-api.service` 交给 systemd 托管，nginx 把 `/api/` 反代到 `127.0.0.1:1960`。Key 放在 `/etc/marxism-api.env` 并设为 `600` 权限，**不要提交进仓库**。逐步命令见 [`server/README.md`](server/README.md)。

## 文档索引

| 文档 | 讲什么 |
| --- | --- |
| [`PRD.md`](PRD.md) | 最初的产品需求与界面设计（部分已演进） |
| [`server/README.md`](server/README.md) | 代理接口契约、环境变量、供应商选型、部署步骤 |
| [`VOICE_CREDITS.md`](VOICE_CREDITS.md) | 26 个音色的数据集来源与许可证 |
| [`VOICE_QUALITY_NOTES.md`](VOICE_QUALITY_NOTES.md) | 「声音太人机」的完整排查与参数实测 |
| [`LICENSE`](LICENSE) | 本项目采用的 MIT 全文 |
| [`LICENSE-APACHE-2.0.txt`](LICENSE-APACHE-2.0.txt) | 预制音频所依据数据集的 Apache-2.0 全文 |
| `docs/` | 马理论考点与题库原文 |

## 许可与致谢

本项目整体采用 **MIT**（[`LICENSE`](LICENSE)）：源码、文档、`docs/` 题库与 `src/data/*.json` 都可自由使用、修改和再分发，只需保留版权与许可声明。

唯一的例外是预制音频，它带的是数据源自带的标签：

| 内容 | 适用条款 |
| --- | --- |
| 源码 / 文档 / 题库文本 / 自建数据 | MIT |
| `public/audio/` 下 220 条预制音频 | Apache-2.0（见 [`LICENSE-APACHE-2.0.txt`](LICENSE-APACHE-2.0.txt)） |

- 音色克隆自 **THCHS-30**（OpenSLR SLR18，清华大学 CSLT）与 **AISHELL-1**（OpenSLR SLR33，北京希尔贝壳），两者均为 **Apache-2.0**。本项目以单句参考音频做零样本音色克隆，用 GPT-SoVITS v5dev + BigVGAN 48kHz 重新合成并编码为 96 kbps / 32 kHz 单声道 MP3——这是 Apache-2.0 §4 要求的「已做修改」说明。再分发时请一并保留许可证全文副本、[`VOICE_CREDITS.md`](VOICE_CREDITS.md)、`public/audio/manifest.json` 中的逐音色出处，以及应用内「音色图鉴」的出处信息。
- 题库为学校课程题库的整理文本，按个人研究学习用途收录，随本项目一并按 MIT 授权；今后若补入明确来自第三方的题目，请单独核实来源。
- 在线文本与语音能力由阿里云百炼 DashScope 提供；离线合成使用 GPT-SoVITS v5dev + BigVGAN，二者不随仓库分发。npm 依赖按各自许可证分发。

## 常见问题

**Q：小原一直显示「本地引导」？**
没启动服务端或没配 `DASHSCOPE_API_KEY`，属于预期降级，不影响小镇、题库、朗读等其他功能。

**Q：点朗读没声音？**
静态部署时确认 `public/audio/manifest.json` 和 `audio/dialog/` 随 `dist/` 一起上传了；缺失时会自动用浏览器语音兜底。

**Q：完全不联网能用吗？**
可以。除小原的在线问答与实时语音外，全部资源都是本地静态文件。

**Q：想改文案 / 加题目改哪里？**
改 `src/data/*.json`；题库建议改 `docs/马理论题库.md` 后用 `parse_quiz.py` 重新生成。改完跑一次 `node validate.cjs` 检查引用。
