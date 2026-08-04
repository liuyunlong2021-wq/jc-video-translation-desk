# TDD-04：Gemini 剪辑时间轴

> 日期：2026-08-04
> 状态：已完成并验证
> 上位设计：`docs/导演分镜时间轴与角色配音编排SDD.md`
> 前置依赖：`docs/tdd/03-素材SRTTDD.md` 已完成

## 1. 目标

所有素材 SRT 就绪后，由用户点击“生成剪辑时间轴”。`gemini-3.6-flash` 逐条直读原始视频，同时读取确认剧本、该素材包含的完整分镜视频提示词和对应 Whisper JSON/SRT，通过文字证据确定稳定角色，通过画面确定戏剧动作与准确剪辑点，最后写入整集唯一 `editing-timeline.json`。

## 2. 本轮范围

1. 视频阶段新增真实“生成剪辑时间轴”按钮，必须在全部素材 SRT 就绪后才能点击。
2. 同一物理视频只向 Gemini 提交一次；Grok 多镜视频在一个请求中携带其全部 `shotId` 和完整提示词，返回多个分镜区间。
3. Gemini 固定使用已验证的 `gemini-3.6-flash`，直接读取原视频，不抽帧。
4. 请求同时包含确认剧本、素材 `MaterialTranscript` JSON、原始 SRT 和完整分镜字段。
5. Gemini 输出的每个区间必须回链 `shotId`、`promptSegmentId`、`sourceMediaId`、SRT cue 和稳定 `speakerId`。
6. 程序校验时长、区间、cue 和角色引用；不可靠或失败的镜头保留完整素材并标记 `needsReview=true`。
7. 全部素材分析结果按分镜顺序聚合为 `EditingTimeline schemaVersion: 2` 并立即原子写入项目 Wiki。

## 3. 明确不做

- 不调用 Sherpa 说话人模型，不根据脸或口型猜角色。
- 不让 Gemini 改写确认剧本、台词、情绪或导演提示词。
- 不调用 FFmpeg，不提前生成画面母版。
- 不实现剪辑点滑块、逐句 IndexTTS2 配音、人声分离或字幕烧录。
- 不保留旧的“视频生成后自动 Gemini”入口。

## 4. 输入合同

每个唯一素材调用一次：

```ts
interface AnalyzeMaterialVideoParams {
  runId: string
  mediaId: string
  videoPath: string
  transcriptJsonPath: string
  transcriptSrtPath: string
  approvedScript: string
  shots: Array<{
    shotId: string
    script: string
    soundType: 'onscreen' | 'voiceover' | 'none'
    speakerId?: string
    dialogueText?: string
    dialogueEmotion?: string
    startState: string
    actionProgression: string
    endState: string
    videoPrompt: string
  }>
}
```

门禁：

- 视频、JSON、SRT 都必须是当前项目内文件。
- JSON 必须通过 `MaterialTranscript` 校验，且 `mediaId`、`sourceMediaPath` 与当前视频一致。
- `approvedScript`、`shots` 不能为空，`shotId` 在本次请求中唯一。
- 有画面内对白的镜头必须具有确认 `speakerId`、逐字台词和情绪。

## 5. Gemini 输出与校验

Gemini 每个 shot 返回：

```text
shotId
trimStartMs / trimEndMs
observedContent
subtitleCueIds
speakerIds
confidence
needsReview
dialogue.sourceStartMs / sourceEndMs（仅画面内对白）
```

- `subtitleCueIds` 只能引用本素材转录 cue。
- `speakerIds` 只能引用分镜中已确认的角色 ID；最终台词文本和情绪取确认分镜，不取模型改写。
- 画面内对白的说话窗口必须位于采用剪辑区间内。
- 区间无效、引用无效、缺失结果、模型请求或 JSON 解析失败时，该 shot 使用 `0..sourceDurationMs`，`confidence=0`、`needsReview=true`，不得自动猜一个剪辑点。

## 6. 稳定产物

```text
wiki/剪辑/episode-001/editing-timeline.json
```

- 只存在这一份整集时间轴；重复生成原子覆盖，不创建副本。
- 初始 `geminiStartMs/geminiEndMs` 与 `adoptedStartMs/adoptedEndMs` 相同，`adoptedBy=gemini`、`revision=0`。
- `outputStartMs/outputEndMs` 必须连续。
- 后续 FFmpeg 只允许读取 `adoptedStartMs/adoptedEndMs`，但本 TDD 不执行 FFmpeg。

## 7. UI 与状态

- 全部视频生成：显示“生成 SRT”。
- 全部素材 SRT 成功：显示“生成剪辑时间轴”。
- 点击后逐素材显示 `editingStatus=running/ready/failed`。
- 成功后阶段进入配音字幕的后续入口；本 TDD 不实现工作台内容。
- 修改/重新生成视频会清空其 SRT、Gemini 结果和整集时间轴路径。

## 8. 测试先行清单

1. Gemini 请求包含一个原视频、确认剧本、完整分镜提示词、转录 JSON 和原始 SRT。
2. Grok 同一视频的多个 shot 只发一次请求并返回多个分析结果。
3. 合法输出保留真实剪辑点、观察内容、cue 和稳定角色 ID。
4. 非法区间、非法 cue/角色、缺少对白窗口和请求失败均保留完整素材并 `needsReview=true`。
5. 聚合时间轴按分镜顺序连续，初始采用值等于 Gemini 原始值。
6. 按钮严格执行 `生成 SRT -> 生成剪辑时间轴` 门禁。
7. 时间轴按钮成功后立即写入唯一 Wiki JSON；FFmpeg 尚未运行。

## 9. 验收标准

- 定向测试先红后绿。
- TDD-04 完成后运行全量 `pnpm test`。
- `pnpm exec vue-tsc --noEmit`、`git diff --check` 通过。
- Electron 桌面 UI 可见两个串行按钮，且视频生成不触发 Gemini。

## 10. 执行结果

- “生成 SRT -> 生成剪辑时间轴”已成为两个独立、串行、可点击动作；视频生成函数不再引用 Gemini 分析。
- `gemini-3.6-flash` 请求已固定携带原视频、确认剧本、同素材全部完整分镜、Whisper JSON 和 SRT；同一 Grok 物理视频只请求一次。
- 合法结果会保留真实剪辑点、观察内容、cue、角色和对白窗口；无效、遗漏或普通模型失败保留完整素材并 `needsReview=true`，API Key 缺失和用户取消仍返回真实错误。
- 整集 `EditingTimeline schemaVersion: 2` 在 FFmpeg 运行前已原子写入 `wiki/剪辑/episode-001/editing-timeline.json`。
- 全量 `pnpm test` 为 `128/128`，`pnpm exec vue-tsc --noEmit` 与 `git diff --check` 通过。
- 未执行真实付费 Gemini 调用；本地浏览器 URL 安全策略阻止自动化可视验收，因此按钮 UI 仅由类型检查和合同测试验证。
