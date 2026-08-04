# 项目总监双路线、导演分镜与配音成片编排 SDD

> 日期：2026-08-03
> 状态：方案已重新对齐，待执行
> 目标版本：2.9
> 适用范围：项目总监分流、Qwen3-TTS、IndexTTS2、Faster-Whisper、Gemini、Spleeter、导演分镜、剪辑、混音与字幕
> 上位文档：`docs/项目总监与全流程Wiki联动SDD.md`、`docs/音色库整理与角色声音Wiki索引SDD.md`
> 相关 Skill：`skills/jc-film-style/SKILL.md`、`skills/jc-script-storyboard/SKILL.md`、`skills/jc-voice-design/SKILL.md`
> 替代关系：本版完整替代 2026-08-02 的“统一后置配音、禁用 Whisper”方案；旧结论不再参与实现。

## 1. 一句话目标

文稿确认后先由项目总监判断本项目走“旁白宣传片”还是“剧情片”。旁白宣传片先生成正式旁白并自动用 Faster-Whisper 得到时间轴，再让导演按旁白时间和节奏设计画面；剧情片在资产阶段只绑定角色音色，视频生成后由 Faster-Whisper 生成素材 SRT，再由 Gemini 结合确认剧本、完整分镜提示词、素材 SRT 和原视频直接输出含角色身份与准确剪辑点的 `editing-timeline.json`。用户在“配音字幕”工作台用滑块微调剪辑点、主动生成配音并完成可选的人声处理，最后一次烧录配音和字幕。

## 2. 已确认决策

1. 项目总监必须在声音生成、资产和分镜之前完成，并负责判定项目制作路线；用户可以在项目总监页直接修改路线并重新确认，不被 AI 首次判断锁死。
2. 制作路线只允许 `narration-promo` 和 `drama`。AI 给出初判和理由，用户拥有最终决定权；下游不再自行猜测路线。
3. `narration-promo` 以正式旁白及其时间戳为第一时间轴；分镜、画面和字幕都服从它。
4. `drama` 以确认剧本、角色身份和导演分镜为第一依据。资产阶段只确定 `speakerId -> voiceProfileId`；IndexTTS2 必须等 `editing-timeline.json` 就绪后按真实时间窗生成，不提前合成无时长依据的对白。
5. 旁白宣传片和剧情片都允许用户选择“设计声音”或“克隆音色包”。
6. 设计声音继续使用现有 Qwen3-TTS VoiceDesign 或云端声音设计能力；克隆声音统一使用 IndexTTS2 多情绪包。
7. 配音设置增加 IndexTTS2，并提供检测、启动服务和停止服务；不再只显示 Qwen3-TTS。
8. Faster-Whisper 负责识别人声内容及精确发声时间并生成 SRT；Gemini 通过 SRT 台词与确认剧本直接确定 `speakerId`，通过原视频和完整分镜提示词确定无对白动作与准确剪辑点；Sherpa-ONNX 只作为 Spleeter 分离链路的推理引擎，不再执行说话人聚类。职责不得混用。
9. 宣传片默认要求视频模型不生成人声，因此成片默认不跑人声分离，直接混入正式旁白和素材环境/动作音。
10. 剧情片替换模型原声时才运行 Spleeter，移除原人声并保留伴奏、环境声和动作音。
11. 每条生成视频先点击“生成 SRT”，由 Faster-Whisper 识别人声及精确发声时间。随后点击“生成剪辑时间轴”，Gemini 逐条读取原始视频、完整分镜视频提示词、确认剧本和对应素材 SRT，通过台词与剧本直接确定角色，通过画面确定无对白戏剧动作，并汇总输出包含每条素材准确剪辑点的整集 `editing-timeline.json`。
12. 不再固定截取每段视频前 N 秒。Gemini 输出初始真实剪辑点；用户选中工作台行后用右栏区间滑块逐条微调，值变化即自动持久化，不另设保存或确认按钮。FFmpeg 只执行 `editing-timeline.json` 当前采用值，不自行推断剪辑点。
13. 字幕文本始终来自确认文稿或剧本；Whisper 只提供时间证据，不允许用识别误差改写正式文字。
14. 不强制在旁白生成后立刻按 5 秒切节拍。先保存 Whisper 的自然句段，导演再结合镜头节奏决定拆分或合并。
15. 顶部现有“配音”节点升级为“配音字幕”节点，顺序为 `文稿 -> 资产 -> 分镜 -> 分镜图 -> 视频 -> 配音字幕 -> 成片`。点击后必须进入可预览、校对、绑定和试听的正式工作台，不能只是一个进度状态。
16. 产品尚未发布，只实现新流程，不维护旧流程兼容分支。

## 3. 项目总监前置分流

### 3.1 顺序

```text
输入文稿/剧本
  -> 确认文稿
  -> 项目总监分析并生成 Wiki
  -> 用户确认，或修改 productionRoute 后确认项目总监方案
  -> 执行对应声音与制作路线
```

文稿页在确认后只显示“进入项目总监”，不提前生成声音。项目总监页显示 AI 判断、理由和可编辑的路线分段控件；用户可直接接受，也可切换路线后确认。只有确认后的路线才能开放声音与资产动作。

### 3.2 判定合同

项目总监输出增加：

```ts
type ProductionRoute = 'narration-promo' | 'drama'

interface ProductionRouteDecision {
  productionRoute: ProductionRoute
  rationale: string
  decidedBy: 'ai' | 'user'
  narratorIds: string[]
  speakingCharacterIds: string[]
  hasOnscreenDialogue: boolean
}
```

判定原则：

- 以统一旁白、解说、产品介绍、知识讲述或广告口播推动全片，画面主要服务旁白时，判为 `narration-promo`。
- 以角色行动、对话、冲突和场景表演推动故事时，判为 `drama`。
- 有少量角色画面不等于剧情片；关键在于时间轴是否由旁白主导。
- 有少量画外旁白不等于宣传片；关键在于剧情是否仍由角色行动和对白主导。
- 判断不确定时必须写入 `warnings`，由用户确认，不静默选择。
- 用户修改路线时保留 AI 原判断与理由作为审计信息，同时把 `decidedBy` 设为 `user`；项目执行只读取用户最终确认值。
- 已进入下游后仍允许回到项目总监修改路线。确认新路线时按失效表清除旧路线专属声音、分镜和媒体，不删除确认文稿及仍被项目总监白名单采用的视觉资产。

