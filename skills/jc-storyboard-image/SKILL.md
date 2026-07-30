---
name: jc-storyboard-image
description: Convert an approved Chinese short-video script into 4-8 second segments, each represented by one multi-panel GPT Image 2 storyboard scroll and one Veo 3.1 prompt for generating a complete multi-cut video segment.
---

# 文稿 -> Veo 3.1 分镜卷轴

将审核通过的文稿按输入的真实配音时长和画面比例拆成 `4-8` 秒视频段。每段只生成一张包含多个连续镜头的分镜卷轴图，让 Veo 3.1 根据整张卷轴完成段内切镜。

## 时长与分段

1. 输入包含已经测得的真实配音时长 `actualDuration`，不得再用字数估算覆盖它。
2. 总时长不足 4 秒时按 4 秒处理。
3. 段数取 `actualDuration / 8` 向上取整，再把时长按文稿语义分配，保证每段 `4-8` 秒。
4. 在语义、场景或情绪转折处微调边界，不从一句话中间硬切。
5. 例如：200 字约 60 秒，拆成 8 段，每段约 7.5 秒，对应 8 张卷轴图和 8 条视频。

## 每段卷轴

- 每张分镜卷轴使用输入的 `ratio`，包含 3-6 个按时间顺序排列的画格；重要镜头可以更大，过渡镜头可以更小。
- 画格共同描述一段连续事件，清晰表现起点、发展、转折和收束，供模型理解切镜顺序。
- 使用一致的人物外形、服装、场景、道具、光线和色彩；后续卷轴必须重复必要的一致性锚点。
- 画面内不生成标题、字幕、镜号、箭头、水印或说明文字，避免它们进入视频。
- 用户未指定风格时，不额外发明可选风格系统；根据题材选择克制、连贯的默认视觉表达。

## Veo 3.1 提示词

- 明确要求按卷轴从上到下、从左到右读取画格，并在目标时长内生成一条有多次自然切镜的完整视频。
- 写清每个画格的主体动作、镜头运动、切换时机和最终落点。
- 对白场景可描述角色说话动作和准确台词；讲解类以旁白驱动画面。
- 明确要求：无背景音乐。自然环境音和动作音效允许存在。
- 不依赖生成视频中的人声完成最终配音；最终合成会丢弃生成视频的原始音轨并替换为统一配音。

## 输出

只输出可供程序解析的 JSON：

```json
{
  "actualDuration": 60,
  "visualAnchor": "跨卷轴共用的人物、场景、光线和色彩锚点",
  "segments": [
    {
      "index": 1,
      "duration": 7.5,
      "script": "本段对应文稿",
      "storyboardImagePrompt": "GPT Image 2 多画格分镜卷轴提示词",
      "videoPrompt": "Veo 3.1 多切镜视频提示词"
    }
  ]
}
```

`segments` 必须覆盖全部文稿，顺序不得改变，不重复、不遗漏。
