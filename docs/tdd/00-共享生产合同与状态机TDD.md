# TDD-00：共享生产合同与状态机

> 日期：2026-08-03
> 状态：已完成并验证
> 上位设计：`docs/导演分镜时间轴与角色配音编排SDD.md`
> 目标：为后续并发功能提供唯一、可测试、无 UI 依赖的共享合同。

## 1. 范围

本功能只实现四项基础能力：

1. 定义项目制作路线、素材 SRT、剪辑时间轴、逐句配音资产和音频处理记录的共享 TypeScript 类型。
2. 将剪辑时间轴升级为同时保存 Gemini 原始剪辑点和当前采用剪辑点的 `schemaVersion: 2`。
3. 定义配音字幕工作台十项操作的可用性计算，不在各 UI 按钮中重复判断依赖。
4. 定义视频、剪辑点、中文字幕和输出语言变化后的最小失效规则。

## 2. 明确不做

- 不修改项目总监 Skill、路线判断 UI 或 Store 门禁；留给 TDD-01。
- 不接 Faster-Whisper、IndexTTS2、Gemini、Spleeter 或任何本地服务。
- 不增加 IPC、Preload、设置页、配音字幕工作台组件或新依赖。
- 不实现项目 Wiki 写盘；本 TDD 只固定未来写盘使用的数据合同和路径常量。
- 不维护旧版产品兼容分支；但当前运行代码必须能在本次迁移后继续通过测试和类型检查。

## 3. 现有基础与问题

可复用：

- `src/runtime/projectDirector.ts` 已有项目总监草稿解析和稳定资产 ID。
- `src/runtime/editingTimeline.ts` 已有不确定镜头保留完整素材、连续输出轴和对白任务计算。
- `electron/ffmpeg/index.ts` 已按剪辑时间轴执行确定性裁切。
- `src/runtime/*.test.ts` 已使用 Node 内置测试器，无需增加测试框架。

当前问题：

- `AudioMode` 和剪辑时间轴类型存在重复定义。
- `editing-timeline.json` 只有 `trimStartMs/trimEndMs`，无法同时保留 Gemini 原点和用户滑块采用点。
- 十项工作台操作尚无统一依赖计算，各功能并发实现时容易各写一套门禁。
- 失效规则仍散落在 Store，后续并发功能无法共享。

## 4. 唯一事实源

新增：

```text
src/runtime/productionContract.ts
```

该文件只包含类型、常量和纯函数，可以同时被渲染进程、Electron 主进程和测试导入。不得依赖 Vue、Electron、Node 文件系统或模型 SDK。

## 5. 数据合同

### 5.1 基础枚举

```ts
type ProductionRoute = 'narration-promo' | 'drama'
type AudioProductionRoute = 'seed-full-track' | 'post-dub'
type AudioEngine = 'seed-audio' | 'indextts2' | 'qwen3-tts'
type VideoAudioPolicy = 'use-native' | 'use-seed-master' | 'replace-dialogue-preserve-ambience'
type ArtifactStatus = 'idle' | 'running' | 'ready' | 'failed' | 'stale'
type OutputLanguage = 'zh' | 'en'
type AdoptedBy = 'gemini' | 'user'
type AudioMode = 'keep-original' | 'replace-preserve-ambience' | 'replace-all'
```

### 5.2 素材转录

```ts
interface MaterialTranscriptCue {
  cueId: string
  mediaId: string
  startMs: number
  endMs: number
  recognizedText: string
}

interface MaterialTranscript {
  schemaVersion: 1
  mediaId: string
  sourceMediaPath: string
  durationMs: number
  cues: MaterialTranscriptCue[]
}
```

素材 SRT 不包含 `spk0`、`speakerLabel` 或角色映射。

### 5.3 剪辑时间轴

每镜必须同时保存：

- `geminiStartMs/geminiEndMs`：模型原始建议，只在重新分析素材时变化。
- `adoptedStartMs/adoptedEndMs`：FFmpeg 当前采用值，可由滑块修改。
- `adoptedBy` 与 `revision`：区分模型原点和人工修订。
- 连续的 `outputStartMs/outputEndMs`。

`editing-timeline.json` 使用 `schemaVersion: 2`。FFmpeg 只读取 `adoptedStartMs/adoptedEndMs`，不得读取 Gemini 原点或自行计算区间。

### 5.4 配音与音频处理

共享合同只固定 `DialogueAsset` 和 `AudioProcessingRecord` 的字段，不创建任务、不生成 WAV：

```text
wiki/声音/episode-001/对白资产.json
wiki/声音/episode-001/音频处理.json
```

## 6. 工作台状态机

共享状态只覆盖视频完成后的配音字幕阶段：

```ts
interface PostProductionState {
  route: ProductionRoute
  audioRoute: AudioProductionRoute
  audioEngine: AudioEngine
  videoAudioPolicy: VideoAudioPolicy
  materialSrt: ArtifactStatus
  editingTimeline: ArtifactStatus
  chineseVoice: ArtifactStatus
  englishSubtitles: ArtifactStatus
  englishVoice: ArtifactStatus
  sourceSeparation: ArtifactStatus
  originalVocalRemoved: boolean
  finalMix: ArtifactStatus
  finalVideo: ArtifactStatus
  outputLanguage: OutputLanguage
  audioMode: AudioMode
}
```

