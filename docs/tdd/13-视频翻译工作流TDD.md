# TDD-13：视频翻译工作流

> 日期：2026-08-05
> 状态：待执行
> 定位：在现有 Electron 工作台增加一个与内容创作完全隔离的视频翻译入口
> 前置依赖：`docs/tdd/00-共享生产合同与状态机TDD.md`、`docs/tdd/02-声音引擎与角色音色绑定TDD.md`、`docs/tdd/03-素材SRTTDD.md`、`docs/tdd/05-配音字幕工作台骨架TDD.md`、`docs/tdd/06-配音与字幕TDD.md`、`docs/tdd/07-音频处理与成片TDD.md`、`docs/tdd/08-项目与剧集数据边界TDD.md`、`docs/tdd/09-项目与剧集UITDD.md`、`docs/tdd/10-Seed Audio声音设计整段配音与完整声音轨TDD.md`、`docs/tdd/12-项目存储位置与资产用途版本TDD.md`

## 1. 目标

在「点一点」增加一个视频翻译工作流，把用户已有视频送入现有的 Faster-Whisper、大模型、角色声音库、Seed Audio、Spleeter 和 FFmpeg 能力，输出目标语言配音与字幕成片。

本 TDD 的核心不是复制现有创作流程，而是同时做到：

1. **工作流隔离**：内容创作和视频翻译的状态、按钮、产物、失效链互不影响。
2. **核心组件共用**：两边共用项目/剧集、三栏壳、Wiki 读写、模型请求、声音库和媒体执行器。
3. **复用 Wiki 逻辑**：翻译工作流拥有自己的 Wiki 沙箱；有项目资料时只读借鉴现有剧本、角色和声音，无资料时通过人工审核建立翻译角色 Wiki。
4. **角色跨集积累**：第一集确认的角色成为本项目翻译角色库；第二集只补新增角色，后续持续复用。

主链：

```text
上传原片
-> Faster-Whisper 源字幕
-> 结合原视频、现有 Wiki 和剧本识别说话角色
-> 大模型翻译
-> 人工审核角色、原字幕和译文
-> 豆包语音视频翻译专用编排
-> Seed Audio 生成纯目标语言人声
-> 分离原片人声和背景声
-> 混回背景声与目标语言人声
-> 烧录目标语言字幕
-> 翻译成片
```

## 2. 两个工作流的沙箱

### 2.1 不是项目二选一

视频翻译是与内容创作并列的工作台入口，不把项目锁定为某一种模式。同一项目可以：

- 只使用内容创作；
- 只使用视频翻译；
- 同时拥有两套工作流，并让翻译只读参考创作资料。

新增的入口状态只决定当前显示哪个工作台，不决定项目拥有哪些资料：

```ts
type WorkspaceEntry = 'content-create' | 'video-translate'
```

- 旧项目和新项目默认进入 `content-create`，现有启动、恢复和七阶段行为不变。
- 切换入口不清空、不迁移、不失效任何业务产物。
- `WorkspaceEntry` 可以是界面状态；翻译是否存在以当前剧集的 `videoTranslation` 状态为准。
- 内容创作继续使用现有根状态字段；翻译状态只写入独立的 `videoTranslation` 节点。

### 2.2 禁止跨沙箱写入

视频翻译不得修改或失效：

- 确认文稿、项目总监、资产、分镜、分镜图和生成视频；
- `AudioProductionRoute`、创作 `PostProductionState` 和 `editing-timeline.json`；
- 创作角色资产、创作声音绑定和创作成片；
- TDD-10 的 Seed 声音导演稿、安排和完整声音轨。

内容创作也不得清空、迁移或失效翻译原片、角色确认、译文、目标配音和翻译成片。

两个工作流只共用无业务状态的底层能力和明确的只读知识引用。后台任务提交时冻结 `projectId + episodeId + workflow`，切换入口后结果仍写回原工作流。

