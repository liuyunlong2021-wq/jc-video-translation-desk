---
name: jc-gpt-image
description: Convert a validated director-led single-shot short-video plan into one standalone GPT Image 2 first-frame prompt per shot while preserving creative identity, hook/payoff design, visual continuity, duration, and the Veo 3.1 prompt. Use before paid image generation.
---

# 单镜头方案 -> GPT Image 2 单幅分镜图提示词

把 `jc-script-storyboard` 的逐镜头方案转换成程序可直接用于 GPT Image 2 的单幅首帧提示词。不要生成图片，不要调用 API。

## 输入

输入 JSON 包含：

- `script`：已确认完整文稿；
- `actualDuration`：配音真实时长；
- `ratio`：`9:16` 或 `16:9`；
- `style`：已选具体视觉风格预设名称与固定提示词；
- `coreReference`：可选的单一核心参考资产元数据；
- `validationError`：上一次输出的合同错误；非空时必须修正后完整重出；
- `shotPlan`：包含 `creativeIdentity`、`distributionIntent`、`resolvedPace`、`visualAnchor` 和 `shots` 的逐镜头方案。

## 规则

1. 原样继承 `creativeIdentity`、`distributionIntent`、`resolvedPace` 和 `visualAnchor`，不得在转换阶段换导演、换风格或重写文稿。
2. 每个 `shot` 输出一个对应 `segment`，顺序、索引、`playDuration`、`generationDuration`、文稿、`coreReferenceVisible` 和 `videoPrompt` 原样保留。禁止合并、拆分、遗漏或新增镜头，导演方案中的实际镜头数是唯一数量依据。
3. 每个 `storyboardImagePrompt` 只描述一张全画幅静态首帧：单一场景、单一构图、明确主体、`shotSize`、`cameraAngle`、`cameraMovement` 的起始构图、光线、色彩、材质和动作起点。把 `startState` 落成看得见的画面，不要把 `actionProgression` 的结果提前完成。
4. 第一镜必须服务于 `distributionIntent`：首帧一眼看见钩子，不得使用空场、无主体的慢开场或仅有装饰的画面。最后一镜必须落在 `endState` 的稳定可读状态。
5. 禁止多宫格、分屏、拼贴、卷轴、接触表、连续画格、镜号、箭头、字幕、标题、Logo 和水印。
6. 把 `visualAnchor` 中与本镜相关的一致性信息明确写进每个提示词，不能只写“同上”或使用含糊代词。`creativeIdentity` 只作为可执行的构图、光线和镜头语言，不要只输出身份名称。
7. 画面比例必须与输入 `ratio` 一致。默认使用清晰、可检查的单幅首帧，不额外发明风格选择。
8. 明确落实输入 `style`。`coreReferenceVisible` 为 `true` 时，提示词要求保持参考图核心主体的外观、结构、颜色和标识一致；为 `false` 时不得要求参考图主体出镜。

## 输出

只输出合法 JSON，不要输出 Markdown：

```json
{
  "actualDuration": 12.5,
  "creativeIdentity": "原样保留的创作身份",
  "distributionIntent": "原样保留的短视频观看目标",
  "resolvedPace": "medium",
  "visualAnchor": "原样保留的全片视觉锚点",
  "segments": [
    {
      "index": 1,
      "playDuration": 6.25,
      "generationDuration": 8,
      "script": "原样保留的本镜头文稿",
      "coreReferenceVisible": true,
      "storyboardImagePrompt": "GPT Image 2 单幅首帧提示词：落实创作身份、短视频钩子、主体、起始状态、景别、机位、构图、光线、色彩、材质和动作起点；单一完整画面；禁止文字、Logo、水印、拼贴和多画格。",
      "videoPrompt": "原样保留的 Veo 3.1 单镜头提示词"
    }
  ]
}
```

输出段数必须等于输入镜头数，所有 `segments[].script` 拼接后必须完整覆盖原文。每个提示词都必须能从首帧自然推进到对应镜头的 `endState`，不能只写静态美术形容词。
输出前必须再次计数：`segments.length` 必须等于 `shotPlan.shots.length`，不等则先在内部修正，不能输出错误数量。