结果落盘：

```text
wiki/项目/项目总监.md
wiki/项目/制作路线.md
```

## 4. 两条唯一生产流程

### 4.1 旁白宣传片路线

```text
项目总监确认 narration-promo
  -> 用户选择设计声音或克隆音色包
  -> 设计声音：生成声音设定并合成正式旁白
     克隆音色包：绑定 narrator-* 音色包并由 IndexTTS2 合成正式旁白
  -> Faster-Whisper 读取正式旁白
  -> 对齐确认文稿，生成 narration-timeline.json 和 narration.srt
  -> 角色、场景、道具资产
  -> 宣传片导演路线：旁白时间轴 + 镜头节奏 + 项目总监视觉总纲
  -> Veo 或 Grok 生成分镜图和视频
  -> “生成 SRT”：Faster-Whisper 逐条检查素材人声；正常情况下输出空 SRT
  -> Gemini 逐条读取原视频、分镜视频提示词、素材 SRT 和关联旁白 cue
  -> Gemini 直接输出 editing-timeline.json，不改变旁白绝对时间轴
  -> 进入配音字幕工作台：原视频区间预览、字幕与剪辑点校准
  -> FFmpeg 只按当前采用剪辑点裁切并拼接画面母版
  -> 混入正式旁白、环境声和动作音
  -> 按旁白时间轴烧录节拍字幕
  -> 输出成片
```

正式旁白生成后才允许“转分镜”。后续重新选择声音、修改旁白文本或重新生成正式旁白，必须失效宣传片分镜及其全部下游；只修改声音音量或字幕样式不失效画面。

### 4.2 剧情片路线

```text
项目总监确认 drama
  -> 生成角色、场景、道具资产
  -> 用户为有台词角色绑定稳定 speakerId 和设计声音或克隆音色包
  -> 导演分镜
  -> Veo 或 Grok 生成分镜图和带原声表演的视频
  -> “生成 SRT”：Faster-Whisper 识别人声内容和精确发声时间
  -> “生成剪辑时间轴”：Gemini 读取原视频、完整分镜视频提示词、确认剧本和素材 SRT
  -> Gemini 通过台词与剧本确定 speakerId，通过画面确定无对白动作并直接输出 editing-timeline.json
  -> 进入配音字幕工作台：原视频区间预览、字幕与剪辑点校准
  -> 用户可用滑块修改时间轴；修改即更新 editing-timeline.json
  -> 用户点击“生成中文配音”，IndexTTS2 按每句当前时间窗生成中文克隆配音
  -> 用户按需翻译英文字幕并生成英文克隆配音
  -> Spleeter 分离原人声和背景声
  -> 去除原人声，把对应逐句对白资产放入说话窗口
  -> 混回背景声、环境声和动作音
  -> FFmpeg 只按当前采用剪辑点裁切，并烧录选定语言的配音和字幕
  -> 输出成片
```

资产阶段只做角色声音绑定，不预创建逐句记录，也没有对应按钮。`editing-timeline.json` 就绪后才开放“生成中文配音”；不会自动生成。用户调整某句剪辑点后，只把受影响句标为待重新生成。英文字幕和英文配音均为用户主动动作，默认不生成。

## 5. 配音引擎与本地服务

### 5.1 设置 UI

现有“生成设置”弹窗的配音引擎区域最小扩展为：

```text
配音模式：云端 | 本地

本地引擎：
  Qwen3-TTS VoiceDesign
  IndexTTS2

状态：未检测 | 可用未启动 | 启动中 | 运行中 | 启动失败
动作：检测 / 启动服务 / 停止服务
```

- 选中 Qwen3-TTS 时继续显示现有模型路径和检测结果。
- 选中 IndexTTS2 时显示运行时路径、模型目录和服务状态。
- “启动服务”只启动当前引擎，不自动切换云端，不弹第二次确认。
- APP 关闭或用户点击停止时终止本项目启动的子进程；不得杀死用户在其他项目中手动启动的进程。
- 运行中的服务端口、PID 和启动时间写入应用运行状态，不写入项目创作 Wiki。

### 5.2 能力路由

| 用户选择 | 旁白宣传片 | 剧情片角色 |
|---|---|---|
| 设计声音 | `jc-voice-design` + Qwen3-TTS/云端生成正式旁白 | 先设计角色音色并固化为角色音色包；时间轴就绪后由 IndexTTS2 克隆逐句对白 |
| 克隆音色包 | 绑定 `narrator-*` 音色包，IndexTTS2 生成正式旁白 | 资产阶段绑定每个角色音色包，时间轴就绪后由 IndexTTS2 生成逐句对白 |

`jc-voice-design` 不升级为多角色批量配音 Skill。剧情片中的“设计声音”只负责建立稳定音色来源，不能每集重新生成漂移的角色声线。

### 5.3 IndexTTS2 服务合同

每次生成输入最少包含：

```ts
interface DialogueSynthesisInput {
  dialogueId: string
  speakerId: string
  text: string
  emotion: string
  voiceProfileId: string
  referenceAudioPath: string
  emotionAudioPath?: string
  targetDurationMs?: number
}
```

服务输出独立 WAV 和真实时长。单句失败只重试该句；停止任务保留已经成功的句子。

## 6. 声音资产合同

### 6.1 身份绑定

角色视觉资产 `entityId` 同时作为 `speakerId`。公共旁白使用稳定的 `narrator-*`。绑定仍写入：

```text
wiki/声音/角色/<speakerId>.md
```

同项目跨镜头和跨集复用绑定；跨项目同名不得自动继承。

### 6.2 剧情逐句对白资产

资产阶段不预创建逐句记录或空音频记录。`editing-timeline.json` 就绪后，用户点击“生成中文配音”，系统才根据其中的真实剪辑点、`speakerId`、确认台词和情绪创建逐句对白资产并调用 IndexTTS2：

