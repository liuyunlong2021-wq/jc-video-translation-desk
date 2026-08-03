# 项目总监双路线、导演分镜与配音成片编排 SDD

> 日期：2026-08-03
> 状态：方案已重新对齐，待执行
> 目标版本：2.9
> 适用范围：项目总监分流、Qwen3-TTS、IndexTTS2、Faster-Whisper、Sherpa-ONNX、Spleeter、导演分镜、剪辑、混音与字幕
> 上位文档：`docs/项目总监与全流程Wiki联动SDD.md`、`docs/音色库整理与角色声音Wiki索引SDD.md`
> 相关 Skill：`skills/jc-film-style/SKILL.md`、`skills/jc-script-storyboard/SKILL.md`、`skills/jc-voice-design/SKILL.md`
> 替代关系：本版完整替代 2026-08-02 的“统一后置配音、禁用 Whisper”方案；旧结论不再参与实现。

## 1. 一句话目标

文稿确认后先由项目总监判断本项目走“旁白宣传片”还是“剧情片”。旁白宣传片先生成正式旁白并用 Faster-Whisper 得到时间轴，再让导演按旁白时间和节奏设计画面；剧情片在资产阶段绑定角色音色并预生成逐句对白资产，视频完成后用 Faster-Whisper、Sherpa 说话人证据、Gemini 画面证据和 Spleeter 人声分离完成对白替换、混音、字幕与成片。

## 2. 已确认决策

1. 项目总监必须在声音生成、资产和分镜之前完成，并负责判定项目制作路线。
2. 制作路线只允许 `narration-promo` 和 `drama`；用户可以查看项目总监理由并确认，不在后续环节重新猜测。
3. `narration-promo` 以正式旁白及其时间戳为第一时间轴；分镜、画面和字幕都服从它。
4. `drama` 以确认剧本、角色身份和导演分镜为第一依据；预生成对白是角色声音资产，不反向决定镜头是否存在。
5. 旁白宣传片和剧情片都允许用户选择“设计声音”或“克隆音色包”。
6. 设计声音继续使用现有 Qwen3-TTS VoiceDesign 或云端声音设计能力；克隆声音统一使用 IndexTTS2 多情绪包。
7. 配音设置增加 IndexTTS2，并提供检测、启动服务和停止服务；不再只显示 Qwen3-TTS。
8. Faster-Whisper 只负责“什么时间说了什么”；Sherpa 说话人模型负责“谁在说”；Spleeter 负责“人声与背景声分离”。三者职责不得混用。
9. 宣传片默认要求视频模型不生成人声，因此成片默认不跑人声分离，直接混入正式旁白和素材环境/动作音。
10. 剧情片替换模型原声时才运行 Spleeter，移除原人声并保留伴奏、环境声和动作音。
11. Gemini 继续逐条读取原始视频，但只负责目标动作、画面区间和视觉连续性；不再充当对白时间戳的唯一证据。
12. 不再固定截取每段视频前 N 秒。FFmpeg 只执行经过校验的统一时间轴。
13. 字幕文本始终来自确认文稿或剧本；Whisper 只提供时间证据，不允许用识别误差改写正式文字。
14. 不强制在旁白生成后立刻按 5 秒切节拍。先保存 Whisper 的自然句段，导演再结合镜头节奏决定拆分或合并。
15. 顶部仍保持七个生产节点，不新增“字幕”节点；项目总监继续作为文稿与资产之间的现有中栏页面。
16. 产品尚未发布，只实现新流程，不维护旧流程兼容分支。

## 3. 项目总监前置分流

### 3.1 顺序

```text
输入文稿/剧本
  -> 确认文稿
  -> 项目总监分析并生成 Wiki
  -> 用户确认项目总监方案与 productionRoute
  -> 执行对应声音与制作路线
```

文稿页在确认后只显示“进入项目总监”，不提前生成声音。项目总监确认后，APP 才根据路线展示对应的声音动作和后续门禁。

### 3.2 判定合同

项目总监输出增加：

