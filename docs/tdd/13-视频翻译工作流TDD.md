# TDD-13：视频翻译工作流

> 日期：2026-08-05
> 状态：已实现（本地自动化与 Electron UI 验收通过；真实付费模型/Seed API 联调未执行）
> 定位：在现有 Electron 工作台增加一个与内容创作完全隔离的视频翻译入口
> 前置依赖：`docs/tdd/00-共享生产合同与状态机TDD.md`、`docs/tdd/02-声音引擎与角色音色绑定TDD.md`、`docs/tdd/03-素材SRTTDD.md`、`docs/tdd/05-配音字幕工作台骨架TDD.md`、`docs/tdd/06-配音与字幕TDD.md`、`docs/tdd/07-音频处理与成片TDD.md`、`docs/tdd/08-项目与剧集数据边界TDD.md`、`docs/tdd/09-项目与剧集UITDD.md`、`docs/tdd/10-Seed Audio声音设计整段配音与完整声音轨TDD.md`、`docs/tdd/12-项目存储位置与资产用途版本TDD.md`

## 0. 实现记录

- 已增加独立的视频翻译入口和三栏 UI；扒片是单一入口，后续按翻译确认、配音、字幕三个工作台推进。
- 已实现翻译状态、失效链、持久化、跨集角色库和 `wiki/翻译/` 沙箱；现有创作 Wiki 仅作只读上下文。
- 已复用大模型客户端、FFmpeg、全局声音库、Seed Audio 和 Spleeter，但翻译业务状态与内容创作完全分离。
- 已按“翻译字幕确认 -> 配音工作台 -> 字幕工作台”拆分职责；翻译配音直接复用现有 `角色配音 / 全局配音` 工作台，字幕阶段不再显示角色列。
- 翻译参考音只写 `wiki/翻译/声音/`，不会写入或覆盖创作角色声音绑定。
- 扒片采用四步 Markdown 证据链：`01-整体分析与切片方案.md`、`02-FFmpeg切片.md`、`03-Gemini逐片台词.md`、`04-最终稿.md`。
- 翻译工作流不调用 Whisper；创作素材转录能力保持原样。
- 已通过 `pnpm test`（184/184）、`vue-tsc --noEmit`、`git diff --check`、APP 签名和 DMG 校验。
- 未调用真实付费翻译模型或 Seed API；此项留给有效密钥与可控成本环境下的联调验收。

## 1. 目标

在「点一点」增加一个视频翻译工作流，把用户已有视频送入现有的大模型、FFmpeg、角色声音库、Seed Audio 和 Spleeter 能力，输出目标语言配音与字幕成片。

本 TDD 的核心不是复制现有创作流程，而是同时做到：

1. **工作流隔离**：内容创作和视频翻译的状态、按钮、产物、失效链互不影响。
2. **核心组件共用**：两边共用项目/剧集、三栏壳、Wiki 读写、模型请求、声音库和媒体执行器。
3. **复用 Wiki 逻辑**：翻译工作流拥有自己的 Wiki 沙箱；有项目资料时只读借鉴现有剧本、角色和声音，无资料时通过人工审核建立翻译角色 Wiki。
4. **角色跨集积累**：第一集确认的角色成为本项目翻译角色库；第二集只补新增角色，后续持续复用。

主链：

