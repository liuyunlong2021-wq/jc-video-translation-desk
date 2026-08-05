# TDD-11：视频反推剧本输入路线

> 日期：2026-08-05
> 状态：待执行
> 上位设计：`/Users/by3/Documents/peiyin-pyvideotrans/docs/wiki/开发/jc-video-reverse独立AppSDD.md`
> 前置依赖：`docs/tdd/00-共享生产合同与状态机TDD.md`、`docs/tdd/08-项目与剧集数据边界TDD.md`、`docs/tdd/09-项目与剧集UITDD.md`

## 1. 产品结论

在「点一点」现有“文稿”阶段增加第二种项目输入路线：

```text
文字创作 -> 生成/导入文稿 -> 确认文稿
视频反推 -> 选择本集原片 -> 一键反推 -> 只校准争议台词 -> 确认文稿
```

两条路线在《确认文稿》合流。合流后的项目总监、Seed Audio / 逐句后配、资产、分镜和成片不改语义。

本 TDD 不新建 App、窗口、Store、Wiki 体系或顶部阶段。“台词校准”不做独立工作流，它只是反推草稿进入现有“确认文稿”之前的质量门禁。

## 2. 已有能力与真实缺口

### 2.1 直接复用

- `electron/material-transcript.ts`：Faster-Whisper 运行方式、JSON/SRT 成对原子落盘。
- `electron/cloud.ts`：NewAPI Key 安全存储、`gemini-3.6-flash`、停止、超时和真实错误。
- `electron/media-workspace.ts`：项目根目录、`episodeId` 隔离、路径越界防护和原子写。
- `src/store/mediaTask.ts`：当前项目/剧集状态，不建第二套状态机。
- `VideoManage.vue` 的现有 Markdown 文稿编辑器和 `approveScript()` 确认链。

### 2.2 不能直接复用

`cloud.analyzeMaterialVideo()` 是“确认文稿 + 导演分镜 -> 素材剪辑点”接口，它要求已有 `approvedScript` 和 `shots`，不是视频反推。不改它的参数和现有行为；反推增加一个薄 IPC，只复用同一个云请求底层。

当前 `material-transcript.ts` 还有两个实际问题，本 TDD 一并修正：

1. Python 和模型默认路径硬编码指向另一个仓库，打包后不可用。
2. Whisper 未开启 `word_timestamps`，可能把一句话拉成包含长静音的假区间。

## 3. 唯一执行链

```text
选择并归档本集原片
-> ffprobe 检查
-> Faster-Whisper 生成台词母时间轴
-> 按请求大小决定整片或对白间隙切片
-> Gemini 读取原生视频 + Whisper cues
-> 程序合并场次、人物、动作、说话人、情绪和争议证据
-> Gemini 只复核争议片段
-> 用户处理仍未决的争议项
-> 程序生成 final-timeline.json 和《反推剧本》
-> 载入现有文稿编辑器
-> 用户点击现有“确认文稿”
```

原则：

- Whisper 是已识别对白的时间母证据和初始文字，不再被当成永远正确的最终文字。
- Gemini 第一次读原片时同时判断画面语义和原声，但对 Whisper 的修正只能写成建议。
- 程序不会“投票猜台词”，只校验结构、收集冲突和应用已确认决策。
- 对已有 Whisper cue，台词校准永不改 `startMs/endMs`。
- Whisper 漏句只能作为“候选新 cue”，必须经用户接受后才进入最终时间线。

## 4. 纯 TypeScript 数据合同

新增 `src/runtime/videoReverse.ts`，只放类型、校验、决策应用和 Markdown 渲染纯函数，不依赖 Vue、Electron、文件系统或网络。

### 4.1 反推对白

```ts
type ReverseCueSource = 'whisper' | 'gemini-missed'
type ReviewDecision = 'pending' | 'keep-original' | 'accept-suggestion' | 'manual'

interface ReverseDialogueCue {
  cueId: string
  source: ReverseCueSource
  startMs: number
  endMs: number
  whisperText?: string
  suggestedText?: string
  finalText: string
  speakerId: string | null
  type: 'dialogue' | 'OS' | 'VO'
  emotion: string | null
  confidence: 'high' | 'medium' | 'low'
  adoptedBy: 'whisper' | 'user'
}
```