```ts
interface DialogueAsset {
  dialogueId: string
  editPointId: string
  speakerId: string
  text: string
  emotion: string
  sourceMediaId: string
  targetStartMs: number
  targetEndMs: number
  audioPath: string
  actualDurationMs: number
  status: 'pending' | 'running' | 'success' | 'failed'
}
```

落盘：

```text
wiki/声音/episode-001/对白资产.json
media/voice/dialogue/<dialogueId>.wav
```

剧情片角色声音绑定是资产页的一部分：角色卡只显示“音色已绑定”，不预创建逐句记录，也不显示虚假的待处理数或配音完成数。Gemini 输出 `editing-timeline.json` 后开放“生成中文配音”；用户点击后才调用 IndexTTS2，成功的逐句 WAV 成为本集对白资产并可直接试听。

### 6.3 旁白资产

宣传片落盘：

```text
wiki/声音/episode-001/旁白方案.md
media/voice/narration.wav
wiki/声音/episode-001/narration-timeline.json
wiki/字幕/episode-001-narration.srt
```

`narration.wav` 是宣传片的权威时长。目标时长只能作为生成前预算；正式旁白时长生成后，项目时间轴改用真实时长。

## 7. Faster-Whisper 与人声分离

### 7.1 开发期复用路径

开发阶段允许直接调用现有 Python 解释器，不复制或修改其 `.venv`：

```text
/Users/by3/Documents/peiyin-pyvideotrans/.venv/bin/python
```

Faster-Whisper：

```text
模型：/Users/by3/Documents/peiyin-pyvideotrans/models/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo
入口：/Users/by3/Documents/peiyin-pyvideotrans/videotrans/recognition/_whisper.py
版本：faster-whisper 1.2.1 / ctranslate2 4.8.1
```

Spleeter 分离模型：

```text
/Users/by3/Documents/peiyin-pyvideotrans/models/onnx/vocals.fp16.onnx
/Users/by3/Documents/peiyin-pyvideotrans/models/onnx/accompaniment.fp16.onnx
入口：/Users/by3/Documents/peiyin-pyvideotrans/videotrans/process/_audio_separate.py
函数：vocal_bgm_spleeter(input_file, vocal_file, instr_file)
推理依赖：sherpa-onnx 1.13.4
```

正式打包时建立本 APP 自己的 Python 环境并共享只读模型目录；不把另一个项目的 GUI、任务队列、翻译流程和缓存管理复制进来。

### 7.2 旁白时间轴

Faster-Whisper 读取最终 `narration.wav`，输出自然句段。程序将识别文本与确认文稿顺序对齐，最终 JSON 使用确认文字：

```json
{
  "source": "faster-whisper-large-v3-turbo",
  "audioPath": "media/voice/narration.wav",
  "durationMs": 15320,
  "cues": [
    { "id": "narration-001", "startMs": 0, "endMs": 2860, "text": "确认文稿第一句" }
  ]
}
```

本阶段不强制每段小于 5 秒。宣传片导演可以按节奏把一个长旁白句映射到多个视觉镜头，也可以让一个慢节奏镜头覆盖多个短句，但旁白 cue 本身不被擅自改写。

### 7.3 剧情对白证据

每条原始分镜视频独立处理，不提交整集长视频：

```text
生成 SRT -> Faster-Whisper 识别人声内容和精确 startMs/endMs
生成剪辑时间轴 -> Gemini 读取原视频、确认剧本、完整提示词和素材 SRT，输出 editing-timeline.json
```

Faster-Whisper 的识别文本只用于提供人声时间证据，不直接成为最终字幕。Gemini 用 SRT 台词和确认剧本直接确定每句的稳定 `speakerId`，无需说话人聚类；画面分析只负责识别对话之外的戏剧动作、目标画面和真实区间。无法可靠确定剪辑点时标记 `needsReview`，不自动裁切。

素材级产物：

```text
wiki/转录/episode-001/<mediaId>-whisper.json
wiki/字幕/素材/<mediaId>-whisper.srt
```

一个分镜提示词如果包含对话，必须同时明确：`speakerId`、确认台词、情绪、情绪强度、语速、停顿/重音和口型动作。缺少情绪的对话提示词不得提交视频，也不得进入 Gemini 剪辑分析。

## 8. 导演 Skill 三条路线

`jc-script-storyboard` 增加 `directorRoute` 输入：

```text
promo       -> 宣传片导演路线
veo         -> 剧情片 Veo 导演路线
grok        -> 剧情片 Grok 导演路线
```

APP 计算方式：

```text
productionRoute == narration-promo -> promo
productionRoute == drama && videoModel 是 Veo -> veo
productionRoute == drama && videoModel 是 Grok -> grok
```

### 8.1 宣传片导演路线

输入必须包含：

- 确认文稿；
- `narration-timeline.json`；
- 项目总监视觉总纲；
- 目标比例、视觉风格；
- 镜头节奏表；
- 视频模型能力边界。

处理顺序固定为：

1. 先读取旁白 cue 的真实起止时间。
2. 再结合快、中、慢节奏确定每个画面镜头的时长和切点。
3. 最后设计镜头画面、主体动作、景别、运镜、环境声和动作音效。
4. 每个镜头必须回链一个或多个 `narrationCueIds`。
5. 视频提示词必须写明“无画面内对白、无旁白人声”，避免模型生成重复人声。

宣传片画面总时长必须与正式旁白总时长一致；Veo 的 `4/6/8` 秒和 Grok 的 `6-30` 秒只是生成素材时长，最终采用区间仍按旁白时间轴裁切。

### 8.2 剧情片 Veo 路线

保持一镜一图、一镜一视频和 `4/6/8` 秒生成合同。画面内对白提示词必须逐字包含角色、台词、情绪、情绪强度、语速、停顿/重音和口型要求；缺少情绪视为提示词不完整。无对白镜头只生成动作与环境声。

### 8.3 剧情片 Grok 路线

保持现有组合分镜板、多参考图和 `6-30` 秒内部切镜合同：一个组合最多九个节拍、最多七张参考图，第一张为组合分镜板，其余为当前采用的场景、角色和道具资产图。