`ProductionRoute` 只表示内容类型和导演语义；`AudioProductionRoute` 表示声音先后顺序，必须由用户人工选择。VEO/Grok 始终照常生成视频及其原生声音，`VideoAudioPolicy` 只在后期决定最终成片采用视频原生声音、Seed 完整声音轨，还是逐句后配并保留环境声，不得反向修改视频提示词。

唯一操作集合：

```text
generate-srt
generate-editing-timeline
reselect-edit-point
generate-seed-voice
arrange-seed-track
generate-seed-track
generate-chinese-voice
translate-subtitles
generate-english-voice
separate-source-audio
remove-original-vocal
mix-background-audio
burn-voice-and-subtitles
```

门禁原则：

- Seed 路线的完整声音轨就绪后自动生成声音时间轴和 SRT；视频素材的素材 SRT 就绪后才允许生成 Gemini 剪辑时间轴。
- 后配路线仍按 SRT 就绪后生成剪辑时间轴。
- 剪辑时间轴就绪后才允许滑块、中文配音、翻译和人声分离。
- 英文字幕就绪后才允许英语配音。
- `replace-preserve-ambience` 才要求分离、去人声和混回按顺序完成。
- `replace-all` 不分离原声，但烧录前要求对应语言配音就绪。
- `use-native` 直接采用视频模型生成的原生声音，不强制生成 Seed 或逐句配音。
- `use-seed-master` 采用 Seed 完整声音轨；视频原生声音保留为原始证据或备用，不在提示词阶段禁用。
- `keep-original` 不要求生成配音或做人声分离。
- 英文输出始终要求英文字幕就绪；需要替换配音时还要求英语配音就绪。
- 烧录是唯一最终动作，不存在额外保存或确认状态。

`seed-full-track` 路线在分镜前拥有完整声音轨和声音时间轴；`post-dub` 路线继续在 `editing-timeline.json` 就绪后生成逐句配音。视频模型的原生声音是否最终采用由 `videoAudioPolicy` 决定。

## 7. 失效规则

| 变化 | 失效 | 保留 |
|---|---|---|
| 原始视频变化 | 素材 SRT、剪辑时间轴、音频处理、成片；后配路线还失效逐句配音 | 角色音色绑定、确认剧本、Seed 声音时间轴 |
| 采用剪辑点变化 | 音频处理、成片；后配路线还失效逐句配音 | 素材 SRT、Gemini 原点、Seed 声音轨和声音时间轴 |
| 中文字幕变化 | 中英文配音、英文字幕、音频处理、成片 | 视频、SRT、剪辑点 |
| 输出语言变化 | 成片 | 所有上游产物 |

失效把已有 `ready` 结果改为 `stale`，把基于旧输入的 `running/failed` 改回 `idle`；`idle/stale` 保持不变。

## 8. 文件所有权

本功能允许修改：

```text
docs/tdd/00-共享生产合同与状态机TDD.md
src/runtime/productionContract.ts
src/runtime/productionContract.test.ts
src/runtime/editingTimeline.ts
src/runtime/editingTimeline.test.ts
electron/ffmpeg/types.ts
electron/ffmpeg/index.ts
electron/types.ts
src/runtime/ffmpegCompose.mock.test.ts
```

禁止修改：

```text
src/views/Home/index.vue
src/store/mediaTask.ts
electron/ipc.ts
electron/preload.ts
```

## 9. 测试先行清单

实现前先新增失败测试，覆盖：

1. 素材转录拒绝越界、重叠和空 ID cue，允许合法空 SRT。
2. 时间轴保留 Gemini 原点，人工采用点变化后重新计算连续输出轴。
3. FFmpeg 类型只消费采用点。
4. 十项操作严格按依赖出现，不产生隐藏的保存/确认动作。
5. 中文和英文输出使用不同烧录门禁。
6. 四类变化只失效必要下游。

## 10. 验收标准

- 新共享模块无 Vue、Electron、文件系统或网络依赖。
- `editingTimeline.ts` 复用共享类型，不再自行声明同名时间轴接口。
- FFmpeg 裁切读取 `adoptedStartMs/adoptedEndMs`。
- 定向测试、全部 `src/runtime/*.test.ts`、`vue-tsc --noEmit` 和 `git diff --check` 通过。
- 不新增依赖，不修改 UI、Store、IPC 或模型调用。

## 11. 后续依赖

TDD-01 至 TDD-07 全部导入本文件的合同，不再复制状态枚举、剪辑时间轴或按钮门禁。任何合同变更必须先修改本 TDD 和共享测试，再由各功能消费。

## 12. 执行结果

- 已先运行失败测试，确认共享模块和人工采用剪辑点能力尚不存在。
- 已新增 `productionContract.ts`，并将现有剪辑时间轴和 FFmpeg 裁切迁移到 `schemaVersion: 2`。
- 定向合同、时间轴与 FFmpeg 测试共 `11/11` 通过。
- 全量 `pnpm test` 共 `114/114` 通过。
- `pnpm exec vue-tsc --noEmit` 与 `git diff --check` 通过。
- 未实现本 TDD 明确排除的 UI、Store、IPC、模型服务和端到端工作流。
