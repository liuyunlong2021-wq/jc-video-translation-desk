# 镜头节奏控制 SDD

> 日期：2026-07-30
> 状态：已实施
> 依赖：`docs/短视频工厂AI原生创作改造SDD.md`

## 1. 目标

为单核心参考资产工作流增加 `自动 / 慢 / 中 / 快` 四档镜头节奏。节奏控制独立分镜的数量和语义切点，不启用 Veo 单条视频内部的蒙太奇或跳切。

## 2. 官方能力边界

根据 Google Cloud 官方 Veo 文档：

- Veo 支持使用图片作为生成视频的第一帧，并可同时提供描述性文本。
- Veo 短视频支持 4、6、8 秒离散生成时长。
- 提示词可描述静态、推拉摇移、快速摇摄、慢动作、快节奏动作、延时等镜头与时间元素。
- 提示词也理解 `match cut`、`jump cut`、`montage` 等电影剪辑术语。
- Google 同时提示：部分高级机位和镜头控制并非官方稳定支持，结果可靠性取决于整体提示和具体场景。

因此，MVP 继续采用“一张分镜图 -> 一条 Veo 视频 -> 一个独立镜头”。官方支持片内剪辑语言不等于可稳定、可逐镜验收的结构化剪辑能力。

## 3. 产品决策

| 用户档位 | 目标镜头时长 | 15 秒参考镜头数 | 用途 |
|---|---:|---:|---|
| 自动 | Skill 从慢/中/快中选择 | 依内容而定 | 默认；按文稿、风格与情绪判断 |
| 慢 | 约 7 秒 | 3 镜 | 氛围、情绪、产品质感、长动作 |
| 中 | 约 4.5 秒 | 4 镜 | 普通讲解、介绍、叙述 |
| 快 | 约 2.5 秒 | 6 镜 | 营销、信息流、快速展示 |

镜头数公式：

```text
expectedCount = ceil(actualVoiceDuration / targetShotDuration)
```

最少一镜。每镜最终 `playDuration` 可以短于 4 秒；Veo 的 `generationDuration` 仍取覆盖它的最小值 4、6 或 8 秒。

## 4. 语义切分

字数只作为弱参考，不直接按固定字数截断。Skill 应按以下优先级选择切点：

1. 完整短句和标点；
2. 信息点、动作、对象或场景变化；
3. 情绪、重音和语气转折；
4. 在不破坏原文顺序和完整性的前提下，使各镜时长接近目标值。

所有 `segments[].script` 拼接后必须与确认文稿一致，不得改写、遗漏或重复。

## 5. 数据合同

用户选择保存为：

```ts
type ShotPace = 'auto' | 'slow' | 'medium' | 'fast'
```

传给 `jc-script-storyboard`：

```json
{
  "shotPace": "auto"
}
```

Skill 和 `jc-gpt-image` 的最终分镜结果必须返回：

```json
{
  "resolvedPace": "medium",
  "segments": []
}
```

当用户选择慢、中或快时，`resolvedPace` 必须等于用户选择；自动档只允许解析为慢、中或快。客户端根据 `resolvedPace` 和真实配音时长校验段数。

## 6. 失效与持久化

- 改镜头节奏不影响文稿、声音方案和已生成配音。
- 改镜头节奏会使分镜计划、分镜图、视频和成片失效。
- 新任务默认 `auto`。
- 旧持久化数据缺少该字段时迁移为 `auto`；旧任务已有分镜素材时保持素材可恢复，不主动重算。

## 7. 费用边界

快节奏会增加图片和视频任务数量。界面在文稿阶段显示预计镜头数；最终任务数以真实配音和 `resolvedPace` 为准。MVP 不提供更快的“极快”档，也不允许模型偏离公式任意增加镜头。

## 8. 验收

1. UI 提供自动、慢、中、快四档，默认自动。
2. 15 秒真实配音分别产生慢 3 镜、中 4 镜、快 6 镜。
3. 自动档必须回传并保存最终采用的慢、中或快节奏。
4. 改节奏只清空视觉链路，保留配音。
5. 每条 Veo 提示仍包含“单一连续镜头、无切镜”；旁白、对白、音乐、环境声和动作音效按分镜与声音路线正常编写。
6. 旧任务可恢复，缺失 `shotPace` 时默认自动。

## 9. 官方来源

- [Google Cloud：Video generation prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide)
- [Google Cloud：Generate videos from images using Veo](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-an-image)
- [Google Cloud：Vertex AI release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)