Grok 组合中的每个对白节拍同样必须包含说话者、确认台词和完整情绪字段。组合提示词按时间顺序保存这些字段，供 Gemini 与素材 SRT 直接确定角色和真实区间。

`rh-grok-image-video` 已用真实任务验证第一张九宫格分镜板、两张角色参考图（人类与动物）、角色一致性和片内切镜。官方能力合同为 `6-30` 秒；当前只把已验证的多图与切镜能力列为完成，不声称所有时长均已逐档测试。

## 9. 剪辑时间轴

### 9.1 强制证据顺序

每条生成视频的处理顺序固定为：

```text
原始分镜视频
  -> FFprobe 获取真实时长
  -> “生成 SRT”：Faster-Whisper 识别人声内容和精确发声时间
  -> “生成剪辑时间轴”：Gemini 读取原视频 + 确认剧本 + 完整分镜视频提示词 + 素材 SRT
  -> Gemini 通过台词确定 speakerId、通过画面识别无对白戏剧动作并输出 editing-timeline.json
  -> 程序确定性校验
  -> FFmpeg 执行
```

不得在素材 SRT 就绪前提交剧情片 Gemini 分析。宣传片素材预期没有人声，“生成 SRT”仍需生成合法的空 SRT 或意外人声记录；Gemini 继续根据原视频、提示词、确认文稿和空 SRT 判断目标画面。

### 9.2 素材 SRT 合同

“生成 SRT”保存 Faster-Whisper 的实际识别结果，不使用分镜提示词替换识别文字：

```ts
interface MaterialSubtitleCue {
  cueId: string
  mediaId: string
  startMs: number
  endMs: number
  recognizedText: string
}
```

- `startMs/endMs/recognizedText` 来自 Faster-Whisper；
- 最终中文字幕仍来自确认剧本，不能用 `recognizedText` 覆盖；
- 无人声素材允许输出空 SRT；
- 每条素材保留原始结果和失败状态，单条失败只重跑该素材。

### 9.3 Gemini 真实素材合同

Gemini 不再只输出一个笼统的视觉裁切范围，而是逐个映射分镜提示词中的目标内容：

```ts
interface MaterialEditPoint {
  shotId: string
  promptSegmentId: string
  sourceMediaId: string
  sourceStartMs: number
  sourceEndMs: number
  observedContent: string
  subtitleCueIds: string[]
  speakerIds: string[]
  confidence: number
  needsReview: boolean
}
```

Gemini 必须把 SRT 台词与确认剧本、分镜中的台词逐句匹配，直接写入对应稳定 `speakerId`；这一步不依赖画面猜演员。Gemini 同时说明该区间实际出现了什么，并回链具体 `promptSegmentId`。输出区间必须完整覆盖分镜要求的动作和对应对白，不得因为画面好看就丢掉说话窗口；无对白镜头依据画面中的戏剧动作确定剪辑点。无法可靠确定区间时保留完整素材并要求人工检查。

### 9.4 宣传片时间轴

宣传片以 `narration-timeline.json` 为绝对轴。Gemini 根据分镜提示词和素材 SRT 在每条素材内部输出真实画面区间，再由程序将该区间放入对应旁白窗口。画面不足时允许减速、定格尾帧或要求重生素材；不得裁掉旁白。

### 9.5 剧情片时间轴

剧情片 `editing-timeline.json` 由 Gemini 直接输出，并包含：真实剪辑点、稳定 `speakerId`、关联提示词片段、素材 SRT cue、确认台词/情绪引用和 FFprobe 真实媒体时长。程序只做字段、边界、引用和时间连续性校验，不再另做一次语义合并。

FFmpeg 不合并、扩张、缩短或重新猜测剪辑点。它只在执行前校验 Gemini 区间、说话窗口和输出时间连续性；无效或不确定结果不自动剪辑。

`editing-timeline.json` 初次由 Gemini 直接生成。用户在“配音字幕”工作台调整某条时间轴时，程序保留原 Gemini 区间并新增人工采用值：

```ts
interface ConfirmedEditPoint extends MaterialEditPoint {
  adoptedStartMs: number
  adoptedEndMs: number
  adoptedBy: 'gemini' | 'user'
  revision: number
}
```

人工区间必须位于同一原始视频内且 `start < end`。调整只改变最终采用点，不回写 Whisper 原始证据或 Gemini 原始输出；滑块变化即自动持久化。最终 FFmpeg 只读取 `adoptedStartMs/adoptedEndMs`，不要求额外“保存”或“确认最终时间轴”。

## 10. 人声分离、混音与字幕

### 10.1 宣传片

- 视频提示词禁止人声；默认不跑 Spleeter。
- 画面母版保留确认可用的环境声和动作音，与 `narration.wav` 混合。
- 如果素材意外出现人声，用户可对该素材启用分离；这不是宣传片默认步骤。
- 字幕时间取自 `narration-timeline.json`，文字取自确认文稿。

### 10.2 剧情片

- `editing-timeline.json` 就绪后开放“生成中文配音”；用户点击后，IndexTTS2 按每句采用时间窗生成中文克隆配音，成功行即可试听。
- 替换配音时，先用 Spleeter 输出 `vocal.wav` 和 `instrument.wav`。
- 丢弃 `vocal.wav`，保留 `instrument.wav`。
- 将对应 `dialogueId.wav` 放入 `editing-timeline.json` 确认的演员说话窗口。
- 小幅时长差可以在可听质量范围内调整；超出能力时优先用 IndexTTS2 目标时长重生该句，仍不匹配则标记检查，不静默截断台词。
- 最终混合对白、`instrument.wav`、必要环境声和动作音。
- 字幕时间取自剧情对白时间轴，文字取自确认剧本。

### 10.3 节拍字幕

