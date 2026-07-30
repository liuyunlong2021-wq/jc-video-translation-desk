---
name: jc-script-storyboard
description: Split an approved short-video voiceover script into one continuous 4-8 second camera shot per video segment, with a reusable visual anchor and a single-shot Veo 3.1 prompt for each segment.
---

# 文稿 -> 单镜头视频方案

把已确认文稿按真实配音时长拆成逐镜头方案。每段只对应一张单幅分镜图和一条 Veo 3.1 视频，不在段内切镜。

## 输入

输入 JSON 包含：

- `script`：已确认文稿，不得改写；
- `actualDuration`：配音真实时长；
- `ratio`：`9:16` 或 `16:9`。
- `style`：已选视觉风格名称与提示词；
- `coreReference`：可选的单一核心参考资产元数据。

## 拆分规则

1. 段数固定为 `ceil(actualDuration / 8)`；总时长不足 4 秒时按一段 4 秒处理。
2. 每段 `playDuration` 大于 0 且不超过 8 秒，所有播放时长之和与真实配音时长一致；`generationDuration` 只能取不短于播放时长的最小值 `4`、`6` 或 `8`。
3. `shots[].script` 顺序拼接后必须与输入文稿完全一致，不重复、不遗漏、不润色。
4. 每段只设计一个连续镜头：一个主要场景、一个主要构图、一段连续动作。允许推、拉、摇、移、跟拍等镜头运动，但禁止切镜、转场、蒙太奇、分屏和多场景跳转。
5. 相邻镜头通过主体位置、动作方向、光线和色彩保持连续；每镜独立重复必要的人物、产品、场景和道具特征。
6. 讲解类视频只设计画面动作，不在视频里生成旁白。`videoPrompt` 必须明确“单一连续镜头、无切镜、无背景音乐”；允许与画面同步的自然环境音和动作音效。
7. 每段必须输出 `coreReferenceVisible`。只有画面确实需要出现核心参考主体时才为 `true`；不得为了使用参考图而强行让主体出镜。
8. `visualAnchor` 必须包含输入 `style` 的具体视觉语言。

## 输出

只输出合法 JSON，不要输出 Markdown：

```json
{
  "actualDuration": 12.5,
  "visualAnchor": "全片共用的主体、场景、光线、色彩与画幅锚点",
  "shots": [
    {
      "index": 1,
      "playDuration": 6.25,
      "generationDuration": 8,
      "script": "本镜头对应的原文",
      "coreReferenceVisible": true,
      "imageBrief": "这一镜静态首帧应呈现的主体、环境、构图、机位和动作起点",
      "videoPrompt": "基于首帧生成8秒素材，时间线使用前6.25秒；单一连续镜头；写清主体动作和镜头运动；无切镜、无转场、无背景音乐，只保留自然环境音和动作音效。"
    }
  ]
}
```

`visualAnchor` 必须具体、可重复。`imageBrief` 只能描述一张完整画面，不得描述宫格、拼图、卷轴或连续画格。