- `source=whisper` 时 `cueId/startMs/endMs/whisperText` 必须回指原始 Whisper JSON。
- 模型建议不得直接改 `finalText`。只有用户接受建议或手工修改时，`adoptedBy` 才变为 `user`。
- `source=gemini-missed` 只能由已确认的漏句产生，使用稳定 `manual-cue-*` ID，不伪造 Whisper `cueId`。

反推专用 Whisper JSON 在现有 `MaterialTranscriptCue` 基础上额外保存 `recognitionConfidence: number | null`，其值为有效词置信度的平均值。这是校准筛选证据，不改现有素材 SRT 合同。

### 4.2 台词校准项

```ts
interface DialogueReviewItem {
  issueId: string
  cueId: string | null
  startMs: number
  endMs: number
  issueTypes: Array<
    | 'text-conflict'
    | 'missing-dialogue'
    | 'unknown-speaker'
    | 'speaker-conflict'
    | 'emotion-uncertain'
  >
  originalText: string | null
  suggestedText: string | null
  suggestedSpeakerId: string | null
  suggestedEmotion: string | null
  reason: string
  evidence: string
  confidence: 'high' | 'medium' | 'low'
  decision: ReviewDecision
  manualText?: string
  manualSpeakerId?: string
  manualEmotion?: string
  manualStartMs?: number
  manualEndMs?: number
}
```

- 同一 `cueId + issueTypes` 去重，所有原始建议保留在 `gemini-analysis.json`。
- 已有 cue 的手工决策不接受 `manualStartMs/manualEndMs`。
- 漏句必须有原片范围内的区间，用户可接受或手工调整该区间。
- 任一 `decision=pending` 时不允许确认文稿。

### 4.3 最终时间线

```ts
interface VideoReverseTimeline {
  schemaVersion: 1
  sourceVideoPath: string
  sourceFingerprint: string
  durationMs: number
  characters: ReverseCharacter[]
  scenes: ReverseScene[]
  review: DialogueReviewItem[]
}
```

`scenes[].dialogue` 使用 `ReverseDialogueCue`。场次、动作、人物、道具和台词只记录原片可见可听事实；未知姓名使用稳定匿名人物，不猜测。

## 5. 原片、Whisper 与切片

### 5.1 归档

左栏“选择本集原片”通过 Electron 主进程选文件，复制到：

```text
episodes/<episodeId>/inputs/video-reverse/source.<ext>
```

选择成功前先用 `ffprobe` 确认文件存在、有可读视频流且时长大于零。用户原文件只读，不移动、改名、删除或覆盖。

### 5.2 Faster-Whisper

- 使用现有 `large-v3-turbo`，不增加第二个 ASR 模型。
- 语言默认自动识别，不写死中文。
- 开启 `beam_size=5`、`vad_filter=True`、`condition_on_previous_text=False`、`word_timestamps=True`。
- 每个 cue 优先使用首词开始和末词结束，无有效词时才回退 segment 边界。
- 有效词的平均 probability 写入 `recognitionConfidence`；无有效词时写 `null`，不伪造高置信。
- JSON 与 SRT 的 cue 数量、文字和时间必须一致。
- 运行时解析顺序为：`FASTER_WHISPER_PYTHON/FASTER_WHISPER_MODEL` 环境变量 -> `process.resourcesPath/runtime/faster-whisper/` 和 `process.resourcesPath/models/faster-whisper-large-v3-turbo/` -> 仓库同名 `resources/` 开发目录。生产代码不保留另一个仓库的绝对路径默认值。

### 5.3 按需切片

切片不按固定时长触发。先用最终 OpenAI 兼容 JSON 的 UTF-8 字节数判断；超出安全上限或上游明确拒绝时，再使用 `ffmpeg` 在 Whisper cue 间隙切片。

- 切点不得穿过 cue。
- 每段保存 `sourceStartMs/sourceEndMs`，模型返回的局部时间由程序转为原片绝对时间。
- 切片只是受控分析产物，不改原片和 Whisper cue。
- 成功切片可复用；重试只发送失败段。

## 6. Gemini 原生视频分析

新增反推专用 IPC，但底层继续使用 `cloud.ts` 现有 NewAPI Key、停止、超时、流式 JSON 和错误翻译。模型固定为 `gemini-3.6-flash`。

