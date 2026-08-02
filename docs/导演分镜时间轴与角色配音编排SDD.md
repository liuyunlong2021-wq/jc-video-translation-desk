# 导演分镜、Omni 智能剪辑与 IndexTTS2 配音合成 SDD

> 日期：2026-08-02
> 状态：方案已对齐；单一新流程待执行
> 目标版本：2.8
> 适用范围：角色音色绑定、导演分镜、逐镜多模态分析、智能剪辑、正式配音、混音和字幕
> 上位文档：`docs/资产图工作区与Markdown双链创作图谱升级SDD.md`、`docs/音色库整理与角色声音Wiki索引SDD.md`
> 相关 Skill：`skills/jc-script-storyboard/SKILL.md`、`skills/jc-voice-design/SKILL.md`、`skills/jc-character-prompt/SKILL.md`

## 1. 一句话目标

分镜视频生成后，Qwen2.5-Omni-7B 立即结合对应分镜脚本逐镜读取画面和声音，产出局部剪辑时间轴；应用合并为唯一 `editing-timeline.json` 并由 FFmpeg 确定性裁切。用户可保留原声、使用单讲述者设计声音，或用 IndexTTS2 完成多角色配音；人声分离按原声内容可选执行，最后依同一时间轴混音并烧录字幕。

## 2. 已确认决策

1. 产品尚未发布，只实现一条新流程；不增加版本字段，不迁移已有测试项目。
2. `jc-voice-design` 保持单讲述者能力，不修改为多角色 Skill。它可承担只有一名旁白说话者的设计声音和本集旁白，不承担多角色配音。
3. 存在画面内对白或多名说话者时，正式配音使用角色已绑定的 IndexTTS2 多情绪音色包，不在每一集重新设计音色。
4. 不在分镜前生成本集正式配音，也不用预生成配音决定视频长度。
5. 不再按 `playDuration` 固定截取视频前 N 秒。`playDuration` 仅是导演时长预算，实际裁切区间由分镜脚本和逐镜多模态证据确定。
6. Qwen2.5-Omni-7B 逐镜读取画面与原始声音，直接输出关键动作、原声说话窗口和建议裁切区间；不再另跑 Qwen3-VL、Whisper ASR 或说话人识别。
7. Qwen2.5-Omni-7B 只提供时间轴建议；程序必须用 `ffprobe` 校验真实时长，FFmpeg 才是唯一剪辑执行器。
8. 原声处理有三种互斥策略：保留原声、使用配音并保留环境声、仅使用配音。第二种只在原素材存在需要替换的人声时执行人声分离；纯旁白项目的原视频没有人声时，直接保留原音轨并混入旁白。
9. 字幕文字来自确认分镜原文，时间来自 `editing-timeline.json` 和最终配音时长；不通过 ASR 生成字幕。
10. 保留原声、单讲述者和多角色三类项目都必须经过相同的逐镜 Omni 分析；配音简单不代表可以跳过画面剪辑。
11. 现有三栏和五个中栏标签继续使用。字幕是最终成片的自动产物，不新增顶部阶段、独立页面或额外确认步骤。

## 3. 唯一制作流程

```text
确认文稿或剧本
  -> 角色资产获得稳定 entityId
  -> 为需要替换人声的角色/旁白绑定 voiceProfileId 和 IndexTTS2 多情绪包
  -> 完成角色、场景、道具资产
  -> 导演分镜：对白/旁白/无对白动作、角色、原文、情绪和时长预算
  -> 生成分镜图和分镜视频
  -> 每条视频就绪后，Qwen2.5-Omni-7B 结合对应分镜脚本逐镜分析画面+声音
  -> 合并并校验为唯一 editing-timeline.json
  -> FFmpeg 依时间轴裁切、按分镜顺序拼接为 picture-master.mp4
  -> 按分镜声音类型和用户选择：保留原声、生成单讲述者旁白，或进入 IndexTTS2 多角色配音
  -> 使用配音并保留环境声时，仅对实际存在待替换人声的原音执行人声/非人声分离
  -> 用确认原文和同一时间轴生成 SRT
  -> FFmpeg 混音并烧录字幕，输出最终成片
```

