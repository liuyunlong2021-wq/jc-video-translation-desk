# TDD-03：素材 SRT

> 日期：2026-08-04
> 状态：已完成并验证
> 上位设计：`docs/导演分镜时间轴与角色配音编排SDD.md`
> 前置依赖：`docs/tdd/00-共享生产合同与状态机TDD.md`、`docs/tdd/01-项目总监与制作路线TDD.md`、`docs/tdd/02-声音引擎与角色音色绑定TDD.md`

## 1. 目标

视频素材生成完成后，由用户点击“生成 SRT”，使用本机 Faster-Whisper 逐条识别人声内容及精确时间戳，并把每条素材的稳定 JSON 与 SRT 写入项目 Wiki，作为下一步 Gemini 剪辑分析的必需证据。

## 2. 本轮范围

1. 视频生成完成不再自动调用 Gemini；“视频已生成”和“剪辑时间轴已生成”是两个独立状态。
2. 复用 `/Users/by3/Documents/peiyin-pyvideotrans/.venv/bin/python`、`faster-whisper 1.2.1` 和现有 large-v3-turbo 模型。
3. 每条不同的原始视频只转录一次；Grok 多镜共用一个视频时复用同一份转录结果。
4. 每条素材输出 `MaterialTranscript` JSON 和标准 SRT；无人声允许空 `cues` 和空 SRT。
5. 单条失败保留其他成功素材的产物，并在对应分镜显示失败状态，允许重新点击按钮补跑。
6. 视频阶段提供明确可点击的“生成 SRT”按钮；全部素材 SRT 成功后才开放下一步。

## 3. 明确不做

- 不运行 Sherpa 说话人聚类。
- 不用确认剧本改写 Whisper 识别文字，不把台词硬填进识别时间窗。
- 不调用 Gemini，不生成 `editing-timeline.json`。
- 不创建逐句配音、不实现剪辑点滑块和配音字幕工作台。
- 不复制 Python 虚拟环境或模型，不新增 npm/Python 依赖。

## 4. 产物合同

每条唯一素材使用稳定 `mediaId`（分镜生成视频为 `media-shot-<序号>`；共享同一视频路径时使用首个分镜的 ID）：

```text
wiki/转录/episode-001/<mediaId>-whisper.json
wiki/字幕/素材/<mediaId>-whisper.srt
```

JSON 必须满足 `MaterialTranscript schemaVersion: 1`：

```ts
interface MaterialTranscript {
  schemaVersion: 1
  mediaId: string
  sourceMediaPath: string
  durationMs: number
  cues: Array<{
    cueId: string
    mediaId: string
    startMs: number
    endMs: number
    recognizedText: string
  }>
}
```

规则：

- `durationMs > 0`；cue 按时间递增、互不重叠且不越过素材时长。
- Whisper 空白片段不写 cue；无有效 cue 时 SRT 是空文件。
- SRT 时间使用 `HH:MM:SS,mmm`，文字与 JSON 的 `recognizedText` 一致。
- 写文件采用临时文件后原子替换；失败不得留下半份 JSON/SRT。

## 5. UI 与状态

每个分镜增加素材转录状态：

```ts
transcriptStatus: 'pending' | 'running' | 'ready' | 'failed'
transcriptMediaId?: string
transcriptJsonPath?: string
transcriptSrtPath?: string
transcriptError?: string
```

- 所有视频成功后，视频阶段主按钮变为“生成 SRT”。
- 点击后只处理非 `ready` 的唯一视频；共用视频的所有分镜同步同一结果。
- 转录进行中显示真实忙碌状态；失败显示真实错误，重试不重复已成功素材。
- 修改或重新生成视频会清空该素材及所有下游转录、剪辑状态。

## 6. 测试先行清单

1. `MaterialTranscript` 能生成合法 SRT，含小时、分钟和毫秒格式。
2. 空 cues 生成空 SRT；重叠、越界或空文字 cue 被合同拒绝。
3. 转录运行器校验项目 ID、素材 ID、项目内视频路径、Python 和模型路径。
4. 运行器把 Whisper 秒时间转为毫秒，过滤空白片段并原子写入两份 Wiki 产物。
5. 同一路径视频去重，只调用一次转录；单条失败不删除已成功产物。
6. 视频生成不再自动调用 Gemini，`allVideosReady` 只表示视频素材完成。
7. UI 存在真实“生成 SRT”按钮，全部转录完成前不允许生成剪辑时间轴。

## 7. 验收标准

- 定向测试先红后绿。
- `pnpm exec vue-tsc --noEmit` 与 `git diff --check` 通过。
- 桌面 APP 中生成视频后出现“生成 SRT”，点击后能生成真实项目 Wiki 文件。
- TDD-03 全绿后，才允许创建并执行 TDD-04。

## 8. 执行结果

- 视频生成和 Gemini 剪辑分析已解耦；`allVideosReady` 只表示所有原始视频素材已生成。
- 视频阶段已有真实“生成 SRT”按钮，逐条调用本机 Faster-Whisper；同一 Grok 视频只转录一次并把结果同步给所含分镜。
- 每条素材会原子写入 `wiki/转录/episode-001/<mediaId>-whisper.json` 与 `wiki/字幕/素材/<mediaId>-whisper.srt`；单条失败不会覆盖其他成功素材。
- 已真实加载 `faster-whisper 1.2.1`、`ctranslate2 4.8.1` 和 1.5GB large-v3-turbo 模型；1 秒静音视频正确返回空 cues。
- 定向测试 `45/45`、`pnpm exec vue-tsc --noEmit` 与 `git diff --check` 通过。