- 快节奏优先短句、少字、快速切换；慢节奏允许更完整的句子和更长停留。
- 字幕拆分只改变显示 cue，不改旁白或对白音频，也不改正式文字顺序。
- 中文字幕文字必须来自确认剧本，素材 SRT 和最终采用区间只提供时间；英文字幕由确认后的中文字幕逐句翻译生成。
- 中文字幕允许在“配音字幕”工作台双击编辑；英文字幕只读。中文有任何修改时，对应中文配音失效，英文状态立即变为“待重新翻译”；只禁止英语配音和英文输出，不阻止中文输出。
- 再次点击“翻译所有字幕”只重建新增或已过期的英文字幕，不重跑 Whisper、Gemini、视频或中文时间轴；翻译使用用户当前选择的 `textModel`。
- 字幕在“配音字幕”节点完成校对，在“生成最终成片”时烧录；不新增独立字幕页面。

## 11. Wiki 与执行产物

```text
wiki/项目/项目总监.md
wiki/项目/制作路线.md
wiki/文稿/确认文稿.md
wiki/声音/角色/<speakerId>.md
wiki/声音/episode-001/旁白方案.md
wiki/声音/episode-001/narration-timeline.json
wiki/声音/episode-001/对白资产.json
wiki/声音/episode-001/音频处理.json
wiki/转录/episode-001/<mediaId>-whisper.json
wiki/分镜/导演总览.md
wiki/分镜/镜头-*.md
wiki/剪辑/episode-001/editing-timeline.json
wiki/字幕/素材/<mediaId>-whisper.srt
wiki/字幕/episode-001-zh.srt
wiki/字幕/episode-001-en.srt
wiki/成片/episode-001.md
wiki/制作/episode-001.md
```

只生成与当前路线有关的文件。宣传片不创建空的剧情对白资产；剧情片没有公共旁白时不创建旁白方案。`wiki/制作/episode-001.md` 是本集双链索引，必须链接项目总监、确认文稿、声音绑定、分镜、素材 SRT、剪辑时间轴、配音、音频处理、字幕和成片；各产物也反链该索引。运行中状态可以写入对应 JSON，不为每个按钮再造一份 Markdown。

## 12. UI 最小适配

不改变三栏布局。顶部节点中的“配音”改为“配音字幕”，不是再增加一个与它重复的字幕节点：

```text
文稿 -> 资产 -> 分镜 -> 分镜图 -> 视频 -> 配音字幕 -> 成片
```

### 12.1 生成设置

在现有配音引擎区域增加 IndexTTS2 选择和“启动服务”按钮；Qwen3-TTS 与 IndexTTS2 使用同一套紧凑状态行，不新建设置页面。

### 12.2 项目总监

项目总监页增加一行：

```text
制作路线：旁白宣传片 / 剧情片
判断理由：...
```

路线使用两段式控件 `旁白宣传片 | 剧情片`。AI 初判后用户可以直接切换；切换只产生项目总监待确认稿，不立即删除数据。用户确认新路线后才按失效表清理旧路线专属声音、分镜和下游媒体，同时保留确认文稿和可复用资产文件。

### 12.3 文稿/配音

- 宣传片：显示声音来源、旁白音色、生成正式旁白、试听、重新生成和时间轴状态。
- 剧情片：这里只显示“角色声音在资产阶段准备”，不生成一条朗读整集剧本的旁白。

### 12.4 资产

- 宣传片：角色、场景、道具照常；旁白音色可在文稿/配音或旁白声音行绑定。
- 剧情片：有台词角色只显示“音色已绑定”；右栏仍只显示音色包、打开文件夹和更换，不加入八情绪播放器，不显示不存在的逐句待处理状态。逐句配音完成数只在 `editing-timeline.json` 就绪后的“配音字幕”工作台显示。

### 12.5 分镜与媒体

- 宣传片每镜显示关联旁白 cue、绝对时间和节奏；视频提示词显示画面、环境声和音效，不包含模型旁白。
- 剧情片每镜显示 `speakerId`、确认台词、情绪、情绪强度、语速、停顿/重音和角色声音绑定状态。任何对话镜头缺少情绪时，“生成视频”按钮禁用并定位到该镜。
- “音频”筛选展示真实存在的 `narration.wav` 或逐句对白 WAV，不再长期为空。

### 12.6 配音字幕工作台

视频素材就绪后即可点击顶部“配音字幕”进入正式工作台，不必等待 `editing-timeline.json`。右栏先依次完成素材分析；Gemini 成功后再填充六列校准表格。不使用独立 PySide 弹窗，也不复制参考项目的深色主题。沿用本 APP 三栏视觉，内部布局参考 `onlyone_set_role.py` 的成熟交互：

```text
中栏左侧：原始视频播放器
中栏右侧：逐句校准表格
右栏：全部执行命令和当前行精细控制
```

逐句表格固定为六列，不再把声音包和情绪各占一列：

```text
时间轴 | 视频片段预览 | 角色 | 配音试听 | 中文字幕 | 英文字幕
```

交互合同：

- 左侧播放器始终加载尚未物理裁切的原始素材。点击“视频片段预览”只跳到该行 `adoptedStartMs` 并在 `adoptedEndMs` 自动停止，不提前生成裁切文件。
- “时间轴”显示当前采用起止点。选中行后，右栏显示双端区间滑块；向左或向右拖动即可逐帧微调起止点，松手后自动持久化并立即按新区间预览，不提供设入点、设出点、保存或确认按钮。
- 用户调整时间轴时，`adoptedBy` 改为 `user`；只失效该句配音、音频处理和成片，不重跑付费视频。
- “角色”显示项目角色名，内部保存稳定 `speakerId`；声音包和分镜情绪作为该角色/该行的次级信息显示在单元格副标题和右栏，不额外挤占表格列。
- “配音试听”播放按当前时间窗生成的克隆配音，不播放原视频人声；原声由“视频片段预览”负责。
- 中文字幕初始必须与确认剧本逐字一致，并保留对应 `dialogueId`。允许直接编辑，输入即自动持久化；不提供“保存中文字幕”按钮。
- 英文字幕初始为空。只有用户点击右栏“翻译所有字幕”后才生成；不是进入工作台时自动翻译。
- 英文字幕生成后只读。中文字幕再次修改时，只清空/标记对应英文行过期；重新点击翻译后才能生成或确认英语配音。
- 表格顶部只显示状态汇总和筛选，不放执行按钮。校验错误定位对应行，不关闭工作台。