```ts
type ProductionRoute = 'narration-promo' | 'drama'

interface ProductionRouteDecision {
  productionRoute: ProductionRoute
  rationale: string
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
  -> Gemini 逐条分析目标画面，不改变旁白绝对时间轴
  -> FFmpeg 裁切并拼接画面母版
  -> 混入正式旁白、环境声和动作音
  -> 按旁白时间轴烧录节拍字幕
  -> 输出成片
```

正式旁白生成后才允许“转分镜”。后续重新选择声音、修改旁白文本或重新生成正式旁白，必须失效宣传片分镜及其全部下游；只修改声音音量或字幕样式不失效画面。

### 4.2 剧情片路线

```text
项目总监确认 drama
  -> 生成角色、场景、道具资产
  -> 从确认剧本提取全部角色台词并绑定稳定 speakerId
  -> 用户为有台词角色选择设计声音或克隆音色包
  -> IndexTTS2 为每句台词生成独立对白资产
  -> 导演分镜
  -> Veo 或 Grok 生成分镜图和带原声表演的视频
  -> Gemini 逐条分析目标动作与画面区间
  -> Faster-Whisper 转写每条原始视频并输出精确时间戳
  -> Sherpa 说话人模型输出 spk0/spk1/spk2
  -> 结合分镜 speakerId、台词顺序和说话人证据完成映射
  -> 合并为 editing-timeline.json
  -> Spleeter 分离原人声和背景声
  -> 去除原人声，把对应逐句对白资产放入说话窗口
  -> 混回背景声、环境声和动作音
  -> 按同一对白时间轴烧录字幕
  -> 输出成片
```

逐句对白在资产阶段生成，但不在此时拼成整集音轨。最终时间位置以生成视频的 Whisper 时间窗为准。

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
| 设计声音 | `jc-voice-design` + Qwen3-TTS/云端生成正式旁白 | 先设计角色音色，再固化为角色音色包；正式逐句对白仍由 IndexTTS2 克隆 |
| 克隆音色包 | 绑定 `narrator-*` 音色包，IndexTTS2 生成正式旁白 | 绑定每个角色音色包，IndexTTS2 生成逐句对白 |

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

项目总监确认剧情片后，从确认剧本提取：

```ts
interface DialogueAsset {
  dialogueId: string
  speakerId: string
  text: string
  emotion: string
  sourceScene: string
  audioPath?: string
  actualDurationMs?: number
  status: 'pending' | 'running' | 'success' | 'failed'
}
```

落盘：

```text
wiki/声音/episode-001/对白资产.json
media/voice/dialogue/<dialogueId>.wav
```

剧情片角色声音是资产页的一部分：角色卡只显示“音色已绑定”和“对白 X/X 条就绪”；详细逐句任务放在音频列表，不把卡片塞满。

### 6.3 旁白资产

宣传片落盘：

```text
wiki/声音/episode-001/旁白方案.md
media/voice/narration.wav
wiki/声音/episode-001/narration-timeline.json
wiki/字幕/episode-001-narration.srt
```

`narration.wav` 是宣传片的权威时长。目标时长只能作为生成前预算；正式旁白时长生成后，项目时间轴改用真实时长。

## 7. Faster-Whisper、Sherpa 与 Spleeter

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

Sherpa 说话人模型：

```text
/Users/by3/Documents/peiyin-pyvideotrans/models/onnx/seg_model.onnx
/Users/by3/Documents/peiyin-pyvideotrans/models/onnx/3dspeaker_speech_eres2net_large_sv_zh-cn_3dspeaker_16k.onnx
/Users/by3/Documents/peiyin-pyvideotrans/models/onnx/nemo_en_titanet_small.onnx
入口：/Users/by3/Documents/peiyin-pyvideotrans/videotrans/process/_audio_speakers.py
版本：sherpa-onnx 1.13.4
```

Spleeter 分离模型：

```text
/Users/by3/Documents/peiyin-pyvideotrans/models/onnx/vocals.fp16.onnx
/Users/by3/Documents/peiyin-pyvideotrans/models/onnx/accompaniment.fp16.onnx
入口：/Users/by3/Documents/peiyin-pyvideotrans/videotrans/process/_audio_separate.py
函数：vocal_bgm_spleeter(input_file, vocal_file, instr_file)
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
Whisper -> startMs/endMs/text
Sherpa -> speakerLabel(spk0/spk1...)
导演分镜 -> 预期 speakerId、确认台词、镜头顺序
```