### 2.3 共用与隔离矩阵

| 能力 | 共用内容 | 翻译专用内容 | 禁止触碰的创作内容 |
|---|---|---|---|
| 三栏工作台 | 三栏壳、收起、滚动、预览、试听样式 | 翻译入口、六列数据适配器、右栏动作门禁 | 七阶段、创作 `segments`、剪辑点 |
| Wiki | 项目根解析、Markdown/JSON 读写、原子替换、路径校验 | `wiki/翻译/`、翻译角色和剧集索引 | 创作 Wiki 页面和回链 |
| Whisper | 现有 Faster-Whisper 运行时、模型与校验器 | 原片转录输入和翻译产物路径 | 素材 SRT 状态与路径 |
| 大模型 | 当前模型配置、请求、停止和 JSON 校验 | 多语言翻译 Schema、说话角色 Schema | 现有中译英接口、Gemini 剪辑 Schema |
| 声音 | 全局声音库、Seed 客户端、安全 Key、下载与校验 | 翻译角色声音引用、纯目标语言人声编排 | 创作角色声音绑定、完整声音轨编排 |
| 媒体 | `ffprobe`、Spleeter、FFmpeg 进程和字幕格式化 | 原片分离、目标人声混音、原片烧录参数 | 画面母版、`editing-timeline.json`、创作成片 |

实现不得复制模型客户端、媒体引擎、声音库、项目注册表、Store 或 Wiki 引擎；只增加翻译状态、翻译 Schema 和薄编排入口。

审计结论：现有代码尚无视频翻译入口、上传原片按钮、翻译状态或翻译六列工作台。Whisper、声音库、Seed、Spleeter 和 FFmpeg 可以按上表复用；现有翻译接口固定中译英，现有成片入口依赖创作 `allVideosReady` 和画面母版，因此两者只能复用底层请求/执行器，必须增加翻译专用 Schema 与编排，不能直接调用原业务动作。

## 3. Wiki 复用原则

### 3.1 复用 Wiki 逻辑，不复用创作产物路径

仓库里的 `docs/wiki/` 是本应用的研发 Wiki，只用于审计设计和代码事实，绝不能作为某个用户视频翻译任务的上下文。运行时只读取当前 `projectId` 所属项目根内的 `wiki/`；不同项目之间不共享角色、剧本或翻译资料。

翻译工作流继续遵守现有 Wiki 原则：

- 结构化状态、稳定 ID、文件哈希和媒体路径是执行事实源；
- Markdown 是可读投影、人工审核页和导航，不替代运行状态；
- 所有路径相对项目根并由 `resolveProjectRoot(projectId)` 解析；
- 资料按 `projectId + episodeId` 隔离，写入采用原子替换；
- 角色、剧集、声音、字幕、音频处理和成片形成可追溯链接。

翻译自己的业务事实统一写入：

```text
wiki/翻译/
```

不得把翻译状态伪装成创作 `segments`、`editing-timeline.json`、确认文稿或项目总监资料。

### 3.2 可借鉴的现有资料

翻译角色识别时可以只读检索当前项目已有的：

```text
wiki/文稿/*/确认文稿.md
wiki/项目总监/*.md
wiki/资产/角色/*.md
wiki/声音/角色/*.md
wiki/翻译/角色/*.md
```

同时没有这些资料是合法状态。模型输入必须记录实际读取的相对路径与内容哈希，不能声称读取了不存在的 Wiki。

读取原则：

- 先读取本项目翻译角色库；
- 再读取已有创作角色和声音资料作为候选；
- 剧本只作为角色、称呼和台词校对证据，不覆盖 Whisper 原始证据；
- 只选择与当前视频相关的角色摘要和剧本文本，不把整个项目目录无上限塞入模型请求。

### 3.3 翻译角色库

翻译角色库属于项目级知识，所有剧集共享：