Qwen2.5-Omni-7B 不读取拼接后的长视频。每条原始分镜视频独立分析，避免长上下文导致后段注意力下降。一条视频生成成功就可以开始分析，不必等待本集所有视频。旧版单人旁白项目也遵守此规则，不再固定截取每段前 N 秒。

## 4. 角色与音色包合同

### 4.1 角色绑定

角色视觉资产的 `entityId` 同时作为配音 `speakerId`。旁白没有视觉资产时单独使用稳定的 `narrator-*` ID。显示名称只用于 UI 和 Wiki，不参与业务匹配。

每个需要正式配音的角色最少绑定：

```ts
interface SpeakerBinding {
  speakerId: string
  displayName: string
  voiceProfileId: string
  packLanguage: string
  packModel: 'indextts-2'
  status: 'pending' | 'ready' | 'invalid'
}
```

角色资产生成后即可绑定音色包。无台词角色、或最终选择保留原声的项目，不要求绑定。当音频策略为替换人声时，导演分镜发现某个说话者没有有效绑定，则在配音前要求补齐；不删除已完成的资产、分镜和视频。

### 4.2 多情绪包

当前已验证的角色包位于应用级音色库，例如：

```text
<userData>/voice-library/packs/<voiceProfileId>/<language>/indextts-2/
├── manifest.json
├── source-reference.wav
├── neutral.wav
├── happy.wav
├── sad.wav
├── angry.wav
├── fearful.wav
├── disgusted.wav
├── surprised.wav
└── other.wav
```

`manifest.json` 是唯一包合同。应用使用前必须校验：

- `voiceProfileId` 与角色绑定一致；
- `model.id === "indextts-2"`；
- `source.referenceRelativePath` 可解析；
- 至少有 `neutral` 且音频文件存在；
- 情绪项只有 `status: generated` 且文件存在时可用；
- 音频可解码且时长大于 0。

包语言优先匹配项目语言。没有匹配语言时不能静默跨语言使用；必须先通过同角色跨语言本地探针，或让用户选择另一个可用包。

### 4.3 情绪映射

导演可以写丰富的自然语言情绪，执行层只映射到包内已有的八类：

```text
平静、克制、坚定、普通 -> neutral
开心、兴奋、轻快       -> happy
悲伤、失落、难过       -> sad
愤怒、激烈、不满       -> angry
害怕、紧张、恐惧       -> fearful
厌恶、嫌弃             -> disgusted
惊讶、震惊             -> surprised
无法可靠映射           -> other；没有 other 时回退 neutral
```

映射结果必须记录在配音任务中，用户可以在生成前修改。不能因为情绪样音缺失而改用其他角色的情绪音频。

## 5. 导演分镜与视频合同

### 5.1 镜头声音类型

每个镜头必须标记：

- `onscreen`：画面内角色说话，包括对话和自言自语；
- `voiceover`：旁白或画外音，画面中不要求人物口型；
- `none`：无对白动作镜头。

有声音的镜头记录 `speakerId`、确认原文、情绪、强度、语速、停顿和重音。无声音镜头不创建配音任务。

一个镜头只允许一个连续说话轮次和一个 `speakerId`。说话者切换必须拆镜；本阶段不支持同镜多人重叠对白，因此不需要说话人识别。

### 5.2 时长

- `playDuration` 是导演预算，不是固定截取时长；
- `generationDuration` 仍取视频模型支持的 `4 / 6 / 8` 秒；
- 实际保留区间来自 Qwen2.5-Omni-7B 对关键动作和说话窗口的判断；
- 模型无法可靠判断时，保留该镜完整视频，不猜测裁切点；
- 正式配音服从最终画面时间窗，不反向改变已确认剪辑。

### 5.3 视频提示词