程序按镜头范围、文本相似度和预期角色完成唯一映射。无法唯一映射时标记 `needsReview`，不把错误角色声音自动贴上去。

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

保持一镜一图、一镜一视频和 `4/6/8` 秒生成合同。画面内对白提示词逐字包含角色、台词、情绪和口型要求；无对白镜头只生成动作与环境声。

### 8.3 剧情片 Grok 路线

保持现有组合分镜板、多参考图和 `6-30` 秒内部切镜合同：一个组合最多九个节拍、最多七张参考图，第一张为组合分镜板，其余为当前采用的场景、角色和道具资产图。

## 9. 剪辑时间轴

### 9.1 Gemini 视觉证据

每条生成视频立即独立提交 Gemini，输出目标动作的最小完整区间和是否需要检查。Gemini 不输出正式字幕文本，不覆盖 Whisper 时间戳。

### 9.2 宣传片时间轴

宣传片以 `narration-timeline.json` 为绝对轴。Gemini 建议只用于在每条素材内部选择最合适画面，再由程序将采用画面放入对应旁白窗口。画面不足时允许减速、定格尾帧或要求重生素材；不得裁掉旁白。

### 9.3 剧情片时间轴

剧情片 `editing-timeline.json` 合并：

- Gemini 目标动作区间；
- Whisper 对白时间；
- Sherpa 说话人标签；
- 导演分镜 `speakerId` 和确认台词；
- FFprobe 真实媒体时长。

FFmpeg 执行前必须校验所有裁切区间、说话窗口和输出时间连续性。无效或不确定结果保留完整视频并要求检查。

## 10. 人声分离、混音与字幕

### 10.1 宣传片

- 视频提示词禁止人声；默认不跑 Spleeter。
- 画面母版保留确认可用的环境声和动作音，与 `narration.wav` 混合。
- 如果素材意外出现人声，用户可对该素材启用分离；这不是宣传片默认步骤。
- 字幕时间取自 `narration-timeline.json`，文字取自确认文稿。

### 10.2 剧情片

- 替换配音时，先用 Spleeter 输出 `vocal.wav` 和 `instrument.wav`。
- 丢弃 `vocal.wav`，保留 `instrument.wav`。
- 将对应 `dialogueId.wav` 放入 Whisper 识别到的说话窗口。
- 小幅时长差可以在可听质量范围内调整；超出能力时优先用 IndexTTS2 目标时长重生该句，仍不匹配则标记检查，不静默截断台词。
- 最终混合对白、`instrument.wav`、必要环境声和动作音。
- 字幕时间取自剧情对白时间轴，文字取自确认剧本。

### 10.3 节拍字幕

- 快节奏优先短句、少字、快速切换；慢节奏允许更完整的句子和更长停留。
- 字幕拆分只改变显示 cue，不改旁白或对白音频，也不改正式文字顺序。
- 字幕随“生成最终成片”自动生成和烧录，不增加第八个顶部阶段。

## 11. Wiki 与执行产物

```text
wiki/项目/项目总监.md
wiki/项目/制作路线.md
wiki/文稿/确认文稿.md
wiki/声音/角色/<speakerId>.md
wiki/声音/episode-001/旁白方案.md
wiki/声音/episode-001/narration-timeline.json
wiki/声音/episode-001/对白资产.json
wiki/分镜/导演总览.md
wiki/分镜/镜头-*.md
wiki/剪辑/episode-001/editing-timeline.json
wiki/字幕/episode-001.srt
```

只生成与当前路线有关的文件。宣传片不创建空的剧情对白资产；剧情片没有公共旁白时不创建旁白方案。

## 12. UI 最小适配

不改变三栏布局和现有标签。

### 12.1 生成设置

在现有配音引擎区域增加 IndexTTS2 选择和“启动服务”按钮；Qwen3-TTS 与 IndexTTS2 使用同一套紧凑状态行，不新建设置页面。

### 12.2 项目总监

项目总监页增加一行：