```text
shared-state.json -> videoTranslationRoles
wiki/翻译/角色/<translationRoleId>.md
wiki/翻译/声音/<translationRoleId>.md
```

`shared-state.json.videoTranslationRoles` 是跨集执行事实源，角色 Markdown 是它的可读投影和导航。该字段是独立可选切片；未使用翻译的旧项目不写入此字段，现有 `referenceAssets` 和角色声音字段保持原值。

角色页至少保存：

```ts
interface TranslationRole {
  translationRoleId: string
  displayName: string
  aliases: string[]
  description?: string
  linkedCreativeRoleId?: string
  voiceProfileId?: string
  sourceEpisodeIds: string[]
  status: 'confirmed'
}
```

- 匹配到已有创作角色时只保存 `linkedCreativeRoleId` 引用，不修改创作角色页或创作 Store。
- 未匹配角色由模型提出临时候选，只有用户确认后才能创建正式 `translationRoleId`。
- 同名不足以自动合并角色；用户确认前保持候选状态。
- 后续剧集先复用已确认翻译角色，只为无法匹配的新人物创建候选。
- 翻译声音页可以引用已有全局 `voiceProfileId`，但不能覆盖创作工作流的声音绑定。
- 场景和道具不建立翻译资产库；本 TDD 只积累对说话人识别和配音有价值的角色知识。

## 4. 三栏 UI 合同

### 4.1 工作台入口

现有内容创作入口、七阶段和三栏布局保持原样。在应用现有入口区增加：

```text
[内容创作] [视频翻译]
```

进入视频翻译后：

- 顶部项目和剧集选择器保持可用；
- 左栏只显示当前剧集、目标语言和已确认翻译角色导航；
- 中栏是视频字幕工作台；
- 右栏是当前角色的声音选择和所有执行按钮；
- 不显示项目总监、资产、分镜、分镜图和视频生成操作。

### 4.2 上传按钮

右栏第一个按钮固定为：

```text
[上传/更换视频]
```

- 按钮始终存在，没有项目或任务运行中时禁用。
- 中栏未上传时只显示视频空状态，不增加第二个重复上传按钮。
- 更换视频必须二次确认；成功归档新视频后才使当前翻译集下游变为 `stale`。
- 取消选择或归档失败不得改变当前视频和下游状态。

### 4.3 中栏视频字幕工作台

现有 `DubbingSubtitleWorkspace` 直接绑定创作 `segments`、`allEditingReady`、剪辑点和固定中英文列，不能直接承载翻译数据。新增兄弟组件 `VideoTranslationWorkspace`，复用现有三栏壳、`managedMediaUrl`、视频/音频原生控件、表格布局和视觉尺寸；它只消费 `VideoTranslationState`。不得在现有组件中加入会改变创作门禁或列语义的翻译分支。

翻译模式固定六列：

```text
时间轴 | 视频片段预览 | 说话角色 | 原字幕 | 译文字幕 | 目标语言配音
```

- 主预览始终播放上传原片，选择 cue 后跳到该时间窗并在终点暂停。
- 时间轴来自原片 Whisper cue，不显示创作剪辑点滑块，不允许裁切或重排画面。
- “说话角色”是可选择的已确认角色或“新角色”候选。
- 原字幕、译文字幕都可编辑并自动保存；Whisper 原始 JSON 保留不覆盖。
- 目标语言配音列按 cue 时间窗试听整集目标人声轨，存在逐 cue WAV 时优先试听该文件。
- 列名不固定为中文/英文，跟随已确认的源语言和目标语言显示。

选中一行后，右栏顶部显示该翻译角色和复用现有全局声音库的 `v-select`，用于选择或更换 `voiceProfileId`，并提供参考音试听。声音绑定只写翻译角色切片和 `wiki/翻译/声音/`；不得调用现有创作角色绑定写入。未绑定声音的角色仍可完成字幕审核，但“生成豆包配音安排”保持禁用并显示缺失角色。