请求头继续使用 `Authorization: Bearer <key>` 和 `x-api-key: <key>`，并发送正常 `User-Agent`。Key 只由现有 `safeStorage`/会话读取，不经过渲染进程或项目文件。

视频 part 必须是：

```json
{ "type": "video_url", "video_url": "data:video/mp4;base64,..." }
```

`video_url` 是字符串，不是自定义对象，不发成普通 `file` part，不用抽帧或文字摘要冒充模型已读视频。MIME 和 Data URL 头必须一致，首批支持 MP4、MOV。

第一次分析同时完成：

1. 场次、时间、空间、场景和道具。
2. 稳定人物 ID、可见特征和已有证据支持的姓名。
3. 可见动作、表情和可听音效。
4. 每个 Whisper `cueId` 对应的说话人、对白类型和情绪。
5. 对每个 Whisper `cueId` 返回 `transcriptVerdict: match | suspect`；`match` 也必须显式返回，不得省略未发现问题的 cue。
6. 原声/画面字幕与 Whisper 疑似冲突的修正建议。
7. 原片明确听到但 Whisper 漏掉的候选对白。

模型不直接输出最终 Markdown。任何结构无效、未知 `cueId`、越界时间或修改原 cue 时间的结果都拒绝落盘。

## 7. 台词校准节点

### 7.1 程序筛选

只把以下项目进入校准：

- Gemini 标记的 `dialogue.text` 冲突；
- Gemini 发现的 Whisper 漏句；
- Whisper `recognitionConfidence` 低于代码常量 `VIDEO_REVERSE_LOW_CONFIDENCE` 的 cue；首版默认 `0.60`，只根据固定样片回归调整，不暴露为用户参数。
- 未知说话人、说话人冲突或低置信情绪；
- 用户在结果中主动标记的台词。

不对整片再做一次自由审稿，不把所有正常 cue 重复付费提交。

### 7.2 Gemini 定向复核

对每组相邻争议项，复用原分析切片或用 `ffmpeg` 生成包含上下文的最小视频片段，同时提交：

- 原始视频片段；
- 争议 cue 和相邻 cue；
- 第一次分析建议；
- 场次和稳定人物表。

返回只能是「建议文字 / 说话人 / 情绪 / 理由 / 置信度」，不能直接覆盖 Whisper 或最终时间线。

### 7.3 最小人工确认

反推完成且存在争议时，中栏文稿上方显示“待校准 N 条”。点击后打开一个可关闭的校准对话框，不新建全屏工作台。

每条只显示：

```text
原片片段播放
时间 / 说话人 / 情绪
Whisper 原文
Gemini 建议 + 理由
[保留原文] [接受建议] [手工修改]
```

漏句额外允许「接受漏句 / 忽略 / 手工修改台词和区间」。所有争议处理完后只点一次“应用校准”，程序重新渲染草稿，不重跑 Whisper 和整片 Gemini。

## 8. 文稿格式与合流

程序依据 `final-timeline.json` 确定性生成：

```text
#第1集

## 场1-1

时间：夜
场景：[[wiki/场景/室外·楼下路边]]
人物：[[wiki/角色/人物甲]]
道具：[[wiki/道具/手机]]

△ 人物手持手机接听电话。

人物甲（期待）："我们等你回来吃年夜饭。"
```

程序不让模型自由写最终 Markdown，不改编原片，不添加原片之外的动作、心理或因果。

反推成功后只写入 `mediaStore.script`，阶段为 `script-generated`，并复用 `VideoManage.vue` 的现有文稿编辑器。不直接设置 `approvedScript`。

用户点击现有“确认文稿”后，继续使用当前 `approveScript()`、下游失效规则和项目总监门禁。

## 9. 最小 UI 合同

`TextGenerate.vue` 的左栏顶部增加：

```text
文稿来源
[文字创作] [视频反推]
```

`video-reverse` 模式隐藏文本模型、视频模型、需求、时长、风格和镜头节奏控件，只显示：

```text
本集原片
[选择视频]
文件名 / 时长 / 文件大小
[一键反推剧本]
检查视频 / 识别台词 / 分析视频 / 校准争议 / 生成剧本
```