- `onscreen`：要求对应角色自然说出本镜原文并完成口型/动作表演；原声文字可能不准确，只作为时间和口型证据。
- `voiceover`：视频模型不生成旁白人声，只生成画面、环境和动作。
- `none`：不生成任何台词或旁白。

## 6. 逐镜 Omni 分析与剪辑时间轴

### 6.1 分析时机

每条分镜视频生成成功后立即单独提交 Qwen2.5-Omni-7B，同时传入该镜的分镜脚本、视频和原音。模型不分析拼接后的长素材母带。

输出仅回答：

- 分镜目标动作在何时完整发生；
- `onscreen` 的目标说话窗口；
- 能完整保留动作和说话的最小裁切区间；
- 结果是否需要人工检查。

### 6.2 `editing-timeline.json`

所有逐镜结果合并到一个项目级文件：

```json
{
  "shots": [
    {
      "shotId": "shot-003",
      "sourceVideoPath": "media/shot-003.mp4",
      "sourceDurationMs": 6000,
      "trimStartMs": 900,
      "trimEndMs": 5100,
      "outputStartMs": 0,
      "outputEndMs": 4200,
      "needsReview": false,
      "dialogue": {
        "speakerId": "role-001",
        "text": "怎么会是他？",
        "emotion": "surprised",
        "sourceStartMs": 2100,
        "sourceEndMs": 3900,
        "outputStartMs": 1200,
        "outputEndMs": 3000
      }
    }
  ]
}
```

`onscreen` 的 `dialogue.source*` 由 Omni 对齐原声说话窗口。`voiceover` 没有原声说话证据，由程序使用导演时长预算在裁切后镜头内安排目标窗口；`none` 不生成 `dialogue`。

`audioMode` 是成片任务设置，不属于 `editing-timeline.json`，只允许：

```text
keep-original              # 保留裁切后的原音，不生成正式配音，不做人声分离
replace-preserve-ambience  # 使用正式配音并保留环境声；原音有待替换人声时才分离
replace-all                # 丢弃全部原音，只混入正式配音，不做人声分离
```

`source*` 时间相对于单条原始视频，`output*` 时间相对于裁切拼接后的 `picture-master.mp4`。程序按分镜顺序累加计算 `output*`，不让模型猜绝对时间。切换 `audioMode` 不修改或重生成剪辑时间轴。

### 6.3 确定性校验与剪辑

应用用 `ffprobe` 读取每条视频真实时长，并在调用 FFmpeg 前校验：

- `0 <= trimStartMs < trimEndMs <= sourceDurationMs`；
- 说话窗口必须完整落在裁切区间内；
- 各镜头 `output*` 必须按顺序连续且不重叠；
- 无效或 `needsReview: true` 的模型结果不自动裁切，保留完整原始镜头。

通过校验后，FFmpeg 用每镜 `trimStartMs/trimEndMs` 裁切视频和原音，然后按分镜顺序拼接为 `picture-master.mp4`。它是画面剪辑母版，不是最终交付成片。

### 6.4 Qwen2.5-Omni-7B 接入探针

接入主流程前，必须用本地实际模型完成三条短视频探针：一条画面内说话、一条无对白动作、一条延迟开口。验证视频+音频输入、JSON 输出、时间精度和失败返回。探针未通过前不把模型接入 APP 主流程。

## 7. 正式配音

### 7.1 自动路由

配音节点不等于必须调用 IndexTTS2。应用根据确认分镜自动选择：

```text
保留原声
  -> 跳过正式配音

所有有声镜头都是 voiceover，且只有一个 speakerId
  -> 沿用 jc-voice-design 单讲述者能力生成本集旁白

存在 onscreen 或多个 speakerId
  -> 使用已绑定的 IndexTTS2 多情绪角色包
```

三条路由都在逐镜 Omni 分析和画面母版之后执行。单人旁白只简化声音生成，不跳过画面剪辑。

### 7.2 IndexTTS2 调用输入

