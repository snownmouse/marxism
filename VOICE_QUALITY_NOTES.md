# 语音音质保真 · 排查与修复记录

> 本文档记录一次针对「**声音太人机了 / 音质有问题**」的完整排查。
> 核心结论是：此前管线里有**三个结论建立在被污染的测量数据上**，需要推翻重做。

---

## 一、问题现象

用户反馈角色语音「太人机」，具体表现为：

- 听起来像**通用默认嗓音**，缺乏角色个性
- 部分音频**忽大忽小**，有的几乎听不见
- 长句有**断裂感 / 拼接感**

---

## 二、根本原因：一个被污染的测量口径

历史 A/B（`ab_test4.py`）得出结论「**cfg_rate=1.30 会导致音量塌陷**」，
于是把 `cfg_rate` 从 1.30 调到 **0.6**。

**这个测量是错的。** `ab_test4.py` 测的是经过 ffmpeg `loudnorm` 之后的 mp3，
而 ffmpeg 的单遍 `loudnorm` 在 1~4 秒短句上极不稳定：

| 台词 | 原始 wav spRms | loudnorm+mp3 | 偏差 |
|---|---|---|---|
| prim_hunter_1 | 0.0937 | 0.0277 | **−10.6 dB** |
| prim_thinker_1 | 0.0892 | 0.1706 | **+5.6 dB** |
| social_chat_5 | 0.0796 | 0.0214 | **−11.4 dB** |

同一条管线里出现 14 dB 的随机起伏 —— 所有基于它的判断都不可信。

**教训：短音频的响度归一化不可靠，评测必须在原始波形上进行。**

---

## 三、修复一：`cfg_rate` 拧反了（最核心）

### 机制

v5dev 的 `cfg_rate` 是 CFM 流匹配的 classifier-free guidance 强度：

```python
# GPT_SoVITS/module/v5_inference.py
if cfg > 1e-5:
    negative, _, _ = self.estimator(
        ..., drop_audio_cond=True, drop_text=False, ...)
    velocity = velocity + cfg * (velocity - negative)
```

`negative` 分支是**丢弃音色条件**（`drop_audio_cond=True`）的前向。
`cfg` 越小，负向分支权重越大，**音色条件被压过**，
模型退化成没有个人特征的**通用默认嗓音** —— 这正是听感上的「人机」。

### 实测

在**原始 wav** 上重扫 `cfg_rate`（8 台词 × 2 seed），
核心指标 `f0_match` = 合成基频与参考音频基频的相对偏差：

| cfg_rate | f0_match | 偏差>20% 条数 | rms |
|---|---|---|---|
| 0.0 | **28.7%** | 4 | 0.0450 |
| 0.5 | 13.4% | 3 | 0.0670 |
| **1.0** | **3.3%** | **0** | 0.0907 |
| 1.3 | 3.4% | 0 | 0.1012 |
| 1.6 | 3.9% | 0 | 0.1102 |

典型案例 `philosopher_n`（参考基频 121.8 Hz）：

| cfg_rate | 合成基频 | 听起来 |
|---|---|---|
| 0.0 | 231.3 Hz | **男声变女声** |
| 0.5 | 179.8 Hz | 明显偏尖 |
| 1.0 | 124.5 Hz | **与参考一致** |

**采用 `cfg_rate = 1.0`**（音色偏差最低、零条超阈、电平适中）。

> 注意：不能用 `f0_range`（基频起伏）来选 cfg —— 低 cfg 造成的八度错误
> 会让 f0_range 虚高（239 vs 220），看起来「更有表现力」，实则是音色丢失。

---

## 四、修复二：删除 ffmpeg `loudnorm`

### 实测

33 条样本（cfg=1.0/1.3，排除塌陷），对比归一化前后的电平离散度：

| 方案 | 归一化前 std | 归一化后 std | Δstd |
|---|---|---|---|
| 单遍 loudnorm | 1.59 dB | **16.56 dB** | +14.97 ❌ |
| 两遍 loudnorm | 1.59 dB | **16.28 dB** | +14.69 ❌ |
| 峰值归一 | 1.59 dB | 2.00 dB | +0.41 ✅ |
| 裸转码 | 1.59 dB | 1.59 dB | 0（基准） |

**模型输出的电平本身离散度只有 1.59 dB（非常一致），
`loudnorm` 反而把它搅成 16 dB。** 两遍法同样坏 —— 问题不在遍数，
而在 LUFS 短句积分测量本身不可靠。