- 项目已有正式输入后锁定模式；需要另一条路线时新建项目。
- 没有争议时不弹出校准对话框，直接显示反推草稿。
- 有争议时允许关闭对话框稍后继续，但“确认文稿”保持禁用并显示待处理数量。
- 执行按钮显示真实步骤和真实错误，不显示 Schema、切片参数或模型选择器。

## 10. 项目状态和文件

### 10.1 Store

```ts
type ProjectInputMode = 'text-create' | 'video-reverse'
type VideoReverseStep = 'probe' | 'whisper' | 'split' | 'analyze' | 'calibrate' | 'render'

interface VideoReverseState {
  sourceVideoPath: string
  sourceFingerprint: string
  whisperJsonPath: string
  whisperSrtPath: string
  segmentsManifestPath: string
  geminiAnalysisPath: string
  reviewPath: string
  finalTimelinePath: string
  draftScriptPath: string
  status: 'idle' | 'running' | 'review' | 'ready' | 'failed' | 'stale'
  completedStep?: VideoReverseStep
  pendingReviewCount: number
  error?: string
}
```

- `projectInputMode` 属于项目共享状态；缺失字段的旧项目恢复为 `text-create`。
- `videoReverseState` 属于当前剧集，不进入 `shared-state.json`。
- 原片路径和所有产物只保存项目相对路径。
- `busyAction`、临时播放时间和对话框开关不持久化。

### 10.2 项目产物

```text
episodes/<episodeId>/inputs/video-reverse/source.<ext>
episodes/<episodeId>/inputs/video-reverse/segments/segments.json
episodes/<episodeId>/inputs/video-reverse/segments/segment-*.mp4
wiki/转录/<episodeId>/source-whisper.json
wiki/字幕/素材/<episodeId>/source-whisper.srt
wiki/反推/<episodeId>/gemini/segment-*.json
wiki/反推/<episodeId>/gemini-analysis.json
wiki/反推/<episodeId>/calibration/group-*.json
wiki/反推/<episodeId>/dialogue-review.json
wiki/反推/<episodeId>/final-timeline.json
wiki/反推/<episodeId>/待人工复核.md
wiki/文稿/<episodeId>/反推剧本.md
wiki/文稿/<episodeId>/确认文稿.md
```

`final-timeline.json` 是反推结构事实源；《反推剧本》是可编辑草稿；《确认文稿》仍是全部创作下游的唯一文稿事实源。

## 11. 失败、续跑与失效

- Whisper 成功、Gemini 失败：从已有 Whisper 产物继续，不重跑 ASR。
- 部分 Gemini 切片成功：只重试失败段。
- Gemini 成功、校验/校准应用/渲染失败：不重复发起整片付费请求。
- 对话校准完成后只重新合并和渲染。
- 原片指纹不变：重新打开项目可从 `completedStep` 续跑。
- 更换原片：Whisper、切片、Gemini、校准、反推草稿及它产生的下游统一变为 `stale`，不删除原产物。
- 用户手工修改《反推剧本》：只按现有文稿规则失效下游，不自动重跑反推。
- 原片只有在用户明确重新选择后才替换；不提供隐式清空或自动覆盖。

## 12. IPC 和代码改动边界

必需改动：

```text
src/runtime/videoReverse.ts
src/runtime/videoReverse.test.ts
electron/video-reverse.ts
electron/types.ts
electron/ipc.ts
electron/preload.ts
electron/electron-env.d.ts
electron/material-transcript.ts
electron/media-workspace.ts
src/store/mediaTask.ts
src/runtime/mediaPersistence.ts
src/views/Home/components/TextGenerate.vue
src/views/Home/components/VideoManage.vue
src/views/Home/index.vue
```

最小 IPC：

```ts
selectVideoReverseSource(projectId, episodeId)
runVideoReverse(projectId, episodeId)
saveVideoReverseReview(projectId, episodeId, decisions)
```

不按 Whisper、切片、Gemini、校准、渲染各拆一个前端 IPC。一键执行由主进程线性编排，状态文件记录可续跑步骤。

## 13. 测试先行清单

### 13.1 纯合同测试

1. 拒绝重复/未知 cue ID、越界/重叠时间和空台词。
2. Gemini 修改 Whisper cue 时间时拒绝合并。
3. 模型文字建议不会自动改写 `finalText`。
4. 保留原文、接受建议和手工修改三种决策正确且可重放。
5. 未确认漏句不进最终时间线，确认后生成 `manual-cue-*`。
6. 存在 `pending` 项时阻止确认文稿。
7. 剧本渲染稳定产生场次、角色、道具 Wiki 双链和对白格式。