### 4.4 右栏按钮

按钮始终显示并按依赖禁用：

```text
上传/更换视频
生成原字幕
识别说话角色
翻译所有字幕
确认角色与字幕
生成豆包配音安排
生成目标语言配音
分离原人声和背景声
去除原人声
混回背景声和目标语言配音
烧录字幕和配音
```

不增加保存字幕、确认时间轴、音频模式、成片语言、最终混音试听或第二个成片按钮。

## 5. 上传与源字幕

### 5.1 原片归档

新增最小的视频选择 IPC，复用现有 `showOpenDialog`、项目路径校验、文件复制和相对路径能力。只接受现有 FFmpeg/Whisper 可读取的视频格式：

```text
.raw/视频翻译/<episodeId>/source.<ext>
episodes/<episodeId>/video-translate/source.<ext>
```

`.raw` 保存原始证据快照；受控 episode 文件供 Whisper、预览和 FFmpeg 使用。用户原文件不移动、不改名、不删除、不覆盖。

上传后用 `ffprobe` 校验文件、视频流、真实时长和音频流。无音频视频允许预览，但阻塞转录、说话角色识别和配音替换。

### 5.2 Faster-Whisper

直接复用 TDD-03 的 Faster-Whisper、Python 运行时、模型和 `MaterialTranscript` 校验，不复制模型或进程。

产物：

```text
wiki/翻译/<episodeId>/source-whisper.json
wiki/翻译/<episodeId>/source.srt
```

- cue ID 稳定唯一，时间递增、不重叠、不越界。
- Whisper 原文和时间是不可覆盖的原始证据。
- 用户修订写入独立的审核草稿，不改 `source-whisper.json`。
- 无有效 cue 时明确阻塞，不生成假台词或假说话人。

## 6. 说话角色识别与人工审核

### 6.1 模型输入

“识别说话角色”复用现有 Gemini 原生视频请求和文本模型基础设施，但使用独立的视频翻译 Schema，不调用创作 `analyzeMaterialVideo`，不生成 `editing-timeline.json`。

输入：

```text
原生视频
+ Whisper cue ID、文字和时间
+ 翻译角色库摘要
+ 可选创作角色/声音资料
+ 可选确认剧本和项目总监资料
```

输出草稿至少包含：

```ts
interface TranslationSpeakerDraft {
  cueId: string
  proposedRoleId?: string
  proposedName: string
  confidence: number
  evidence: string
  needsReview: boolean
}
```

模型不能改写 cue ID、时间或 Whisper 原文，不能直接创建正式角色。

### 6.2 人工确认

用户在中栏逐行：

- 校对原字幕；
- 将说话人绑定到已确认翻译角色；
- 将说话人链接到已有创作角色；
- 或确认创建一个新的翻译角色；
- 校对大模型译文。

点击“确认角色与字幕”后才写入正式产物：

```text
wiki/翻译/<episodeId>/角色台词确认.json
wiki/翻译/<episodeId>/角色台词确认.md
wiki/翻译/角色/<translationRoleId>.md
```

正式确认文件是目标语言配音的唯一角色与台词输入。任一有声 cue 缺少已确认角色、源文字或译文时，不开放豆包配音安排。

## 7. 大模型翻译

翻译复用现有文本模型配置、停止/失败处理和 JSON 校验。新增视频翻译专用请求合同，底层仍调用现有文本生成能力；现有 `cloud-translate-subtitles` 参数和中译英行为不变。

```ts
interface TranslateVideoSubtitlesInput {
  runId: string
  episodeId: string
  sourceLanguage: string
  targetLanguage: string
  subtitles: Array<{
    cueId: string
    roleName?: string
    text: string
  }>
  contextPaths: Array<{ path: string; hash: string }>
}
```

返回必须保持 cue ID、数量、顺序和时间，不得合并、拆分或新增台词。译文写入审核草稿；只有“确认角色与字幕”后才成为正式输入。