**结论：完全删除 `loudnorm`，保留模型原始电平。**

---

## 五、修复三：采样参数（`top_k` / `temperature`）

固定 `cfg=1.0`，8 台词 × 2 seed：

| 配置 | f0_match | 塌陷 | 韵律起伏 f0_range | 语速(字/s) |
|---|---|---|---|---|
| **k5_t0.7** | **2.6%** | **0** | **248.5** | 4.01 |
| k10_t0.7 | 4.2% | 0 | 197.7 | 4.28 |
| k10_t0.85 | 3.6% | 0 | 224.4 | 4.18 |
| k10_t1.0 | 2.9% | 1 | 233.3 | 9.48 |
| k5_t1.0 | 3.6% | 1 | 222.9 | 9.33 |
| k15_t1.0 | 3.6% | 1 | 220.8 | 9.70 |
| k20_t1.0 | 3.7% | 1 | 238.4 | 9.72 |

**所有 `temperature=1.0` 的组合都出现内容塌陷，`temperature ≤ 0.85` 全部干净。**

**采用 `top_k=5, temperature=0.7`**（0 塌陷 + 韵律起伏最高 + 语速落在中文自然区间 3.5~5.5）。

---

## 六、其余已生效的修复（此前会话）

| 项 | 原 | 现 | 实测效果 |
|---|---|---|---|
| 模型 | v2ProPlus (32kHz) | **v5dev + BigVGAN 48kHz** | 频谱质心 266 → 507 |
| 参考音频采样率 | 16kHz 原生 | **AP_BWE 超分 48kHz** | 退化率 40% → 0% |
| 参考音频结构 | 1~3 句 + 150ms 硬拼 | **单句连续** | 消除断裂节奏注入 |
| 切分方式 | 按标点切 | **cut0 不切** | 段内静音 3.2 → 0.8 段/条 |
| 段间静音 | 0.3s | **0** | 消除拼接感 |
| 编码 | 32kbps/48kHz | **96kbps/32kHz** | 8-12kHz 能量 0.0000 → 0.0002 |

### 长句切分方式复测（40+ 字台词，6 句 × 2 seed）

| 切法 | 平均时长 | 平均静音段 | 语速 |
|---|---|---|---|
| **cut0** | 11.8s | 16.4 | 4.3 |
| cut5 | 13.1s | 17.5 | 4.0 |
| cut1 | 11.7s | 15.8 | 4.4 |

按标点切反而更长更碎 —— **维持 cut0**。

---

## 七、质检体系升级

新增 `qa_quality.py`，用**音色保真度**作为核心指标：

```
f0_dev = |f0_合成 − f0_参考| / f0_参考
```

判定阈值：`f0_dev > 25%` 判「音色失真」（听起来不像这个人 → 人机感）。
这比旧的 `qa_deep.py` 更准 —— 后者依赖 librosa.yin，在本环境对 20ms 短帧
**全部返回 0**，导致 F0 判定恒为失败、大量误报「塌陷」。

`qmetrics.py` 改用**纯 numpy 自相关**估计基频，绕开 librosa 版本差异。

---

## 八、涉及文件

| 文件 | 说明 |
|---|---|
| `marxism/scripts/voice/synthesize_v3.py` | **最终合成脚本**（替代 `synthesize.py`） |
| `marxism/qa_quality.py` | 音质保真质检（替代 `qa_deep.py`） |
| `qmetrics.py` | 客观音频度量（原始 wav 口径） |
| `loudfix.py` | 两遍 loudnorm 封装（**最终未采用**，实测有害） |
| `ab_test5.py` / `ab_test5b.py` | cfg_rate / 采样参数 A/B |
| `ab_test7.py` | 长句切分方式 A/B |
| `ab5_report.py` | 以 f0_match 仲裁的汇总报告 |

---

## 九、可复现的验证命令

```bash
# 启动 v5 API（8001）
runtime/python.exe D:\GPT-SoVITS-v5\run_api_v5.py -p 8001

# 重建参考音频（超分 + 单句）
runtime/python.exe D:\GPT-SoVITS-v5\rebuild_refs.py

# 参数重测
runtime/python.exe D:\GPT-SoVITS-v5\ab_test5.py
runtime/python.exe D:\GPT-SoVITS-v5\ab5_report.py

# 全量合成
runtime/python.exe marxism\scripts\voice\synthesize_v3.py --force

# 质检
runtime/python.exe marxism\qa_quality.py
```