多角色路由对每个需要声音的镜头提交：

```ts
interface EpisodeVoiceTask {
  shotId: string
  speakerId: string
  text: string
  startMs: number
  endMs: number
  targetDurationMs: number
  speakerReferencePath: string
  emotion: string
  emotionReferencePath: string
  model: 'indextts-2'
}
```

- `text` 必须来自确认剧本/分镜原文；
- `speakerReferencePath` 使用角色包 `source-reference.wav`；
- `emotionReferencePath` 使用映射后的情绪样音；
- `targetDurationMs` 使用裁切后的最终说话窗口。

对用户而言只有一个「生成本集配音」任务；内部按镜头逐条生成和持久化，便于只重试失败项。不用一条 Multi-Talk 长音频再按时间戳硬切。

### 7.3 ComfyUI 接入探针

仓库 `xuchenxu168/Comfyui-Index-TTS2` 已确认包含说话人参考、`audio_prompt` 情绪参考、Multi-Talk、`target_duration` 和实际时长输出。

但第三方 README 不是稳定 API 合同。接入 APP 前必须先用用户实际 ComfyUI 环境和 API 格式工作流完成一个本地探针：同一角色包、两句不同情绪台词、两个指定目标时长，确认输入节点、输出路径、取消、失败和实际时长字段。

### 7.4 时长处理

- 先使用工作流的目标时长能力生成；
- 输出短于时间窗时补静音，不拉长字音；
- 输出长于时间窗时按目标时长重新生成一次；
- 仍然超长时标记 `needs-review`，不截断台词，不静默加速到失真；
- 成功音频按 `startMs` 放入本集绝对时间轴。

全部镜头就绪后生成一条 `episode-voice.wav`。纯动作项目不创建空音轨。

## 8. 原声策略、混音和字幕

### 8.1 原声策略

| `audioMode` | 原视频声音 | 正式配音 | 人声分离 | 最终音轨 |
| --- | --- | --- | --- | --- |
| `keep-original` | 保留 | 跳过 | 跳过 | 裁切后原音 |
| `replace-preserve-ambience` | 保留或分离 | 单讲述者或 IndexTTS2 | 仅原音含待替换人声时执行 | 原环境声/非人声轨 + 正式配音 |
| `replace-all` | 静音 | 单讲述者或 IndexTTS2 | 跳过 | 正式配音 |

人声分离参考 `/Users/by3/Documents/peiyin-pyvideotrans` 的最小能力边界：

- `videotrans/task/_stage_prepare.py::_split_audio_byraw()`：FFmpeg 提取 44.1kHz 双声道 PCM；
- `videotrans/process/_audio_separate.py::vocal_bgm()`：UVR/MDX；
- `videotrans/process/_audio_separate.py::vocal_bgm_spleeter()`：Spleeter。

只选择一个经打包和探针验证的默认分离模型，不同时维护两套默认路径。纯 `voiceover` 项目的原视频按提示词不应生成人声，因此直接保留裁切后原音并混入旁白；只有存在待替换 `onscreen` 人声时才做分离。分离失败只阻断 `replace-preserve-ambience`；已有剪辑时间轴、画面母版和配音任务原地保留。

### 8.2 最终混音

FFmpeg 始终使用 `picture-master.mp4` 的视频轨，并根据 `audioMode` 选择一条音频路径：

- `keep-original`：直接使用 `picture-master.mp4` 裁切后的原音轨；
- `replace-preserve-ambience`：无原人声时混合裁切后原音和 `episode-voice.wav`；有待替换人声时混合 `instrument.wav` 和 `episode-voice.wav`；
- `replace-all`：只使用 `episode-voice.wav`。

混音前统一采样率和声道，限制峰值避免削波。裁切视频和裁切原声/非人声必须使用 `editing-timeline.json` 中的同一组区间。

### 8.3 字幕