目标语言使用明确的语言代码或 BCP-47 标签。第一轮至少验收中文和英文；未由翻译模型与 Seed Audio 共同支持的语言不开放。

## 8. 豆包语音视频翻译专用编排

### 8.1 独立于创作 Seed 编排

视频翻译默认使用 `seed-audio`，复用 TDD-10 已有的：

- Seed API Key 安全存储；
- 官方请求客户端；
- 临时 URL 下载和 Base64 备用；
- `ffprobe` 校验和 48kHz 双声道 WAV 转换；
- 最多三个参考音；
- 多任务混轨和 Faster-Whisper 时间证据。

不得复用或改写 TDD-10 的项目总监、创作 `整段配音安排.json`、声音导演稿和完整声音轨。翻译使用独立安排：

```text
wiki/翻译/<episodeId>/<targetLanguage>/豆包配音安排.json
```

### 8.2 安排合同

```ts
interface VideoTranslationSeedArrangement {
  schemaVersion: 1
  projectId: string
  episodeId: string
  sourceVideoFingerprint: string
  targetLanguage: string
  confirmedDialogueHash: string
  translationRoleLibraryHash: string
  voiceBindingHash: string
  durationMs: number
  references: Array<{
    translationRoleId: string
    voiceProfileId: string
    providerSpeakerId?: string
  }>
  tasks: Array<{
    taskId: string
    startMs: number
    endMs: number
    cueIds: string[]
    translationRoleIds: string[]
    referenceRoleIds: string[]
    mode: 'translation-dialogue-only'
    includeMusicAndEffects: false
    status: ArtifactStatus
    error?: string
  }>
  status: ArtifactStatus
  blockers: string[]
}
```

确定性规划器执行：

1. 读取已确认 cue、角色映射、目标语言和原片时长。
2. 为每个有声角色读取翻译声音绑定；缺少绑定时阻塞并引导选择已有声音或生成 Seed 参考音。
3. 按原片连续时间窗建立任务，不改变 cue 的绝对时间。
4. 每任务最多携带三个官方参考音；超过三个角色时按连续 cue 拆成多个纯人声任务。
5. 同一 cue 只能属于一个任务，任务不得遗漏、重复或交换角色参考音。
6. 校验官方字符、时长和参考音限制，失败原因写入 `blockers`。
7. 生成前重新校验源视频、角色确认、译文和声音绑定哈希。

### 8.3 翻译声音提示词

“生成豆包配音安排”同时按任务生成可编辑提示词：

```text
wiki/翻译/<episodeId>/<targetLanguage>/豆包语音稿.md
```

提示词必须写清：

- 目标语言；
- 角色与参考音映射；
- 每句已确认译文和 cue ID；
- 情绪、语速、停顿和重音；
- 原片绝对时间窗；
- 只生成干净人声；
- 禁止音乐、环境声、动作音效和额外台词。

用户可编辑表演要求，但不能在此页改角色、cue ID 或正式译文。生成目标语言配音只读取当前已保存的豆包语音稿和安排，不在按钮内部重新调用 Skill 覆盖用户修改。

### 8.4 生成与对齐

每个 Seed 任务输出纯人声轨。后端：

1. 立即下载并校验每个任务音频；
2. 自动运行 Faster-Whisper，获得目标人声实际时间证据；
3. 用已确认译文确定正式字幕文字，Whisper 只提供时间；
4. 校验每个 cue 是否落在原片允许时间窗；
5. 失败 cue 标记 `needsReview`，不得截断、覆盖或静默加速；
6. 将通过校验的任务按原片绝对时间放置并混成唯一目标人声轨。

产物：

```text
wiki/翻译/<episodeId>/<targetLanguage>/任务音频/<taskId>.wav
wiki/翻译/<episodeId>/<targetLanguage>/目标人声.wav
wiki/翻译/<episodeId>/<targetLanguage>/目标人声时间轴.json
wiki/翻译/<episodeId>/<targetLanguage>/声音生成记录.json
```

