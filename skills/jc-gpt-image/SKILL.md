---
name: jc-gpt-image
description: Convert a validated single-shot short-video plan into one standalone GPT Image 2 first-frame prompt per shot while preserving the script, duration, visual continuity, and Veo prompt.
---

# 单镜头方案 -> GPT Image 2 单幅分镜图提示词

把 `jc-script-storyboard` 的逐镜头方案转换成程序可直接用于 GPT Image 2 的单幅首帧提示词。不要生成图片，不要调用 API。

## 输入

输入 JSON 包含：

- `script`：已确认完整文稿；
- `actualDuration`：配音真实时长；
- `ratio`：`9:16` 或 `16:9`；
- `style`：已选视觉风格名称与提示词；
- `coreReference`：可选的单一核心参考资产元数据；
- `shotPlan`：包含 `visualAnchor` 和 `shots` 的逐镜头方案。

## 规则

1. 每个 `shot` 输出一个对应 `segment`，顺序、索引、`playDuration`、`generationDuration`、文稿、`coreReferenceVisible` 和 `videoPrompt` 原样保留。
2. 每个 `storyboardImagePrompt` 只描述一张全画幅静态首帧：单一场景、单一构图、明确主体、机位、景别、光线、色彩、材质和动作起点。
3. 禁止多宫格、分屏、拼贴、卷轴、接触表、连续画格、镜号、箭头、字幕、标题、Logo 和水印。
4. 把 `visualAnchor` 中与本镜相关的一致性信息明确写进每个提示词，不能只写“同上”或使用含糊代词。
5. 首帧必须给 `videoPrompt` 留出可执行动作空间，不能把动作结果提前完成。
6. 画面比例必须与输入 `ratio` 一致。默认使用写实、清晰、可检查的产品或叙事画面，不额外发明风格选择。
7. 明确落实输入 `style`。`coreReferenceVisible` 为 `true` 时，提示词要求保持参考图核心主体的外观、结构、颜色和标识一致；为 `false` 时不得要求参考图主体出镜。

## 输出

只输出合法 JSON，不要输出 Markdown：

```json
{
  "actualDuration": 12.5,
  "visualAnchor": "原样保留的全片视觉锚点",
  "segments": [
    {
      "index": 1,
      "playDuration": 6.25,
      "generationDuration": 8,
      "script": "原样保留的本镜头文稿",
      "coreReferenceVisible": true,
      "storyboardImagePrompt": "GPT Image 2 单幅首帧提示词",
      "videoPrompt": "原样保留的 Veo 3.1 单镜头提示词"
    }
  ]
}
```

输出段数必须等于输入镜头数，所有 `segments[].script` 拼接后必须完整覆盖原文。