### 13.2 主进程与持久化测试

1. 选择原片只复制到当前 `projectId + episodeId`，不修改源文件。
2. 无视频流、零时长、路径越界和非支持格式被拒绝。
3. Whisper 使用词边界，JSON/SRT 完全一致。
4. Whisper 词置信度被确定性归一为 `recognitionConfidence`，低于阈值的 cue 进入校准。
5. Gemini 请求使用字符串 `video_url`、当前 Key 和固定 `gemini-3.6-flash`。
6. Gemini 对每个输入 cue 都返回一个 `transcriptVerdict`，遗漏、重复或未知 cue 被拒绝。
7. 超限时切点不穿过 cue，局部时间正确转为原片绝对时间。
8. 每个成功分段立即原子写入独立 JSON，失败只重试失败段，渲染失败不产生第二次云请求。
9. 旧项目缺失输入模式时恢复为 `text-create`。
10. 两集的原片、Whisper、Gemini、校准、时间线和剧本路径互不覆盖。
11. 反推成功只进入 `script-generated`，不自动设置 `approvedScript`。
12. API Key 不进入项目状态、请求日志、Wiki、测试快照或 Git。

### 13.3 UI 合同测试

1. `video-reverse` 只显示原片和一键反推操作。
2. 正式输入存在后无法切换项目输入模式。
3. 无争议时不弹窗；有争议时显示数量并禁用确认文稿。
4. 校准对话框有可见关闭按钮，可播放对应原片区间。
5. 应用校准后反推草稿更新，现有“确认文稿”恢复可用。

## 14. 真实样片验收

固定手工验收样片：

```text
/Users/by3/Documents/做ppt/原片/0802sanluceshi/01.mp4
```

已知基线：108.042 秒、1080x1920、约 130 MB；命令行反推已证明 Whisper -> 受控切片 -> Gemini -> 合并 -> 渲染链路可行。

验收目标：

1. 在新项目第 1 集选择样片，一键反推能产生 Whisper JSON/SRT、Gemini 证据、校准清单、最终时间线和草稿。
2. 51 条已识别 Whisper cue 不得因 Gemini 漏返而丢失；场次和人物数可受模型证据影响，不写成脆弱的固定断言。
3. 已知疑点“快去小费啊”和“我就是郭楚明”必须进入台词校准；正确文字以真实听审决定，不在测试中猜测。
4. 已知 Whisper 漏掉的“妈妈”和“别怕童童，妈妈来了”进入漏句校准，未经用户接受不得写入正式剧本。
5. 对任一争议项播放原片、保留原文/接受建议/手改，应用后时间不变且剧本立即重新渲染。
6. 确认文稿后，能继续使用现有项目总监和 Seed Audio / 逐句后配路线，不出现第二套项目数据。
7. 新建第 2 集后，两集原片、状态和产物完全隔离。

样片路径只是本机人工验收输入，不进入产品代码、自动测试或打包资源。

## 15. 明确不做

- 不新建独立 App、Electron 窗口或第二套项目管理。
- 不把反推结果直接跳到配音字幕工作台。
- 不运行 CRV、Qwen、SenseVoice、Sherpa 聚类或三路投票。
- 不新增数据库、队列服务、常驻 Python 进程或模型选择器。
- 不整片重复审稿，不让模型自动覆盖人类尚未确认的台词。
- 不在反推阶段翻译、配音、生成分镜或成片，这些继续由《确认文稿》之后的现有链路负责。

## 16. 执行顺序

1. 先写 `videoReverse.test.ts` 固定 Schema、争议决策、漏句和渲染合同。
2. 实现纯 `videoReverse.ts`，再补主进程原片归档、Whisper、Gemini 和可续跑编排。
3. 扩展现有 Store 和持久化，确认旧项目默认不变。
4. 接入左栏输入模式和最小校准对话框，最后复用现有文稿确认链。
5. 运行 `pnpm test`、`pnpm exec vue-tsc --noEmit`、`git diff --check`。
6. 用 108 秒真实样片做付费分析和桌面人工验收；未完成前不把 TDD 状态改为“已完成”。