翻译 Seed 任务只生成人声，原片音乐、环境声和动作音效始终来自后续 Spleeter 背景轨，不能由多个 Seed 任务重复生成。

## 9. 音频处理与成片

### 9.1 分离与混回

复用 TDD-07 的 Spleeter 和 FFmpeg 执行器，但输入输出位于翻译沙箱：

```text
原片音轨 -> vocal.wav + instrument.wav
instrument.wav + 目标人声.wav -> mixed.wav
```

“去除原人声”只更新采用状态，不删除 `vocal.wav`。最终混音不得再次包含原人声。

```text
wiki/翻译/<episodeId>/<targetLanguage>/音频/vocal.wav
wiki/翻译/<episodeId>/<targetLanguage>/音频/instrument.wav
wiki/翻译/<episodeId>/<targetLanguage>/音频/mixed.wav
wiki/翻译/<episodeId>/<targetLanguage>/音频处理.json
```

### 9.2 烧录

复用现有 FFmpeg 进程、字幕格式化、停止和错误处理，但增加翻译专用编排入口：

- 直接使用上传原片完整画面；
- 保持原始宽高比和完整时长，不经过创作画面母版；
- 使用已确认目标语言字幕；
- 只使用 `mixed.wav`；未完成分离、去除原人声采用和背景声混回时不得烧录；
- 不检查 `allVideosReady`，不读取或生成创作 `editing-timeline.json`。

产物：

```text
episodes/<episodeId>/video-translate/<targetLanguage>/final.mp4
wiki/翻译/<episodeId>/<targetLanguage>/成片.md
```

## 10. 状态与事实源

不新建第二个 Store。当前剧集状态增加一个完全隔离的可选节点：

```ts
interface VideoTranslationState {
  sourceVideoPath?: string
  sourceFingerprint?: string
  sourceLanguage?: string
  targetLanguage?: string
  sourceTranscriptPath?: string
  speakerDraftPath?: string
  confirmedDialoguePath?: string
  translatedDraftPath?: string
  seedArrangementPath?: string
  seedPromptPath?: string
  targetVoicePath?: string
  vocalPath?: string
  instrumentPath?: string
  mixedPath?: string
  finalVideoPath?: string
  transcriptStatus: ArtifactStatus
  speakerStatus: ArtifactStatus
  translationStatus: ArtifactStatus
  reviewStatus: ArtifactStatus
  arrangementStatus: ArtifactStatus
  voiceStatus: ArtifactStatus
  separationStatus: ArtifactStatus
  mixStatus: ArtifactStatus
  finalStatus: ArtifactStatus
  originalVocalRemoved: boolean
  error?: string
}
```

项目级翻译角色库写入 `shared-state.json.videoTranslationRoles`，只保存稳定角色 ID、别名、创作角色引用和声音引用；不得写入现有 `referenceAssets` 或创作声音绑定。每集 `episodes/<episodeId>/state.json` 只保存自己的 `videoTranslation`，不得复制整份项目角色库。

## 11. 失效与恢复

| 变化 | 只失效翻译工作流中的 | 保留 |
|---|---|---|
| 原片变化 | 源字幕、角色草稿、译文、确认、安排、配音、分离、混音、成片 | 翻译角色库、创作全部资料 |
| Wiki 参考资料变化 | 未确认的角色识别草稿 | 已确认角色台词、翻译下游、创作资料 |
| 原字幕或角色修改 | 译文、确认、安排、配音、混音、成片 | Whisper 原始证据、分离 stems、角色库 |
| 译文修改 | 确认、安排、配音、混音、成片 | 原片、角色映射、分离 stems |
| 翻译角色声音变化 | 安排、配音、混音、成片 | 原片、字幕、创作声音绑定 |
| 豆包语音稿变化 | 配音、混音、成片 | 安排、字幕、分离 stems |
| 目标人声重新生成 | 混音、成片 | 字幕、角色库、分离 stems |
| 重新分离原声 | 混音、成片 | 目标人声、字幕、角色库 |