- 字幕文字来自每镜确认原文；
- `keep-original` 使用 Omni 确认后的原声说话窗口；
- 使用配音时使用单讲述者或 IndexTTS2 最终音频的实际起止时间；
- `none` 镜头不生成字幕；
- 直接从 `editing-timeline.json` 生成 SRT，不再做 ASR；
- 字幕文件先写入项目 Wiki，再使用现有默认样式烧录。

## 9. Wiki 与执行状态

```text
项目 Wiki/
├── 文稿/确认文稿.md
├── 声音/角色/<speakerId>.md
├── 声音/配音任务/episode-001.md
├── 分镜/导演总览.md
├── 分镜/镜头/shot-001.md
├── 剪辑/episode-001/editing-timeline.json
├── 字幕/episode-001.srt.md
└── 成片/episode-001.md
```

状态：

```text
音色绑定：pending -> ready -> invalid -> skipped
逐镜分析：pending -> running -> ready -> needs-review
画面母版：pending -> running -> ready
逐镜配音：pending -> running -> ready -> needs-review -> skipped
人声分离：pending -> running -> ready -> failed -> skipped
最终成片：pending -> running -> ready
```

`skipped` 是用户选择导致的正常完成状态，不是失败。

失效规则：

| 修改内容 | 必须失效 | 保留 |
| --- | --- | --- |
| 确认文稿正文 | 资产、分镜及全部下游采用状态 | 原始输入和既有媒体文件 |
| 分镜原文、声音类型或角色 | 对应视频分析及全部下游 | 音色库、资产、未受影响镜头 |
| 采用的视频版本 | 对应镜头分析、画面母版及全部下游 | 分镜图和未受影响镜头 |
| `audioMode` | 配音/分离、混音、字幕时间和最终成片 | 资产、分镜、视频、剪辑时间轴、画面母版 |
| `voiceProfileId` 或情绪映射 | 受影响逐镜配音、混音、替换模式的字幕和最终成片 | 资产、分镜、视频、剪辑时间轴、画面母版 |
| 逐镜正式配音 | 本集音轨、替换模式的字幕和最终成片 | 画面母版、剪辑时间轴、非人声轨 |
| 字幕样式 | 最终成片 | 视频、音频和剪辑时间轴 |

页面切换、阶段跳转、项目切换和重新打开应用永不触发失效。失败只标记对应子任务，已成功的镜头和音频原地保留。

## 10. UI 最小适配

不改变三栏布局。顶部保持七个节点：

```text
文稿 -> 资产 -> 分镜 -> 分镜图 -> 视频 -> 配音 -> 成片
```

中栏保持五个标签：

```text
文稿 | 资产/声音 | 分镜 | 分镜图/视频 | 成片
```

- `文稿`：不再展示旧版「文稿/配音」混合区，中栏只展示确认文稿，右栏保留生成、AI 修改和确认。
- `资产/声音`：声音是角色资产的一部分，不单独占顶部阶段。角色行显示音色包名称、绑定状态和试听；右栏对当前角色提供选择/更换音色包。
- `分镜`：展示声音类型、`speakerId`、确认原文和情绪；不展示或生成正式配音。
- `分镜图/视频`：保持现有逐镜图片、视频和预览。每条视频就绪后自动提交 Omni 分析，视频行显示「采用 0.9-5.1 秒」或「完整保留」。点击某镜后，右栏的 AI 修改只修改该镜剪辑意见；「重新生成本镜」仍是独立次要操作。
- `配音`：与「成片」共用中栏成片视图。进入时按 `editing-timeline.json` 生成并预览画面母版，右栏显示「原声处理」三选一和当前唯一主动作。
- `成片`：中栏显示画面母版、配音、字幕文档和最终成片；右栏只显示「生成最终成片」、打开和导出。
- 「原声处理」分段控件显示：`保留原声 | 使用配音并保留环境声 | 仅使用配音`。保留原声时「配音」以 `skipped` 正常完成；单讲述者和 IndexTTS2 都显示为「已生成」。
- 人声分离是成片任务内部的可选步骤，不单独加按钮。字幕在「生成最终成片」时自动生成并烧录，不新增第八个顶部阶段。用户修改字幕后，只失效最终成片，右栏显示「重新生成成片」。