```text
制作路线：旁白宣传片 / 剧情片
判断理由：...
```

用户确认后才开放后续动作。重新生成或修改路线会失效路线专属声音、分镜和下游媒体，但保留确认文稿和可复用资产文件。

### 12.3 文稿/配音

- 宣传片：显示声音来源、旁白音色、生成正式旁白、试听、重新生成和时间轴状态。
- 剧情片：这里只显示“角色声音在资产阶段准备”，不生成一条朗读整集剧本的旁白。

### 12.4 资产

- 宣传片：角色、场景、道具照常；旁白音色可在文稿/配音或旁白声音行绑定。
- 剧情片：有台词角色显示音色绑定和“对白 X/X 条就绪”；右栏仍只显示音色包、打开文件夹和更换，不加入八情绪播放器。

### 12.5 分镜与媒体

- 宣传片每镜显示关联旁白 cue、绝对时间和节奏；视频提示词显示画面、环境声和音效，不包含模型旁白。
- 剧情片每镜显示 `speakerId`、确认台词、情绪和对白资产状态。
- “音频”筛选展示真实存在的 `narration.wav` 或逐句对白 WAV，不再长期为空。

### 12.6 成片

- 宣传片显示旁白时间轴、画面母版、节拍字幕和最终混音。
- 剧情片显示 Whisper/Sherpa 对齐、人声分离、逐句替换、字幕和最终成片状态。
- 失败只重试对应转录、分离或单句配音，不重做已成功的付费图片和视频。

## 13. 状态与失效规则

| 修改内容 | 必须失效 | 必须保留 |
|---|---|---|
| 确认文稿 | 项目总监及全部下游 | 原始输入、历史媒体文件 |
| 项目总监路线 | 路线专属声音、分镜、视频、剪辑、成片 | 确认文稿、仍被白名单采用的资产 |
| 宣传片正式旁白 | Whisper 时间轴、宣传片分镜及全部下游 | 项目总监、视觉资产 |
| 剧情角色音色 | 该角色逐句对白、混音、字幕和成片 | 视觉资产、分镜图、视频 |
| 单句对白文本/情绪 | 对应对白 WAV、该句混音和成片 | 其他对白和视觉媒体 |
| 视频版本 | 对应 Gemini/Whisper/Sherpa 证据、剪辑和成片 | 声音资产、其他镜头 |
| 字幕样式 | 最终成片 | 所有声音、视频和时间轴 |

页面切换、项目切换和 APP 重启不触发失效。

## 14. 用户操作流程

### 14.1 旁白宣传片

1. 输入并确认文稿。
2. 进入项目总监，确认“旁白宣传片”。
3. 选择设计声音或克隆音色包，生成并试听正式旁白。
4. APP 自动运行 Faster-Whisper，显示旁白时间轴已就绪。
5. 准备视觉资产，转宣传片分镜。
6. 生成分镜图和视频，预览或重试不满意素材。
7. APP 按旁白时间轴剪辑画面、混入旁白并生成节拍字幕。
8. 预览并导出成片。

### 14.2 剧情片

1. 输入并确认剧本。
2. 进入项目总监，确认“剧情片”。
3. 准备角色、场景、道具，为有台词角色绑定音色包。
4. 启动 IndexTTS2，生成全部逐句对白资产。
5. 生成导演分镜、分镜图和视频。
6. APP 自动运行 Gemini、Whisper 和 Sherpa，建立画面与对白时间轴。
7. APP 运行 Spleeter 去除原人声，放入角色对白并混回背景声。
8. 烧录字幕，预览并导出成片。

## 15. 实施顺序

1. 修改项目总监 Skill、解析器和 Wiki，增加 `productionRoute` 与确认门禁。
2. 扩展生成设置：加入 IndexTTS2、检测、启动和停止服务。
3. 接入 Faster-Whisper 本地调用，先完成单旁白 WAV -> JSON/SRT 探针。
4. 实现宣传片前置旁白、真实时长和宣传片导演路线。
5. 实现剧情片逐句对白资产与资产页状态。
6. 接入每条视频的 Whisper + Sherpa 证据并与 Gemini 视觉证据合并。
7. 接入 Spleeter 人声/背景声分离和剧情对白替换。
8. 更新字幕、成片、失败重试、取消和恢复状态。
9. 完成两个新项目的端到端验收后再打包 APP。