- 失败只重试当前步骤，不删除已成功上游。
- 相同源指纹、确认哈希、目标语言和声音绑定可以继续上次步骤。
- 翻译、Seed 请求和任务音频按任务记录；继续执行不得重复已成功付费请求。
- 切换内容创作入口不得触发任何翻译失效规则，反之亦然。

## 12. 翻译 Wiki 导航

翻译 Wiki 使用自己的项目级入口和剧集索引：

```text
wiki/翻译/index.md
wiki/翻译/角色/<translationRoleId>.md
wiki/翻译/声音/<translationRoleId>.md
wiki/翻译/<episodeId>/index.md
wiki/翻译/<episodeId>/来源上下文.json
wiki/翻译/<episodeId>/角色台词确认.md
wiki/翻译/<episodeId>/<targetLanguage>/豆包配音安排.json
wiki/翻译/<episodeId>/<targetLanguage>/豆包语音稿.md
wiki/翻译/<episodeId>/<targetLanguage>/音频处理.json
wiki/翻译/<episodeId>/<targetLanguage>/成片.md
```

- 翻译入口由应用直接打开 `wiki/翻译/index.md`；翻译保存不得改写现有项目 `wiki/index.md` 或触发创作 `renderWiki`。
- `wiki/翻译/index.md` 汇总项目翻译角色和各集翻译状态。
- 剧集翻译索引连接原片、实际读取的 Wiki 来源、角色确认、字幕、豆包安排、目标人声、音频处理和成片。
- 跨工作流引用只从翻译页指向创作资料，不向创作页面写回链，避免翻译更新改动创作事实。
- 没有创作 Wiki 的独立翻译项目仍可完整生成上述翻译 Wiki。

## 13. 安全与成本边界

- 渲染进程不直接读取本地视频、Wiki 或调用模型；全部经过显式 preload/IPC。
- API Key 只存 Electron `safeStorage` 或当前会话，不写状态、Wiki、日志或 Git。
- 所有视频、音频和 Wiki 路径经过当前项目根与剧集边界校验。
- 模型只接收已记录的当前项目资料；不得读取其他项目 Wiki。
- 角色候选和模型译文不能自动成为正式事实，必须经过人工确认。
- 不新增模型、数据库、常驻服务、第二套声音库或第二套 Wiki 引擎。

## 14. 测试先行清单