进度对号、按钮启用和下一步跳转必须复用同一组持久化就绪计算，禁止各组件分别判断。分镜图不再依赖旧 `voicePath`；「视频」只在所有原视频已生成且 Omni 结果已就绪/完整保留时显示对号。项目没有任何声音镜头时，「配音」自动就绪，不生成空配音或空字幕。

## 11. 用户操作流程

1. 新建项目，输入或导入剧本，设置比例、画风和模型，确认文稿。
2. 生成角色、场景、道具 JSON，可选搜索/上传参考图，生成并确认资产图。需要多角色配音时可在角色行提前绑定音色包。
3. 生成导演分镜，查看对白/旁白/无对白、说话者和情绪；需要时在右栏 AI 修改。
4. 生成分镜图，预览并只重试不满意或失败的镜头。
5. 生成分镜视频。每条视频完成后 Omni 自动逐镜分析；用户预览采用区间，可修改剪辑意见或重新生成本镜。
6. 进入配音，应用自动按时间轴生成画面母版。用户选择保留原声、配音+环境声或仅配音。
7. 保留原声直接进入成片；单讲述者项目调用现有设计声音；多角色/画面内对白使用 IndexTTS2，缺失音色包时只补齐对应说话者。
8. 用户在中栏预览画面母版和配音，确认后点击「生成最终成片」。
9. 应用按原声策略自动分离/静音/保留原音，生成 SRT、烧录字幕并输出成片。用户预览后打开或导出。

单讲述者项目只在第 7 步使用更简单的声音引擎；第 5 步的逐镜 Omni 分析必须保留，不能回到固定截取前 N 秒。

## 12. 实施顺序

1. 用三条本地短视频完成 Qwen2.5-Omni-7B 视频+音频、分镜约束、JSON 和时间精度探针。
2. 获取用户实际 ComfyUI API 工作流，完成 IndexTTS2 两句双情绪、目标时长本地探针。
3. 扩展角色音色绑定、镜头声音类型、`audioMode` 和 `editing-timeline.json` 持久化合同。
4. 实现逐镜 Omni 任务、时间校验、失败项重试和 FFmpeg 裁切拼接。
5. 保留现有单讲述者设计声音路径，实现自动配音路由、逐镜 IndexTTS2 任务、本集音轨和失败项重试。
6. 仅为 `replace-preserve-ambience` 接入和验证一条人声分离路径，实现三种音频混合与字幕烧录。
7. 最后移除旧版文稿后配音和 `voicePath` 分镜图门禁，调整前端标签、三选一控件、进度节点和按钮，不重做页面。
8. 新建项目完成验收后再打包 APP。

## 13. 验收标准

1. `jc-voice-design` 保持单讲述者合同，可完成只有一名旁白说话者的本集配音，没有被改成多角色 Skill。
2. 角色可以绑定已生成的 IndexTTS2 多情绪包并试听每个有效情绪。
3. 每条分镜视频独立读取画面和原音，不把整集长视频提交给 Omni。
4. `editing-timeline.json` 的裁切、说话和输出时间全部通过校验，失败或不确定镜头保留完整原片。
5. 延迟开口和后半段关键动作不再因「截前 N 秒」被删掉。
6. `keep-original` 保留裁切后原声，不运行 IndexTTS2 和人声分离。
7. `replace-preserve-ambience` 使用正确单讲述者或角色情绪配音；原音无人声时直接保留，有待替换人声时丢弃人声并保留可听的非人声轨。
8. `replace-all` 不运行人声分离，最终不带原视频音轨。
9. 分离失败不会清空时间轴、画面母版或已成功配音，可重试或改选策略。
10. 字幕文字与确认原文一致，时间与保留原声或最终配音的说话窗口一致，不运行 ASR。
11. 对话、自言自语、旁白和无对白动作都能进入正确时间轴和音频路径。
12. 某镜 Omni 或某句配音失败时只重试该项，不重做其他成功镜头。
13. 页面、项目切换或重启应用不会清空已成功结果。
14. 新建一个纯单讲述者项目，确认每条视频仍经 Omni 逐镜选段，然后使用设计声音、保留环境声、生成字幕和成片。
15. 新建一个包含两名角色对话、一个自言自语镜头、一个旁白镜头和一个无对白动作镜头的项目，三种 `audioMode` 分别完整跑通。
16. 顶部只有七个阶段，字幕随最终成片自动生成；修改字幕只需重新生成成片。

