# 语音朗读 · 音色来源与许可（VOICE CREDITS）

本项目的「小镇对话」语音朗读功能使用 **GPT-SoVITS（v2ProPlus 零样本语音克隆）** 预生成，
所有音频为静态文件（`public/audio/dialog/*.mp3`），部署时无需任何推理服务。

26 个角色音色全部克隆自两个**宽松许可证**开源语音数据集，每个音色的具体来源
（数据集 + 说话人编号 + 许可证）可在应用内「🎙️ 音色图鉴」页查看，也可查阅
`public/audio/manifest.json` 中每个音色的 `source` 字段。

## 数据来源

| 数据集 | 许可证 | 用途 | 出处 |
|---|---|---|---|
| **THCHS-30** | Apache-2.0 | 女声音色、高音孩童、中性概念音（51 个女声说话人） | OpenSLR SLR18，清华大学 CSLT |
| **AISHELL-1** | Apache-2.0 | 全部男声音色（27 个男声说话人，取自 train/dev 男声） | OpenSLR SLR33，北京希尔贝壳科技 |

### THCHS-30 引用

> Wang, Dong et al. "THCHS-30: A Free Chinese Speech Corpus." Tsinghua University CSLT.
> https://openslr.org/18/ — Apache License 2.0

### AISHELL-1 引用

> Bu, Hui et al. "AISHELL-1: An Open-Source Mandarin Speech Corpus and a Speech
> Recognition Baseline." Oriental COCOSDA 2017.
> https://openslr.org/33/ — Apache License 2.0

## 合成模型

- **GPT-SoVITS v2pro**（s1v3 + s2Gv2ProPlus 预训练权重，零样本克隆）
- 参考音频为人声片段（6~11 秒），克隆音色仅用于本项目教育场景的角色配音
- 每个音色仅使用单一说话人的参考片段；同一说话人不重复分配给多个音色

## 合规说明

- Apache-2.0 允许商用、修改与再分发，需保留许可声明与出处（即本文件）
- 音色图鉴页内嵌相同出处信息，确保最终用户可见
- 若你将本项目再次分发或商用，请随本文件一同保留以上致谢