1. 旧项目默认仍进入内容创作，现有七阶段、Store、按钮、Wiki 和恢复结果不变。
2. 同一项目可同时保存内容创作和视频翻译状态；翻译操作前后所有既有创作字段值和创作产物文件字节不变，创作操作也不改翻译切片和翻译产物。
3. 上传按钮始终位于翻译右栏；中栏不存在第二个上传按钮。
4. 原片只归档到当前项目/剧集翻译目录，原文件不移动或覆盖，越界和非视频输入被拒绝。
5. 翻译中栏显示六个动态列，预览上传原片；不显示创作剪辑点滑块。
6. `DubbingSubtitleWorkspace` 的创作数据源、六列、按钮事件和门禁保持原语义；翻译使用独立兄弟组件。
7. Whisper 原始 JSON/SRT 一致且不可被人工修订覆盖。
8. 角色识别请求只读取记录过的本项目 Wiki 路径；不存在 Wiki 时仍能返回待审核候选。
9. 模型不能直接创建正式角色；只有人工确认后写翻译角色页和角色台词确认文件。
10. 第一集确认的翻译角色可被第二集复用；第二集只为未匹配人物创建候选。
11. 链接创作角色只写 `linkedCreativeRoleId`，不修改 `referenceAssets`、创作角色页或创作声音绑定。
12. 新翻译角色可在右栏选择全局 `voiceProfileId` 并试听；绑定只写翻译角色切片和翻译声音页。
13. 翻译保持 cue ID、数量、顺序和时间；缺行、重复、空译文或新增台词被拒绝。
14. 豆包安排只读取已确认角色台词；任一有声 cue 缺角色、译文或声音绑定时阻塞。
15. 每个 Seed 任务最多三个参考音；四人以上按连续时间窗拆纯人声任务，不遗漏、不重复角色。
16. 翻译 Seed 提示词固定目标语言和纯人声，禁止音乐、环境声、动作音效和额外台词。
17. “生成目标语言配音”只读取已保存豆包语音稿，用户修改不会被按钮内部 Skill 覆盖。
18. Seed 输出经 `ffprobe` 和 Whisper 校验；超出 cue 窗口时进入复核，不截断或静默加速。
19. 分离输入只读上传原片；混音只使用 `instrument.wav + 目标人声.wav`。
20. 未完成分离、去除原人声采用和背景混回时烧录保持阻塞；成片保留原片完整画面和比例。
21. 翻译烧录不读取创作 `allVideosReady`、画面母版或 `editing-timeline.json`。
22. 翻译 Wiki 索引能在有创作资料和无创作资料两种项目中工作，不改写 `wiki/index.md`、创作页面或回链。
23. 原片、角色、译文、声音、语音稿和音频变化遵守翻译沙箱内的最小失效规则。
24. 两集路径互不覆盖，失败恢复不重复已成功翻译或 Seed 付费请求。
25. 现有配音字幕工作台与后端回归测试保持通过。
26. `pnpm test`、`pnpm exec vue-tsc --noEmit`、`git diff --check` 通过。

## 15. 人工验收

### 15.1 有现有 Wiki 的项目

1. 打开包含确认剧本、三名角色和声音资料的现有项目。
2. 进入视频翻译，上传第 1 集原片并生成源字幕。
3. 确认模型能把实际读取的剧本和角色作为候选证据，不修改创作 Wiki。
4. 人工确认三名角色、源字幕和译文，生成翻译角色引用。
5. 生成豆包安排、纯目标人声、背景混音和翻译成片。
6. 切回内容创作，确认原状态、按钮、Wiki 和产物完全不变。

### 15.2 跨集角色积累

1. 第 1 集确认三名翻译角色。
2. 第 2 集原片出现原三人和一名新人。
3. 确认原三人自动作为高优先级候选，只需人工确认一个新角色。
4. 第 3 集只出现已有角色时，不再创建角色 Wiki。

### 15.3 无现有 Wiki 的独立翻译项目

1. 新建空项目并直接进入视频翻译。
2. 上传原片，完成 Whisper、角色候选、翻译和人工审核。
3. 人工确认后创建翻译角色 Wiki 和声音引用。
4. 完成豆包纯人声、分离、混音和烧录。
5. 重新打开项目，确认可以从上次成功步骤继续。

## 16. 执行顺序

1. 建立 `WorkspaceEntry` 和翻译状态沙箱，先锁死创作零回归测试。
2. 增加右栏上传按钮、原片归档和独立 `VideoTranslationWorkspace` 六列工作台。
3. 接入 Whisper 和翻译 Wiki 独立产物。
4. 接入 Wiki 上下文选择、说话角色识别和人工确认。
5. 实现翻译角色跨集复用和只读创作角色引用。
6. 实现豆包语音视频翻译专用安排、语音稿、纯人声生成和对齐。
7. 复用 Spleeter/FFmpeg 完成分离、混音和原片烧录。
8. 完成翻译 Wiki 导航、两类项目人工验收和创作全量回归。

本 TDD 暂不处理自动声纹识别、源声线克隆、口型同步、双语字幕、场景/道具知识库或翻译角色自动合并；这些能力只有在真实翻译项目证明必要时再单独立项。