#### 12.6.1 右栏动作

所有会改变项目产物的命令统一放在右栏。为开发测试保留显式步骤，但按依赖顺序启用，不能同时出现多个绿色主按钮：

```text
素材分析
  生成 SRT
  生成剪辑时间轴

剪辑点
  重选剪辑点（当前行双端滑块）

中文
  生成中文配音

英文（可选）
  翻译所有字幕
  生成英语配音

原声处理
  分离原人声和背景声
  去除原人声
  混回背景声、环境声和动作音

输出
  输出语言：中文 | 英文
  烧录配音和字幕
```

按钮规则：

- `生成 SRT` 对每条原始素材运行 Faster-Whisper，生成包含实际识别文字和精确发声时间的 SRT；已成功且素材未变化的条目跳过。
- `生成剪辑时间轴` 在素材 SRT 就绪后调用 Gemini，读取原视频、确认剧本、完整分镜视频提示词和 SRT；通过台词直接确定 `speakerId`，通过画面确定动作与剪辑点，直接生成 `editing-timeline.json`。
- `重选剪辑点` 是当前行的双端滑块，不是提交按钮；未选中行时禁用。时间改变后自动持久化，受影响的中文/英文配音变为待重新生成。
- `生成中文配音` 生成所有缺失、失败或时间窗已变化的中文句子；已有且输入未变化的句子跳过。`editing-timeline.json` 就绪后只开放按钮，不自动触发。
- `翻译所有字幕` 是英文字幕唯一创建入口，调用用户当前选择的 `textModel`。未点击时英文列保持空白，不显示伪占位翻译。
- `生成英语配音` 只在英文字幕全部就绪且对应角色存在可用英语音色包时启用；失败只标记对应句。
- `分离原人声和背景声` 调用 Sherpa-ONNX + Spleeter 分离链路并保留两条可追溯 stem；完成前不能执行去人声或混回。
- `去除原人声` 只改变最终混音采用关系，不删除 `vocal.wav`。
- `混回背景声、环境声和动作音` 生成最终采用音轨，不另设“试听最终混音”按钮；行内视频预览和配音试听已经覆盖校对需要。
- `烧录配音和字幕` 就是“生成成片”，也是唯一最终动作。它读取当前滑块区间和当前显示字幕，裁切原始视频并烧录所选语言的配音与字幕；不另设保存、确认或导出按钮。
- 右栏每组显示 `待执行 / 运行中 / 已完成 / 失败`。当前可执行动作使用主色，其余动作使用普通或禁用状态。

#### 12.6.2 按钮、后端与 Wiki 对照

| 实际动作 | 后端能力 | 输入 | 输出与 Wiki 记录 |
|---|---|---|---|
| 生成 SRT | Faster-Whisper Large V3 Turbo | 单条原始视频 | `<mediaId>-whisper.json`、`<mediaId>-whisper.srt` |
| 生成剪辑时间轴 | `gemini-3.6-flash` | 原视频、确认剧本、完整分镜提示词、素材 SRT | `wiki/剪辑/episode-001/editing-timeline.json` |
| 重选剪辑点 | 原生双端区间滑块，无模型 | 当前行原视频时长与采用区间 | 自动更新 `editing-timeline.json` 的采用值 |
| 生成中文配音 | IndexTTS2 | 当前中文字幕、`speakerId`、情绪音色与采用时间窗 | 中文逐句 WAV、`wiki/声音/episode-001/对白资产.json` |
| 翻译所有字幕 | 用户当前选择的 `textModel` | 当前中文字幕 | `wiki/字幕/episode-001-en.srt` |
| 生成英语配音 | IndexTTS2 | 英文字幕、`speakerId`、英语音色与采用时间窗 | 英文逐句 WAV、更新对白资产索引 |
| 分离原人声和背景声 | Sherpa-ONNX + Spleeter ONNX | 当前采用素材音轨 | `vocal.wav`、`instrument.wav`、`wiki/声音/episode-001/音频处理.json` |
| 去除原人声 | 确定性音轨采用规则 | 两条 stem | 更新 `音频处理.json`，原文件不删除 |
| 混回背景声、环境声和动作音 | FFmpeg | 配音、`instrument.wav`、环境声与动作音 | 最终采用音轨、更新 `音频处理.json` |
| 烧录配音和字幕 | FFmpeg | 当前采用剪辑点、当前字幕、最终采用音轨 | 成片文件、`wiki/成片/episode-001.md` |

宣传片的旁白时间轴在正式旁白生成后自动运行 Faster-Whisper，不增加按钮；结果写入 `narration-timeline.json` 和旁白 SRT。每次动作成功后同步更新 `wiki/制作/episode-001.md` 的状态和双链。

工作台主状态按路线显示：

```text
剧情片：待生成 SRT -> 待生成剪辑时间轴 -> 待中文配音 -> 待字幕/可选英语 -> 待音频处理 -> 可烧录 -> 已完成
宣传片：待生成 SRT -> 待生成剪辑时间轴 -> 待字幕/可选英语 -> 可烧录 -> 已完成
```

“配音字幕”节点只有在以下条件全部满足时显示对号：

1. 所有采用视频都有 Whisper 素材 SRT，无人声素材允许为空；
2. 所有采用内容都有 Gemini 真实剪辑点；
3. 所有需要替换的对白都有角色绑定、分镜情绪和可播放中文配音；
4. 中文字幕合法；
5. 选择英文输出时，英文字幕和英语配音都与当前中文字幕版本一致；选择中文输出时不要求生成英文；
6. 用户选择替换原人声时，人声分离、去除和混回已经完成；不替换时不要求这些步骤。

### 12.7 成片

- 宣传片显示旁白时间轴、画面母版、中文字幕、按需英文字幕和最终成片。
- 剧情片显示 Whisper SRT、Gemini 原点与当前采用点、人声分离、逐句替换、中文字幕、按需英文字幕和最终成片状态。
- 失败只重试对应转录、分离或单句配音，不重做已成功的付费图片和视频。

