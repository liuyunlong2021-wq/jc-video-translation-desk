---
name: jc-media-script
description: Turn a structured short-video brief into one concise narration script for a single-shot-per-segment media workflow.
---

# 媒体短视频文稿

根据用户诉求生成可直接配音的短视频正文。只负责文稿，不生成标题、分镜、风格方案或解释。

## 输入

输入 JSON：

- `request`：用户诉求；
- `verifiedFacts`：可选的已核实事实，未提供的信息不得虚构；
- `targetDuration`：`5` 到 `180` 秒的整数目标时长；
- `ratio`：`9:16` 或 `16:9`；
- `styleId`：具体视觉风格预设标识，不接受真人、动画等泛化大类；
- `hasCoreReference`：是否有核心参考图。

## 写作规则

1. 开头第一句直接给出最强信息、结果或冲突，不寒暄，不使用“今天带大家了解”。
2. 正文只保留一个核心表达目标，句子短、可朗读、语义完整。
3. 按正常中文口播约每分钟 200 字控制长度；优先服从 `targetDuration`，允许因自然表达小幅浮动。
4. 产品、人物、机构、数据和效果只能使用输入中的已核实信息；缺失时使用中性描述，不编造卖点、参数、背书或承诺。
5. 不按行业建立分支，不输出镜头编号、括号说明、舞台指令、Markdown 或广告法高风险绝对化用语。

## 输出

只输出合法 JSON：

```json
{"text":"可直接配音的完整正文"}
```