```text
上传原片
-> 上传只校验并归档原片；点击扒片后，原片不超过 20 MiB 时原样用于模型，超过才生成 FFmpeg 分析副本
-> Gemini 完整观看模型分析视频，生成剧情文档、真实总时长说明和连续 FFmpeg 切点
-> 程序校验切点从 0 开始、首尾相接、完整覆盖原片，FFmpeg 从同一模型分析视频生成实际切片
-> Gemini 逐片读取声音、画面字幕和口型，输出片内相对毫秒台词
-> 程序换算为原片绝对毫秒，按原产品字幕标点规则拆成中日韩约 15 字、其他语言约 40 字的独立 cue，每条都有连续时间戳
-> 直接生成最终稿，不再调用冲突复核或合并模型
-> 大模型翻译并追加译文草稿记录
-> 人工审核角色、原字幕和译文并追加确认记录
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

| 能力       | 共用内容                                           | 翻译专用内容                           | 禁止触碰的创作内容                          |
| ---------- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| 三栏工作台 | 三栏壳、收起、滚动、预览、试听样式                 | 翻译入口、六列数据适配器、右栏动作门禁 | 七阶段、创作 `segments`、剪辑点             |
| Wiki       | 项目根解析、Markdown/JSON 读写、原子替换、路径校验 | `wiki/翻译/`、翻译角色和剧集索引       | 创作 Wiki 页面和回链                        |
| 大模型     | 当前模型配置、请求、停止和 JSON 校验               | 多语言翻译 Schema、说话角色 Schema     | 现有中译英接口、Gemini 剪辑 Schema          |
| 声音       | 全局声音库、Seed 客户端、安全 Key、下载与校验      | 翻译角色声音引用、纯目标语言人声编排   | 创作角色声音绑定、完整声音轨编排            |
| 媒体       | `ffprobe`、Spleeter、FFmpeg 进程和字幕格式化       | 原片分离、目标人声混音、原片烧录参数   | 画面母版、`editing-timeline.json`、创作成片 |

实现不得复制模型客户端、媒体引擎、声音库、项目注册表、Store 或 Wiki 引擎；只增加翻译状态、翻译 Schema 和薄编排入口。

审计结论：现有翻译接口固定中译英，现有成片入口依赖创作 `allVideosReady` 和画面母版，因此只能复用底层请求、FFmpeg、声音与媒体执行器，必须增加翻译专用 Schema 与编排，不能直接调用原业务动作。

## 3. Wiki 复用原则

### 3.1 复用 Wiki 逻辑，不复用创作产物路径

仓库里的 `docs/wiki/` 是本应用的研发 Wiki，只用于审计设计和代码事实，绝不能作为某个用户视频翻译任务的上下文。运行时只读取当前 `projectId` 所属项目根内的 `wiki/`；不同项目之间不共享角色、剧本或翻译资料。

翻译工作流继续遵守现有 Wiki 原则：

- 结构化状态、稳定 ID、文件哈希和媒体路径是执行事实源；
- Markdown 是可读投影、人工审核页、过程溯源和导航，不替代运行状态；
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
- 剧本只作为角色、称呼和台词校对证据，不覆盖 Gemini 对原片和切片的直接观察；
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

### 3.4 最小过程溯源

每集维护一份追加式过程记录和四份阶段 Markdown，不生成模型中间 JSON：

```text
wiki/翻译/<episodeId>/过程记录.md
wiki/翻译/<episodeId>/01-整体分析与切片方案.md
wiki/翻译/<episodeId>/02-FFmpeg切片.md
wiki/翻译/<episodeId>/03-Gemini逐片台词.md
wiki/翻译/<episodeId>/04-最终稿.md
```

最终角色台词确认 Markdown 和媒体产物按各自格式独立保存。四份阶段文档保存模型与 FFmpeg 证据，`过程记录.md` 负责链接阶段文档；它们都不替代运行状态。模型生成环节一律返回 Markdown；FFmpeg、配音安排和断点续跑使用的 JSON 属于程序内部结构化状态，不由模型生成。

每个成功步骤向文件末尾追加一个不可覆盖的事件区块，至少包含：

```markdown
## 2026-08-06T14:30:00+08:00 · 第一步整体分析与切片方案