## 13. 状态与失效规则

| 修改内容 | 必须失效 | 必须保留 |
|---|---|---|
| 确认文稿 | 项目总监及全部下游 | 原始输入、历史媒体文件 |
| 项目总监路线 | 路线专属声音、分镜、视频、剪辑、成片 | 确认文稿、仍被白名单采用的资产 |
| 宣传片正式旁白 | Whisper 时间轴、宣传片分镜及全部下游 | 项目总监、视觉资产 |
| 剧情角色音色 | 该角色逐句对白、混音、字幕和成片 | 视觉资产、分镜图、视频 |
| 单句对白文本/情绪 | 对应对白 WAV、该句混音和成片 | 其他对白和视觉媒体 |
| 视频版本 | 对应 Whisper SRT、`editing-timeline.json`、逐句配音、混音和成片 | 角色声音绑定、其他镜头 |
| 人工修改采用时间轴 | 对应句中英文配音、音频处理和成片 | 素材 SRT、Gemini 原始剪辑点、其他行 |
| 中文字幕文字 | 对应中英文配音、英文字幕和成片 | 视频、Gemini 剪辑点、其他字幕行 |
| 字幕时间轴 | 对应句配音和成片 | Gemini 剪辑点、其他字幕行 |
| 字幕样式 | 最终成片 | 所有声音、视频和时间轴 |

页面切换、项目切换和 APP 重启不触发失效。英文字幕和英语配音仅在选择英文输出时参与完成门禁；中文输出不因英文为空或过期而失效。

## 14. 用户操作流程

### 14.1 旁白宣传片

1. 输入并确认文稿。
2. 进入项目总监，接受 AI 判断或修改为“旁白宣传片”后确认。
3. 选择设计声音或克隆音色包，生成并试听正式旁白。
4. APP 自动运行 Faster-Whisper，显示旁白时间轴已就绪。
5. 准备视觉资产，转宣传片分镜。
6. 生成分镜图和视频，预览或重试不满意素材。
7. APP 对每条素材先运行 Whisper/SRT，再由 Gemini 读取原视频、提示词和 SRT 生成真实剪辑点。
8. APP 合并生成 `editing-timeline.json`；进入“配音字幕”，逐句预览并按需修改最终采用时间轴，校对中文字幕，英文按需翻译。
9. 点击“烧录配音和字幕”，APP 按当前采用剪辑点裁切画面，混入旁白并输出成片。

### 14.2 剧情片

1. 输入并确认剧本。
2. 进入项目总监，接受 AI 判断或修改为“剧情片”后确认。
3. 准备角色、场景、道具，为有台词角色绑定音色包。
4. 生成导演分镜、分镜图和带原声表演的视频。
5. 进入“配音字幕”，点击“生成 SRT”，得到包含精确人声时间和识别文字的素材 SRT。
6. 点击“生成剪辑时间轴”；Gemini 读取原视频、确认剧本、完整分镜视频提示词和素材 SRT，通过台词确定 `speakerId`，通过画面确定无对白戏剧动作，直接输出 `editing-timeline.json`。
7. 点击“生成中文配音”，IndexTTS2 按每句当前采用时间窗生成中文克隆配音。
8. 逐句预览未裁切原视频的采用区间并试听新配音；确认或修改时间轴、角色、中文字幕，英文字幕和英语配音按需生成。
9. APP 按用户选择运行 Spleeter、去除原人声并混回背景声、环境声和动作音。
10. 点击“烧录配音和字幕”，FFmpeg 按当前采用时间轴裁切并输出成片。

## 15. 实施顺序

1. 修改项目总监 Skill、解析器和 Wiki，增加可由用户修改的 `productionRoute`、待确认稿和确认门禁。
2. 扩展生成设置：加入 IndexTTS2、检测、启动和停止服务。
3. 接入 Faster-Whisper 本地调用，先完成单旁白 WAV -> JSON/SRT 探针。
4. 实现宣传片前置旁白、真实时长和宣传片导演路线。
5. 实现稳定角色音色绑定；资产页只显示真实绑定状态。
6. 实现右栏“生成 SRT”：每条视频调用 Faster-Whisper，落盘人声精确时间和实际识别文字。
7. 实现右栏“生成剪辑时间轴”：Gemini 读取原视频、确认剧本、完整提示词和素材 SRT，直接输出并校验 `editing-timeline.json`。
8. 将顶部“配音”升级为“配音字幕”工作台，实现六列表格、原视频区间预览、自动保存的双端滑块、配音试听和按需英文流程。
9. 实现显式“生成中文配音”和“生成英语配音”，由 IndexTTS2 只处理缺失或失效句。
10. 接入 Sherpa-ONNX + Spleeter 人声/背景声分离和剧情对白替换。
11. 修改 FFmpeg 合同：只消费 `adoptedStartMs/adoptedEndMs` 当前值，完成最终裁切、混音和字幕烧录，不根据 `playDuration` 或本地规则推测区间。
12. 实现按钮产物的 Wiki 落盘和整集双链索引；完成两个新项目的端到端验收后再打包 APP。

## 16. 验收标准