## 14. 明确不做

- 不升级 `jc-voice-design` 为多角色 Skill；
- 不让预生成配音决定视频剪辑；
- 不再接入 Whisper ASR、VAD 或说话人识别；
- 不再让 Qwen3-VL 分析拼接后的长素材母带；
- 不为单讲述者项目恢复固定截取前 N 秒的旧剪辑方式；
- 不增加独立「简单流程」开关或第八个「字幕」阶段；
- 不支持同镜多人重叠对白；
- 不复制 `/Users/by3/Documents/peiyin-pyvideotrans` 的 GUI、ASR、翻译、任务队列和缓存系统；
- 不增加第二套剪辑时间轴或项目状态机；
- 不增加工作流版本字段，不迁移已有测试项目；
- 不修改 `/Users/by3/Documents/jiucaihezi-app` 或 `/Users/by3/Documents/peiyin-pyvideotrans`。

## 15. 当前审计记录

- 2026-08-02 本机探针：`Qwen2.5-Omni-7B` 官方权重已下载到 APP 用户数据目录，Transformers + MPS 能读取带原音 MP4 并输出文本；单镜实测约 52-74 秒。
- 2026-08-02 本机探针：Omni 严格时间 JSON 共测试三类短视频。模型出现秒/毫秒混淆、漏字段和截断；极简提示可以返回合法毫秒 JSON，但只选择“完整保留、需要检查”的安全兜底，尚未证明智能裁切时间精度。因此当前不得接入 APP 主流程。
- 2026-08-02 本机探针：同一 IndexTTS2 音色参考结合 `happy.wav`、`sad.wav` 成功生成两句不同情绪音频，实际时长约 2.71 秒和 3.13 秒。
- 2026-08-02 本机探针：当前 IndexTTS2 Gradio `/gen_single` 支持说话人参考和情绪音频参考，但没有 `target_duration` 输入；本机 ComfyUI 也未安装 IndexTTS2 节点。目标时长能力仍未通过，不能按第三方说明假定可用。
- 已验证：示例角色包包含稳定 `voiceProfileId`、`source-reference.wav` 和八种 IndexTTS2 情绪参考音。
- 已验证：`Comfyui-Index-TTS2` 代码包含说话人参考、音频情绪参考、Multi-Talk、目标时长和实际时长输出；实际 API 工作流仍需本地探针。
- 已确认：分镜脚本是台词、说话者和镜头意图的权威来源，Qwen2.5-Omni-7B 只负责把它对齐到每条视频的画面和原声时间。
- 已删除设计：固定截取前 N 秒、整集 Qwen3-VL 分析、Whisper ASR、VAD、说话人识别和 ASR 转 SRT。
- 已更正：人声分离不是必选阶段；只有「使用配音并保留环境声」且原音存在待替换人声时需要它。
- 已更正：单讲述者项目复用现有设计声音能力，但与多角色项目一样必须经过 Omni 逐镜选段。
- 已更正：顶部七阶段为「文稿 -> 资产 -> 分镜 -> 分镜图 -> 视频 -> 配音 -> 成片」；字幕归属成片自动生成。
- 待执行：当前「点一点」尚未接入 Qwen2.5-Omni-7B、IndexTTS2 和人声分离运行时；不能只调整前端 UI 后宣称流程完成。