- 事件 ID：<稳定且唯一的 eventId>
- 模型：<实际 modelId>
- 原片：[[原片相对路径]]（sha256: ...）
- 输入：[[原片]]、[[来源上下文.md]]
- 上一步：无或 [[#前一事件标题]]
- 状态：成功

### 结果

剧情、人物、关系、称谓、专名和风险的 Markdown 正文。
```

同一文件依次追加以下事件：

1. 整体分析与切片方案：写入 `01-整体分析与切片方案.md`。
2. FFmpeg 切片：写入实际文件路径和连续边界到 `02-FFmpeg切片.md`。
3. Gemini 逐片台词：写入每片模型原始 Markdown 到 `03-Gemini逐片台词.md`。
4. 直接确定最终稿：程序换算绝对时间并写入 `04-最终稿.md`，不调用第三次模型。
5. 目标语言翻译：保存完整译文草稿快照，记录目标区域标签，当前默认 `en-US`。
6. 人工确认：记录确认人、确认时间和最终修改后的源字幕/角色/译文快照，并链接 `角色台词确认.md`。

追加前按 `eventId` 去重，重试同一个已成功步骤不得重复写入。Wiki 链接产生可导航关系，Wiki 引擎据此生成反向链接；翻译页可以链接创作资料，但不得为了“双链”回写创作 Wiki。旧事件永不改写，修订通过追加新事件并链接被修订事件表达。

## 4. 三栏 UI 合同

### 4.1 工作台入口

现有内容创作入口、七阶段和三栏布局保持原样。在应用现有入口区增加：

```text
[内容创作] [视频翻译]
```

进入视频翻译后：

- 顶部项目和剧集选择器保持可用；
- 左栏只显示当前剧集、目标语言和已确认翻译角色导航；
- 第一阶段中栏确认原字幕、翻译字幕和角色，右栏只保留上传、扒片、翻译和“进入配音工作台”；
- 第二阶段直接复用现有 `角色配音 / 全局配音` 工作台，完成参考音绑定和整集目标语言配音；
- 第三阶段进入无角色列的字幕工作台，右栏只保留分离、去人声、混音和烧录；
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

### 4.3 翻译字幕确认与字幕工作台

现有 `DubbingSubtitleWorkspace` 直接绑定创作 `segments`、`allEditingReady`、剪辑点和固定中英文列，不能直接承载翻译数据。新增兄弟组件 `VideoTranslationWorkspace`，复用现有三栏壳、`managedMediaUrl`、视频/音频原生控件、表格布局和视觉尺寸；它只消费 `VideoTranslationState`。不得在现有组件中加入会改变创作门禁或列语义的翻译分支。

翻译字幕确认阶段固定六列：

```text
时间轴 | 视频片段预览 | 说话角色 | 原字幕 | 译文字幕 | 目标语言配音
```

- 主预览始终播放上传原片，选择 cue 后跳到该时间窗并在终点暂停。
- 时间轴来自 Gemini 逐片结果换算后的原片绝对毫秒，不显示创作剪辑点滑块。
- “说话角色”是可选择的已确认角色或“新角色”候选。
- 原字幕、译文字幕都可编辑并自动保存；`sourceText` 来自 `04-最终稿.md`。
- 目标语言配音列按 cue 时间窗试听整集目标人声轨，存在逐 cue WAV 时优先试听该文件。
- 列名不固定为中文/英文，跟随已确认的源语言和目标语言显示。

点击“进入配音工作台”时自动保存角色和双语字幕确认产物，不再单独显示“确认角色与字幕”按钮。角色参考音上传、生成、试听、选择和绑定全部在配音工作台完成。

整集目标语言配音完成后点击“进入字幕工作台”。字幕工作台复用同一时间轴与双语字幕，但固定隐藏“说话角色”列，只负责字幕确认和后续音频、成片处理。

### 4.4 右栏按钮

翻译字幕确认阶段按依赖显示：

```text
上传/更换视频
扒片
翻译所有字幕
进入配音工作台
```

配音工作台直接复用现有按钮和分栏：

```text
角色配音：生成角色提示词 / 生成角色参考音 / 上传参考音 / 绑定候选参考音
全局配音：生成全局配音提示词 / 生成或重新生成全局配音 / 进入字幕工作台
```

字幕工作台右栏按依赖显示：

```text
分离原人声和背景声
去除原人声
混回背景声和目标语言配音
烧录字幕和配音
```

不增加保存字幕、确认时间轴、音频模式、成片语言、最终混音试听或第二个成片按钮。

## 5. 上传与源字幕

### 5.1 原片归档

新增最小的视频选择 IPC，复用现有 `showOpenDialog`、项目路径校验、文件复制和相对路径能力。只接受 FFmpeg 可读取的视频格式：

```text
.raw/视频翻译/<episodeId>/source.<ext>
episodes/<episodeId>/video-translate/source.<ext>
```

`.raw` 保存原始证据快照；受控 episode 文件供 Gemini、预览和 FFmpeg 使用。用户原文件不移动、不改名、不删除、不覆盖。

上传后用 `ffprobe` 校验文件、视频流、真实时长和音频流。无音频视频允许预览，但阻塞扒片和配音替换。

模型输入大小采用自适应规则：上传阶段不压缩；点击扒片后，不超过 20 MiB 的原片直接作为模型分析视频，不为小文件补码率或放大。超过 20 MiB 时用 FFmpeg 生成同一剧集下不超过 12 MiB 的 `analysis.mp4`；绝不覆盖原片。APP 不自行限制模型请求体大小。完整分析和后续 FFmpeg 切片必须读取同一个模型分析视频；最终预览、配音、混音和烧录始终使用原片。

### 5.2 Gemini 切点与 FFmpeg 切片

Gemini 第一遍完整观看模型分析视频，生成剧情文档和连续切片方案。程序只接受从 `0` 开始、上一片结尾等于下一片开头、最终结尾等于 `ffprobe` 真实时长、单片不超过 45 秒的方案；格式错误自动重试一次。

FFmpeg 必须从模型分析视频按通过校验的切点实际生成 MP4 切片，不能回头切上传原片，也不能只在提示词中描述切片。为了准确切点，使用转码后的输出而不是流复制；每片路径和绝对边界写入 `02-FFmpeg切片.md`。

## 6. 说话角色识别与人工审核

### 6.1 模型输入

“扒片”执行全片理解、FFmpeg 切片、Gemini 逐片读取和程序合并，复用现有视频请求与媒体执行器，但使用独立的视频翻译 Schema，不调用创作 `analyzeMaterialVideo`，不生成 `editing-timeline.json`。当前模型为 `gemini-3.6-flash`。

输入：

```text
原生视频
+ 翻译角色库摘要
+ 可选创作角色/声音资料
+ 可选确认剧本和项目总监资料
```

Gemini 全片调用只负责剧情和切点，不输出最终字幕。逐片调用读取每个 FFmpeg 文件，输出片内从 `0` 开始的相对毫秒台词；声音、口型和画面字幕共同作为证据。每片解析失败自动重试一次。

程序把相对毫秒加上切片起点得到原片绝对时间，按时间排序后直接写最终稿。最终步骤不再次调用 Gemini，只校验条目唯一、正文非空、时间合法且不重叠。

输出草稿至少包含：

```ts
interface TranslationSpeakerDraft {
  cueId: string
  startMs: number
  endMs: number
  recognizedText: ''
  correctedText: string
  proposedRoleId?: string
  proposedName: string
  confidence: number
  evidence: string
  ocrText: string
  needsReview: boolean
}
```

程序必须拒绝重复条目、非法或重叠时间、越界时间和空 `correctedText`。第四步在每个模型 cue 内先把逗号、句号、问号、感叹号、分号视为强制分句点，每个标点结束后必须开始新 cue；再对仍然过长的分句复用原产品 `simple_wrap` 的长度与过短尾行规则，中日韩默认约 15 字，其他语言默认约 40 字。拆出的每个分句都是独立 cue，程序按字符权重在原始起止毫秒内连续分配时间，首尾不变、不留缝、不重叠。最终 cue 由程序按时间重新生成稳定 ID；模型不能直接创建正式角色。逐片正文写入 `sourceText`，`recognizedText` 保留为空以兼容现有状态结构。

### 6.2 人工确认

用户在中栏逐行：

- 校对原字幕；
- 将说话人绑定到已确认翻译角色；
- 将说话人链接到已有创作角色；
- 或确认创建一个新的翻译角色；
- 校对大模型译文。

工作台中的修改保存在翻译运行态；点击“进入配音工作台”时，把确认后的完整快照追加到 `过程记录.md`，并生成下面的正式产物。人工确认不改写四步扒片记录。

点击“进入配音工作台”后才写入正式产物：

```text
wiki/翻译/<episodeId>/角色台词确认.md
wiki/翻译/角色/<translationRoleId>.md
```

正式确认文件是目标语言配音的唯一角色与台词输入。任一有声 cue 缺少已确认角色、源文字或译文时，不开放豆包配音安排。

## 7. 大模型翻译

翻译复用现有文本模型配置和停止/失败处理。新增视频翻译专用 Markdown 请求合同，底层仍调用现有文本生成能力；现有 `cloud-translate-subtitles` 参数和中译英行为不变。

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

返回必须保持 cue ID、数量、顺序和时间，不得合并、拆分或新增台词。译文写入审核草稿；只有“进入配音工作台”自动确认后才成为正式输入。

翻译成功并通过合同校验后，将完整译文草稿、实际模型 ID、目标区域标签、源字幕确认哈希和输入 Wiki 引用追加到 `过程记录.md`。人工修改译文时不覆盖该模型草稿；确认时另追加人工确认事件。

目标语言使用明确的语言代码或 BCP-47 标签。第一轮至少验收中文和英文；未由翻译模型与 Seed Audio 共同支持的语言不开放。

## 8. 豆包语音视频翻译专用编排

### 8.1 独立于创作 Seed 编排

视频翻译默认使用 `seed-audio`，复用 TDD-10 已有的：

- Seed API Key 安全存储；
- 官方请求客户端；
- 临时 URL 下载和 Base64 备用；
- `ffprobe` 校验和 48kHz 双声道 WAV 转换；
- 最多三个参考音；
- 多任务混轨。

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
2. 使用 Seed 返回的真实音频时长和已确认台词时间窗写任务时间轴；
3. 用已确认译文确定正式字幕文字；
4. 按原片绝对时间放置并混成唯一目标人声轨。

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
  traceLogPath?: string
  confirmedDialoguePath?: string
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

| 变化              | 只失效翻译工作流中的                                       | 保留                                          |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------- |
| 原片变化          | 源字幕、角色草稿、译文、确认、安排、配音、分离、混音、成片 | 翻译角色库、创作全部资料                      |
| Wiki 参考资料变化 | 未确认的角色识别草稿                                       | 已确认角色台词、翻译下游、创作资料            |
| 原字幕或角色修改  | 译文、确认、安排、配音、混音、成片                         | 四步扒片文档、FFmpeg 切片、分离 stems、角色库 |
| 译文修改          | 确认、安排、配音、混音、成片                               | 原片、角色映射、分离 stems                    |
| 翻译角色声音变化  | 安排、配音、混音、成片                                     | 原片、字幕、创作声音绑定                      |
| 豆包语音稿变化    | 配音、混音、成片                                           | 安排、字幕、分离 stems                        |
| 目标人声重新生成  | 混音、成片                                                 | 字幕、角色库、分离 stems                      |
| 重新分离原声      | 混音、成片                                                 | 目标人声、字幕、角色库                        |

- 失败后再次点击“扒片”时，先校验并复用同一模型分析视频对应的 `01-整体分析与切片方案.md`；逐片阶段逐一读取并校验 `03-片段xxx台词.md`，只请求缺失或无效片段，不重复已成功的付费模型调用。
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
wiki/翻译/<episodeId>/来源上下文.md
wiki/翻译/<episodeId>/过程记录.md
wiki/翻译/<episodeId>/01-整体分析与切片方案.md
wiki/翻译/<episodeId>/02-FFmpeg切片.md
wiki/翻译/<episodeId>/03-Gemini逐片台词.md
wiki/翻译/<episodeId>/04-最终稿.md
wiki/翻译/<episodeId>/角色台词确认.md
wiki/翻译/<episodeId>/<targetLanguage>/豆包配音安排.json
wiki/翻译/<episodeId>/<targetLanguage>/豆包语音稿.md
wiki/翻译/<episodeId>/<targetLanguage>/音频处理.json
wiki/翻译/<episodeId>/<targetLanguage>/成片.md
```

- 翻译入口由应用直接打开 `wiki/翻译/index.md`；翻译保存不得改写现有项目 `wiki/index.md` 或触发创作 `renderWiki`。
- `wiki/翻译/index.md` 汇总项目翻译角色和各集翻译状态。
- 剧集翻译索引连接原片、实际读取的 Wiki 来源、过程记录、角色确认、字幕、豆包安排、目标人声、音频处理和成片。
- 四份阶段 Markdown 保存完整模型证据；`过程记录.md` 是追加式审计索引并链接这些文档。
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
7. 翻译扒片链路不调用 Whisper，也不生成 `source-whisper.json` 或 `source.srt`。
8. 角色识别请求只读取记录过的本项目 Wiki 路径；不存在 Wiki 时仍能返回待审核候选。
9. 模型不能直接创建正式角色；只有人工确认后写翻译角色页和角色台词确认文件。
10. 整体分析与切片方案、FFmpeg 实际切片、Gemini 逐片台词和程序最终稿各生成 Markdown，并按顺序链接到 `过程记录.md`。
11. 回归样例中，逐片结果必须包含画面字幕“我送你去”，最终稿不得再次调用模型或遗漏该句。
12. 第一集确认的翻译角色可被第二集复用；第二集只为未匹配人物创建候选。
13. 链接创作角色只写 `linkedCreativeRoleId`，不修改 `referenceAssets`、创作角色页或创作声音绑定。
14. 翻译字幕确认右栏不显示临时角色声音选择区；参考音上传、生成、试听和绑定全部由复用的配音工作台处理，并只写 `wiki/翻译/声音/`。
15. 最终时间轴直接拼接逐片结果；重复、空正文、非法或重叠时间被拒绝。
16. 豆包安排只读取已确认角色台词；任一有声 cue 缺角色、译文或声音绑定时阻塞。
17. 每个 Seed 任务最多三个参考音；四人以上按连续时间窗拆纯人声任务，不遗漏、不重复角色。
18. 翻译 Seed 提示词固定目标语言和纯人声，禁止音乐、环境声、动作音效和额外台词。
19. “生成目标语言配音”只读取已保存豆包语音稿，用户修改不会被按钮内部 Skill 覆盖。
20. Seed 输出经真实音频时长校验，不再调用 Whisper。
21. 分离输入只读上传原片；混音只使用 `instrument.wav + 目标人声.wav`。
22. 未完成分离、去除原人声采用和背景混回时烧录保持阻塞；成片保留原片完整画面和比例。
23. 翻译烧录不读取创作 `allVideosReady`、画面母版或 `editing-timeline.json`。
24. 翻译 Wiki 索引能在有创作资料和无创作资料两种项目中工作，不改写 `wiki/index.md`、创作页面或回链。
25. 原片、角色、译文、声音、语音稿和音频变化遵守翻译沙箱内的最小失效规则。
26. 两集路径互不覆盖，失败恢复不重复已成功翻译或 Seed 付费请求。
27. 整集配音完成后才能进入字幕工作台；字幕工作台不显示角色列，只显示时间轴、预览、双语字幕和目标语言配音。
28. 现有配音字幕工作台与后端回归测试保持通过。
29. `pnpm test`、`pnpm exec vue-tsc --noEmit`、`git diff --check` 通过。

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
2. 上传原片，完成 Gemini 切点规划、FFmpeg 切片、逐片台词、翻译和人工审核。
3. 人工确认后创建翻译角色 Wiki 和声音引用。
4. 完成豆包纯人声、分离、混音和烧录。
5. 重新打开项目，确认可以从上次成功步骤继续。

## 16. 执行顺序

1. 建立 `WorkspaceEntry` 和翻译状态沙箱，先锁死创作零回归测试。
2. 增加右栏上传按钮、原片归档和独立 `VideoTranslationWorkspace` 六列工作台。
3. 接入 Gemini 切点规划、FFmpeg 切片和翻译 Wiki 独立产物。
4. 接入 Gemini 逐片台词、Wiki 上下文、说话角色识别和人工确认。
5. 实现翻译角色跨集复用和只读创作角色引用。
6. 实现豆包语音视频翻译专用安排、语音稿、纯人声生成和对齐。
7. 复用 Spleeter/FFmpeg 完成分离、混音和原片烧录。
8. 完成翻译 Wiki 导航、两类项目人工验收和创作全量回归。

本 TDD 暂不处理自动声纹识别、源声线克隆、口型同步、双语字幕、场景/道具知识库或翻译角色自动合并；这些能力只有在真实翻译项目证明必要时再单独立项。