1. 项目总监能稳定区分旁白宣传片和剧情片，并给出可见理由。
2. 用户可以把 AI 初判修改为另一条路线并确认；确认路线前不能绕过项目总监直接进入声音或资产生产。
3. 设置页可选择 IndexTTS2，并可检测、启动、停止和显示真实服务状态。
4. 宣传片使用设计声音和克隆音色包两种方式都能生成正式旁白。
5. 宣传片旁白生成后，Faster-Whisper 输出合法 JSON/SRT，正式文字与确认文稿一致。
6. 宣传片分镜总时长等于正式旁白时长，每镜均回链旁白 cue。
7. 宣传片视频提示词明确禁止人声，最终没有重复旁白。
8. 剧情片资产阶段只显示有台词角色的真实音色绑定，不预创建逐句记录或虚假待处理状态。
9. `editing-timeline.json` 就绪后 IndexTTS2 才生成逐句中文配音；单句失败或时间窗变化只重试受影响句，其他成功对白不丢失。
10. “生成 SRT”按钮为每条采用视频输出包含实际识别文字和精确人声时间的 SRT；不使用分镜台词替换识别结果。
11. Gemini 请求只有在素材 SRT 就绪后才能提交，并同时包含原视频、确认剧本、完整分镜视频提示词和这份 SRT。
12. Gemini 能通过 SRT 台词与确认剧本直接确定 `speakerId`，通过画面识别无对白戏剧动作，并输出回链 `promptSegmentId` 的 `editing-timeline.json`；无法可靠确定剪辑点时停止自动裁切。
13. Sherpa-ONNX + Spleeter 生成可用的人声与背景声文件，最终丢弃原人声并保留环境声。
14. FFmpeg 的每个裁切区间都能追溯到 Gemini 原始剪辑点或用户人工修订点；代码不存在截前 N 秒或自行推算区间的旁路。
16. 所有对话分镜视频提示词都包含说话者、确认台词和情绪；缺少情绪时不能提交视频。
17. 字幕文字来自确认文稿/剧本，时间来自当前采用时间轴；Whisper 和 Gemini 只提供对齐证据，不改写文字。
18. 顶部显示“配音字幕”节点；点击后中栏左侧是原视频播放器，右侧表格严格为“时间轴、视频片段预览、角色、配音试听、中文字幕、英文字幕”六列。
19. 每行只预览未物理裁切原视频的采用区间；右栏双端滑块能逐条微调并自动持久化，不出现设入点、设出点、保存或确认按钮。
20. 中文字幕初始与确认剧本逐字一致且可编辑；英文字幕初始为空，只有点击“翻译所有字幕”后生成并保持只读。中文输出不要求英文，英文输出必须重译过期行并生成英语配音。
21. 右栏集中提供剪辑点校准、中文配音、按需英文、原声分离/去除/混回及最终烧录动作，并按依赖顺序启用；表格内不重复放执行按钮。
22. 宣传片快慢节奏能改变字幕显示密度，但不改正式文字和声音。
23. 修改旁白、单句对白、视频、人工时间轴或字幕样式只失效必要下游。
24. APP 重启后项目路线、声音绑定、逐句音频、Gemini 原点、人工采用点、字幕修改和成片状态完整恢复。
25. 取消转录、配音或分离任务后项目仍可操作，已完成资产继续保留。

## 17. 明确不做

- 不维护旧的“所有项目统一后置配音”流程。
- 不让 Whisper 改写确认文稿或剧本。
- 不让 Whisper 负责人声/背景声分离。
- 不让 Spleeter 负责说话人识别。
- 不复制 `peiyin-pyvideotrans` 的 GUI、翻译、任务队列和缓存系统。
- 不把宣传片强制切成固定 5 秒镜头或固定 5 秒字幕。
- 不为宣传片和剧情片分别复制一套完整资产系统。
- 不新增独立字幕页面或第八个顶部阶段；把现有“配音”节点升级为“配音字幕”。
- 不在角色卡内增加八情绪播放器。
- 不以角色显示名称替代稳定 `entityId/speakerId`。
- 不分析拼接后的整集长视频；原始分镜视频仍逐条处理。
- 不修改 `/Users/by3/Documents/peiyin-pyvideotrans` 现有代码和环境。

## 18. 当前审计记录

- 2026-08-03 代码审计：当前实现只有“先完成分镜视频和 Gemini 分析，再生成正式配音”的单一路线，不符合本版双路线合同。
- 2026-08-03 代码审计：当前 `requiredSpeakerIds` 来源于已生成分镜；本版不再提前创建逐句记录，只要求资产阶段完成角色声音绑定。
- 2026-08-03 代码审计：当前字幕时间来自导演/Gemini 时间轴，没有 Faster-Whisper 运行时和稳定转录 JSON。
- 2026-08-03 代码审计：当前“配音 + 环境声”只是混入原音，没有真正的人声分离；含角色对白时会被运行时阻止。
- 2026-08-03 纠正：每条素材必须先由 Faster-Whisper 生成时间戳和素材 SRT，Gemini 后读原视频、完整分镜视频提示词及 SRT并给出初始真实剪辑点；FFmpeg 只执行保留来源的 Gemini 原点或用户人工修订点。
- 2026-08-03 UI 参考审计：`onlyone_set_role.py` 已验证逐句视频播放、Speaker 批量同步、声音包/情绪绑定、中文字幕编辑、英文只读等交互；本 APP 复用这些业务规则，不复制 PySide 窗口和样式，中文修改后的重译门禁只约束英文输出。
- 2026-08-03 流程纠正：剧情片资产阶段不生成对白 WAV；Gemini 直接输出 `editing-timeline.json` 后，IndexTTS2 才按真实采用时间窗生成逐句中文配音并进入工作台试听。
- 2026-08-03 流程纠正：删除预建逐句记录、Sherpa 说话人聚类和“用确认台词填充 Whisper 时间窗”步骤。正式素材分析固定为“生成 SRT -> Gemini 直接生成 editing-timeline.json”。
- 2026-08-03 UI 纠正：配音字幕工作台使用左侧原视频播放器、右侧六列表格和最右命令栏；视频只按采用区间预览，最终烧录前不物理裁切。英文字幕和英语配音均为用户主动生成，不参与中文输出门禁。
- 已确认 Faster-Whisper Large V3 Turbo 模型和 Python 环境可复用，模型约 1.5GB。
- 已确认 Sherpa-ONNX 1.13.4 可作为本地分离推理依赖；不接入其说话人模型。
- 已确认 Spleeter `vocals.fp16.onnx` 和 `accompaniment.fp16.onnx` 及 `vocal_bgm_spleeter()` 入口均已存在。
- 已验证 IndexTTS2 多情绪角色包、稳定 `voiceProfileId` 和逐句批量生成基础代码；服务启动 UI 与完整权重探针仍待执行。
- `rh-grok-image-video` 已真实验证九宫格分镜板、多角色参考一致性和片内切镜；官方 `6-30` 秒合同保留，未逐档测试的时长不写成已验证。
- Veo 的视频能力合同保持有效；本版只重排项目总监、声音和时间轴编排。