## 16. 验收标准

1. 项目总监能稳定区分旁白宣传片和剧情片，并给出可见理由。
2. 用户确认路线前不能绕过项目总监直接进入声音或资产生产。
3. 设置页可选择 IndexTTS2，并可检测、启动、停止和显示真实服务状态。
4. 宣传片使用设计声音和克隆音色包两种方式都能生成正式旁白。
5. 宣传片旁白生成后，Faster-Whisper 输出合法 JSON/SRT，正式文字与确认文稿一致。
6. 宣传片分镜总时长等于正式旁白时长，每镜均回链旁白 cue。
7. 宣传片视频提示词明确禁止人声，最终没有重复旁白。
8. 剧情片在资产阶段能看到所有有台词角色和逐句对白完成数。
9. IndexTTS2 单句失败只重试该句，已成功对白不丢失。
10. 每条剧情视频独立产生 Whisper 时间戳和 Sherpa 说话人证据。
11. 无法唯一映射说话人时停止自动替换，不贴错角色声音。
12. Spleeter 生成可用的人声与背景声文件，最终丢弃原人声并保留环境声。
13. Gemini 视觉裁切、Whisper 对白窗口和 FFprobe 真实时长能合并为合法时间轴。
14. 字幕文字来自确认文稿/剧本，时间来自对应路线的声音证据。
15. 宣传片快慢节奏能改变字幕显示密度，但不改正式文字和声音。
16. 修改旁白、单句对白、视频或字幕样式只失效必要下游。
17. APP 重启后项目路线、声音绑定、逐句音频、时间轴和成片状态完整恢复。
18. 取消转录、配音或分离任务后项目仍可操作，已完成资产继续保留。

## 17. 明确不做

- 不维护旧的“所有项目统一后置配音”流程。
- 不让 Whisper 改写确认文稿或剧本。
- 不让 Whisper 负责人声/背景声分离。
- 不让 Spleeter 负责说话人识别。
- 不复制 `peiyin-pyvideotrans` 的 GUI、翻译、任务队列和缓存系统。
- 不把宣传片强制切成固定 5 秒镜头或固定 5 秒字幕。
- 不为宣传片和剧情片分别复制一套完整资产系统。
- 不新增独立字幕页面或第八个顶部阶段。
- 不在角色卡内增加八情绪播放器。
- 不以角色显示名称替代稳定 `entityId/speakerId`。
- 不分析拼接后的整集长视频；原始分镜视频仍逐条处理。
- 不修改 `/Users/by3/Documents/peiyin-pyvideotrans` 现有代码和环境。

## 18. 当前审计记录

- 2026-08-03 代码审计：当前实现只有“先完成分镜视频和 Gemini 分析，再生成正式配音”的单一路线，不符合本版双路线合同。
- 2026-08-03 代码审计：当前 `requiredSpeakerIds` 来源于已生成分镜，剧情片无法在资产阶段提前准备角色对白。
- 2026-08-03 代码审计：当前字幕时间来自导演/Gemini 时间轴，没有 Faster-Whisper 运行时和稳定转录 JSON。
- 2026-08-03 代码审计：当前“配音 + 环境声”只是混入原音，没有真正的人声分离；含角色对白时会被运行时阻止。
- 已确认 Faster-Whisper Large V3 Turbo 模型和 Python 环境可复用，模型约 1.5GB。
- 已确认 Sherpa-ONNX 1.13.4、公共说话分段模型、中英文说话人特征模型均已存在。
- 已确认 Spleeter `vocals.fp16.onnx` 和 `accompaniment.fp16.onnx` 及 `vocal_bgm_spleeter()` 入口均已存在。
- 已验证 IndexTTS2 多情绪角色包、稳定 `voiceProfileId` 和逐句批量生成基础代码；服务启动 UI 与完整权重探针仍待执行。
- Veo 与 Grok 的视频能力合同保持有效；本版只重排项目总监、声音和时间轴编排。
