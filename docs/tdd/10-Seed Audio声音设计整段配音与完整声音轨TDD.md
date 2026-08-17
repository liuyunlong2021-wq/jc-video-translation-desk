# TDD-10：Seed Audio 声音优先路线

> 日期：2026-08-05
> 状态：前置全局配音工作台、角色声音两步生成和可编辑豆包语音稿节点已实现；参考音上传、绑定和韭菜盒子统一 API 透传已确认可用
> 上位设计：`docs/导演分镜时间轴与角色配音编排SDD.md`
> 路线母版：`docs/wiki/架构/逐镜智能剪辑与声音成片.md` 的旁白宣传片主链
> 前置依赖：`docs/tdd/00-共享生产合同与状态机TDD.md`、`docs/tdd/02-声音引擎与角色音色绑定TDD.md`、`docs/tdd/03-素材SRTTDD.md`、`docs/tdd/04-Gemini剪辑时间轴TDD.md`、`docs/tdd/05-配音字幕工作台骨架TDD.md`、`docs/tdd/06-配音与字幕TDD.md`、`docs/tdd/07-音频处理与成片TDD.md`、`docs/tdd/08-项目与剧集数据边界TDD.md`、`docs/tdd/09-项目与剧集UITDD.md`
> 外部 Skill 来源：`/Users/by3/Documents/peiyin-pyvideotrans/docs/skills/jc-doubao-seed-audio`

## 1. 目标

新增一条由用户人工选择的 Seed Audio 声音优先路线。它以现有宣传片路线为流程母版，但把 Seed Audio 的能力扩展到旁白和有对白内容：先得到完整声音轨，再用真实声音时间轴驱动分镜和后续剪辑。

本 TDD 只新增 Seed Audio 路线，不改变现有逐句后配路线。Qwen3-TTS、IndexTTS2、VEO、Grok、Faster-Whisper、Gemini、Spleeter 和 FFmpeg 继续保留并按各自已有合同工作。

## 2. 路线分层

内容类型和声音制作路线是两个字段，不能混成一个模型选择器：

```ts
type ContentType = 'promo' | 'dialogue'
type AudioProductionRoute = 'seed-full-track' | 'post-dub'
type AudioEngine = 'seed-audio' | 'indextts2' | 'qwen3-tts'
```

- `ContentType` 只影响文稿、表演、分镜和字幕提示词。
- `AudioProductionRoute` 默认是 `seed-full-track`；用户明确选择逐句后配时才改为 `post-dub`。
- `AudioEngine` 是路线内部的执行模型。
- 选择 `seed-full-track` 时固定使用 `seed-audio`。
- 选择 `post-dub` 时保留现有 IndexTTS2/Qwen3-TTS 选择和逐句后配流程。

产品 UI 不再让项目总监自动覆盖声音路线。项目总监仍可分析内容类型、角色、场景、道具和导演资料；声音路线默认为 Seed，用户可以在项目总监确认区人工改为逐句后配。

不新增独立生产阶段；在资产之后增加 Seed 专属的前置“全局配音工作台”视图，后期“配音字幕”工作台继续保留：

```text
文稿 -> 项目总监 -> 资产 -> 全局配音（Seed） -> 分镜 -> 分镜图 -> 视频 -> 配音字幕 -> 成片
```

角色声音数据仍属于角色资产并写入声音 Wiki；生成/绑定声音的操作统一放在全局配音工作台。完成完整声音轨和真实时间轴后才开放“生成分镜提示词”。

## 3. 适用范围与暂不处理

### 3.1 本轮支持

- 单人旁白、产品宣传、品牌广告；
- 一至三名主要角色的连续对白；
- 同一集同时包含旁白和对白；
- Seed Audio 一次生成对白、音乐、环境声和动作音效的完整声音轨；
- Seed 音色绑定到项目角色，并跨本项目剧集复用。

### 3.2 本轮明确不做

- 不删除或替换 Qwen3-TTS、IndexTTS2；
- 不改动现有逐句后配路线；
- 不在本 TDD 解决无对白纯打斗片的完整声音设计；
- 不把无对白打斗片静默当成“已有对白时间轴”处理；
- 不增加独立字幕阶段、独立成片工作台或第二套 Store/Wiki；
- 不把 Seed Audio 当成本地模型，不把 Key 写入前端、Wiki 或 Git；
- 不使用官方 `speakerId` 作为产品角色身份。

无对白项目在本轮应显示“Seed 声音优先路线暂不支持无对白片段，请选择逐句后配路线或等待纯动作声音 TDD”，不能生成一条缺少时间依据的假时间轴。

## 4. Seed Audio 能力边界

- 官方请求模型名为 `seed-audio-1.0`；控制台显示名不作为请求值；
- 最多三个参考音，引用顺序固定为 `@音频1`、`@音频2`、`@音频3`；
- 参考音上限只限制参考音数量，不限制文本长度或角色基准音的文字设计；
- 单个连续生成单元受官方字符和时长限制，不能把整集无限拼进一个请求；
- 输出可能同时包含对白、旁白、音乐、环境声和动作音效；
- 返回的临时 URL 必须立即下载，不能把临时 URL 当长期项目资产；
- 实际音频时长必须由 `ffprobe` 校验，Whisper 时间轴以实际文件为准。

超过三个主要角色时，后端按连续段落规划任务：主任务使用最多三个参考音并生成完整声音轨；剩余角色使用 Seed Audio 生成纯人声补充轨，明确禁止重复生成音乐、环境声和动作音效，最后由 FFmpeg 按时间轴混合。不能静默删除角色或交换参考音。

## 5. 人工选择 UI

在项目总监确认区显示“声音制作路线”控件，默认选中 Seed，必须在资产和分镜之前确认：

```text
声音制作路线
[豆包整段声音轨] [逐句后配]
```

选择后显示只读说明和实际执行模型：

```text
豆包整段声音轨 -> Seed Audio 1.0 -> 先生成声音，再写分镜
逐句后配       -> IndexTTS2 / Qwen3-TTS -> 先生成视频，后替换人声
```

不新增另一个“路线模型”选择器。VEO/Grok 仍在视频模型设置中独立选择。

路线确认必须写入：

```text
wiki/项目/制作路线.md
wiki/项目/项目总监.md
```

路线改变时，保留角色、场景、道具等资产版本，但使路线相关的声音时间轴、分镜、分镜图、视频、剪辑时间轴、混音和成片变为 `stale`；不删除原始文件或 Wiki 证据。

## 6. Seed 音色设计与绑定

### 6.1 产品身份

产品自己的 `voiceProfileId` 是稳定身份，角色通过 `speakerId/entityId` 绑定它：

```text
voiceProfileId
  -> referenceAudioPath
  -> 项目角色 speakerId/entityId
```

火山接口若需要临时或适配器级资源 ID，只能保存在运行时密钥/传输记录中，不能替代 `voiceProfileId`，也不能作为 Wiki 角色身份。

### 6.2 Seed 基准音模板与工作台操作

Seed 音色设计使用专用 Skill 的推荐模板：

```text
角色名/身份 + 年龄性别 + 口音/语言 + 声线特征 + 声音气质
+ 语气情绪 + 语速音量 + 场景风格 + 示例台词
```

“生成角色音色提示词”按钮执行：

```text
角色资料
-> jc-voice-design 提取固定声音层
-> 保存角色音色提示词到声音 Wiki
```

按钮按“本集全部缺失角色”批量执行：已有提示词保留，缺失提示词依次生成。角色基准音示例台词必须继承确认剧本主语言；英文剧本使用英文角色原句或英文兜底句，中文剧本使用中文角色原句或中文兜底句。

“生成角色参考音”按钮只读取当前已保存的角色音色提示词：

```text
角色音色提示词
-> jc-doubao-seed-audio 编译 Seed 基准音请求
-> Seed Audio 文本生成
-> 保存 reference.wav
-> 创建产品 voiceProfileId
-> 绑定当前项目角色 speakerId/entityId
```

一个角色只建立一个稳定 Seed 基准音，不创建八种情绪包。情绪、语速、音量、停顿和表演全部写入正式整段声音轨提示词。

“生成角色参考音”同样批量处理本集全部缺失项：已有 `voiceProfileId` 绑定的角色直接跳过；存在项目内已生成但因注册失败遗留的 `voice-<speakerId>.wav` 时先补注册和 Wiki 绑定，不再次调用付费生成接口。角色页 `entityId` 校验必须同时接受系统 `managedPage()` 写出的带引号 YAML 值和无引号值。

通用 `jc-voice-design` 不替换：它继续为 IndexTTS2/Qwen3-TTS 提供固定声音层和场景动态表演层。Seed Skill 只负责把已经确认的角色声音设计或全局声音安排转换为 Seed 官方提示词。

### 6.3 UI

全局配音工作台的角色面板显示：

```text
声音引擎：Seed Audio
voiceProfileId：voice-...
参考音：已绑定
```

全局配音工作台中栏选择一个角色后显示：

```text
[选择/绑定已有参考音]
角色音色提示词（可直接编辑）
voiceProfileId 与参考音绑定状态
[选择/绑定已有参考音] [打开参考音]
```

右栏顶部按当前所选角色显示“修改意见”，右栏操作区提供批量“生成角色提示词”和“生成角色参考音”。“生成角色音色提示词”读取每个缺失角色 JSON，调用声音设计 Skill，写入角色声音 Wiki；“生成角色参考音”只读取当前已保存的角色音色提示词，调用 Seed Audio 生成基准音并注册产品自己的 `voiceProfileId`。没有完成角色参考音或绑定已有参考音时，不开放全局声音提示词。
IndexTTS2 的声音包和 Qwen3-TTS 设置继续使用现有 TDD-02，不显示 Seed 的八种情绪播放器。

## 7. Seed 声音优先主链

```text
用户确认文稿
-> 项目总监分析内容类型和资产白名单
-> 默认确认“豆包整段声音轨”（用户可改为逐句后配）
-> 生成视觉资产并确认
-> 进入全局配音工作台
-> 逐角色选择/绑定参考音
-> 逐角色生成音色提示词
-> 逐角色生成角色参考音
-> 点击“整段配音安排”
-> 点击“生成全局声音提示词”
-> 点击“生成豆包语音稿”
-> jc-doubao-seed-audio 把确认文稿、角色声音、音乐、环境声和动作音效编译为可编辑声音导演稿
-> 用户查看并按需修改声音导演稿
-> 点击“生成完整声音轨”
-> Seed Audio 原样消费当前声音导演稿，生成对白/旁白/音乐/环境声/动作音效
-> 自动 Faster-Whisper 生成对白时间轴和中文 SRT
-> 导演按声音时间轴写分镜提示词
-> VEO/Grok 生成分镜图和视频
-> 每条素材生成 SRT
-> Gemini 读取原视频、完整分镜提示词和素材 SRT，输出 editing-timeline.json
-> 工作台逐条校准画面剪辑点
-> 可选分离 Seed 完整轨的人声和非人声
-> 混音、烧录字幕和声音
-> 输出成片
```

Seed 声音时间轴是对白/旁白的权威时间轴。Gemini 只能确定画面真实动作区间和画面剪辑点，不能改写已确认的对白时间。

VEO/Grok 仍然按原有分镜提示词正常生成画面、对白、音乐、环境声和动作音效。Seed 路线只在后期采用阶段默认使用 Seed 完整声音轨；视频原生声音必须保留为原始媒体证据和可选备用轨，不得在提示词阶段写入“禁止生成人声/音乐/环境声”等限制。

三份上游内容必须分开：

- `确认文稿.md` 是剧情、对白和动作的唯一内容事实源；
- `整段配音安排.json` 是角色分组、参考音顺序和任务边界的确定性程序合同；
- `声音导演稿.md` 是可直接提交给 Seed Audio 的可编辑 `text_prompt`，包含角色音色、表演、音乐、环境声、动作音效、混响和声音事件顺序。

声音导演稿是确认文稿的派生产物，不能覆盖确认文稿，也不能代替画面导演分镜。画面导演只在完整声音轨与真实声音时间轴完成后工作。

声音较短时，导演可在固定对白窗口之间加入表演、反应、空镜或环境声；声音较长时优先调整镜头和段落时长，不截断对白。超出整集时长必须重新生成更快语速版本。

## 8. 豆包语音稿、真实时间轴与字幕

### 8.1 可编辑声音导演稿

“生成豆包语音稿”调用 `jc-doubao-seed-audio`，输入必须包含确认文稿、项目总监角色白名单、角色声音设计/参考音、`整段配音安排.json` 和本集声音要求。输出写入：

```text
wiki/声音/<episodeId>/seed-audio/声音导演稿.md
```

正文就是最终 `text_prompt`，不包 JSON、API 参数或解释。中栏打开该 Markdown 并允许直接编辑；用户的当前保存版本是“生成完整声音轨”的唯一提示词输入。一个任务拆成多轨时，同页按 `taskId` 分节保存，每节只控制对应任务，补充人声任务不得重复生成音乐、环境声和动作音效。

声音导演稿至少写清：角色声音身份与参考音映射、每句原文、表演情绪、语速/停顿/重音、音乐、连续环境声、关键动作音效、空间/混响以及声音事件先后。它可以把动作说明转换为声音事件，但不能改写、遗漏或新增正式台词。

### 8.2 真实时间轴

Seed 音频成功落盘后自动运行 Faster-Whisper：

- 识别人声文字和精确 `startMs/endMs`；
- 正式字幕文字仍来自已确认剧本，Whisper 只提供时间证据；
- 通过剧本台词和角色绑定直接确定演员，不使用 Sherpa 说话人聚类；
- 输出 `dialogue-timeline.json` 和中文 SRT；
- 无人声片段允许为空，但本轮 Seed 路线若整集无对白则触发本 TDD 的范围门禁。

产物：

```text
wiki/声音/<episodeId>/seed-audio/完整声音轨.mp3
wiki/声音/<episodeId>/seed-audio/完整声音轨.wav
wiki/声音/<episodeId>/seed-audio/声音导演稿.md
wiki/声音/<episodeId>/seed-audio/声音生成记录.json
wiki/转录/<episodeId>/seed-dialogue-whisper.json
wiki/字幕/<episodeId>-seed-dialogue.srt
wiki/时间轴/<episodeId>/dialogue-timeline.json
```

## 9. 整段任务规划

“生成豆包语音稿”按钮前由确定性后端规划器生成安排，不调用大模型判断角色数：

1. 按确认剧本和场景连续区间建立候选段；
2. 收集有台词的角色 `speakerId` 并去重；
3. 角色数 `<=3` 时生成一个完整声音轨任务；
4. 角色数 `>3` 时拆成主完整轨和一个或多个纯人声补充轨；
5. 固定每个任务的绝对时间窗、台词、参考音顺序、音乐/环境声策略和生成状态；
6. 生成前重新校验安排版本，防止脚本、角色绑定或时间轴变化后继续使用旧安排。

安排产物：

```text
wiki/声音/<episodeId>/seed-audio/整段配音安排.json
```

至少包含：`schemaVersion`、`projectId`、`episodeId`、`sourceScriptHash`、`voiceBindingHash`、`createdAt`、`segments`、`tasks`、`referenceMap`、`status` 和阻塞原因。

## 10. 韭菜盒子统一 API 合同

Seed Audio 与其他模型共用 Electron 安全存储中的韭菜盒子 API Key，不再保留火山引擎专属 Key 或直连配置。请求地址固定为 `https://api.jiucaihezi.studio/v1/audio/speech`。

请求头固定为：

```http
Authorization: Bearer <韭菜盒子 API Key>
Content-Type: application/json
```

请求体至少包含：

```json
{
  "model": "seed-audio-1.0",
  "input": "最终编排后的 Seed Audio 提示词"
}
```

统一渠道直接返音频结果，客户端落盘后转换为项目统一的 48kHz 双声道 WAV。Seed Audio 的声音控制唯一入口是 `input` 中的最终提示词；客户端不得额外提交 `voice`、`response_format`、性别映射、基础音色预设或其他伪控制字段。参考音上传和透传已支持；正式克隆请求中参考音数组顺序必须与 `voiceProfileId` 及提示词中 `@音频N` 完全一致，不得静默丢弃或交换角色参考音。

## 11. 配音字幕工作台适配

Seed 路线进入全局配音工作台时，复用现有工作区壳和中栏/右栏布局；视频生成后的“配音字幕”工作台保持原语义，不被替换。

全局配音工作台中栏只展示和编辑内容，所有真实操作按钮统一放在右栏：

```text
批量角色：生成角色提示词、生成角色参考音
全局：整段配音安排、生成全局声音提示词、生成豆包语音稿、保存声音导演稿、生成完整声音轨、生成分镜提示词
```

资产工作台在 `seed-full-track` 路线下最后一个按钮显示“全局配音”，只进入全局配音工作台；逐句后配路线继续显示“转分镜”。

“整段配音安排”是独立的确定性预检按钮：它展示当前连续段落、角色数量、参考音映射、任务拆分、时长/字符门禁和失败原因；安排通过后才开放“生成全局声音提示词”。全局提示词和角色音色提示词均保存后，才开放“生成豆包语音稿”；声音导演稿保存后才开放“生成完整声音轨”；完整声音轨和 Whisper 时间轴完成后才开放“生成分镜提示词”。任何生成按钮不得在内部覆盖用户已保存的提示词。

自动动作：

```text
Seed 音频落盘成功 -> Faster-Whisper -> dialogue-timeline.json + SRT
```

工作台右栏继续保留已有按钮：

```text
重选剪辑点滑块
翻译所有字幕
分离原人声和背景声
去除原人声
混回背景声、环境声和动作音
烧录配音和字幕
```

Seed 完整声音轨未分离时，烧录直接使用该完整轨；执行分离后，烧录才使用去除原人声并混回后的最终轨。保留原始完整轨、对白轨和非人声轨，不覆盖或删除。

## 12. 状态、持久化与失效

在现有 `PostProductionState` 上增加 Seed 专属字段，不新建第二套状态机：

```ts
type SeedAudioStatus = 'idle' | 'blocked' | 'running' | 'ready' | 'failed' | 'stale'

interface SeedAudioState {
  route: 'seed-full-track'
  engine: 'seed-audio'
  voiceProfileIds: string[]
  arrangementPath?: string
  directorPromptPath?: string
  directorPromptHash?: string
  completeTrackPath?: string
  dialogueTimelinePath?: string
  dialogueSrtPath?: string
  vocalPath?: string
  nonVocalPath?: string
  mixedPath?: string
  status: SeedAudioStatus
  error?: string
}
```

失效规则：

| 变化                | 必须失效                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| 文稿/台词变化       | Seed 安排、声音导演稿、声音轨、Whisper 时间轴、SRT、分镜、分镜图、视频、editing-timeline、混音、成片 |
| Seed 音色绑定变化   | 声音导演稿、声音轨、Whisper 时间轴、SRT、分镜及全部下游                                              |
| 声音导演稿变化      | 声音轨、Whisper 时间轴、SRT、分镜及全部下游                                                          |
| Seed 声音轨重新生成 | Whisper 时间轴、SRT、分镜及全部下游                                                                  |
| 画面素材变化        | 素材 SRT、Gemini editing-timeline、画面剪辑、混音、成片；保留 Seed 声音时间轴                        |
| 画面剪辑点滑块变化  | 画面剪辑、混音、成片；保留 Seed 声音和对白 SRT                                                       |
| 中文字幕修改        | 翻译、配音字幕烧录和成片；不重新生成 Seed 声音，除非用户改动台词正文                                 |

所有状态变化和产物引用写入当前剧集 Wiki，保留源文件哈希、生成参数、模型、时间、角色绑定和上游版本。

## 13. Wiki 产物与双链

每集 `wiki/制作/<episodeId>.md` 作为索引，必须双向链接：

```text
项目路线 ↔ 剧集
角色 ↔ voiceProfileId ↔ 参考音
剧本台词 ↔ 整段配音安排 ↔ 声音导演稿
声音导演稿 ↔ 整段声音轨 ↔ dialogue-timeline.json ↔ SRT
声音时间轴 ↔ 分镜提示词
分镜/素材 ↔ Gemini editing-timeline.json
最终音轨 ↔ 成片
```

核心文件：

```text
wiki/项目/制作路线.md
wiki/声音/角色/<speakerId>.md
wiki/声音/<episodeId>/seed-audio/整段配音安排.json
wiki/声音/<episodeId>/seed-audio/声音导演稿.md
wiki/声音/<episodeId>/seed-audio/声音生成记录.json
wiki/声音/<episodeId>/seed-audio/完整声音轨.wav
wiki/时间轴/<episodeId>/dialogue-timeline.json
wiki/字幕/<episodeId>-seed-dialogue.srt
wiki/剪辑/<episodeId>/editing-timeline.json
wiki/声音/<episodeId>/音频处理.json
wiki/成片/<episodeId>.md
```

## 14. 测试先行清单

1. 默认路线为 `seed-full-track`；用户明确选择后才切换为 `post-dub`，项目总监不能覆盖用户已确认路线。
2. Seed 路线不会删除或改变 Qwen3-TTS、IndexTTS2 的设置和逐句后配按钮。
3. `voiceProfileId + referenceAudioPath` 是产品身份，禁止把官方 `speakerId` 写成角色身份。
4. 每个角色可从角色 JSON 生成独立音色提示词；基准音提示词包含九项官方推荐信息；可编辑声音导演稿另含原文台词、角色表演、音乐、环境声、动作音效、空间处理和事件顺序。
5. 一至三角色生成一个完整声音轨；四角色以上拆分主完整轨和纯人声补充轨，禁止静默丢角色。
6. Seed 音频成功后自动生成 Whisper 时间轴和 SRT；正式字幕来自剧本，Whisper 只提供时间。
7. 分镜生成必须读取 Seed 对白时间轴；Gemini 只能修改画面剪辑点，不能修改对白时间。
8. 临时 URL 立即下载，音频经 `ffprobe` 校验并落盘为 48kHz 双声道 WAV。
9. 未分离时烧录使用完整声音轨；分离后必须按按钮顺序使用最终混音轨。
10. 文稿、绑定、声音轨、画面或剪辑点变化遵守最小失效规则。
11. “生成完整声音轨”只读取已保存的声音导演稿，不在按钮内部重新调用 Skill；语音稿修改后旧声音轨和下游全部失效。
12. 每个角色按钮和全局按钮都有后端动作、运行中/失败/禁用状态和 Wiki 产物；自动 Whisper 不另设按钮。
13. `pnpm test`、`pnpm exec vue-tsc --noEmit`、`git diff --check` 通过。

## 15. 验收标准

- 默认使用“豆包整段声音轨”；项目总监不能擅自改路线；
- 用户在全局配音工作台逐角色完成参考音选择/绑定、音色提示词和角色参考音后，必须依次完成“整段配音安排”“生成全局声音提示词”“生成豆包语音稿”和“生成完整声音轨”；
- 中栏可以查看和编辑 `声音导演稿.md`，生成完整声音轨时使用的正文与用户当前看到的正文一致；
- Seed 完整声音轨成功后，系统自动产生 `dialogue-timeline.json` 和 SRT；
- 导演分镜读取真实声音时间轴；VEO/Grok 继续按原提示词生成其原生声音，最终声音轨由后期声音路线选择；
- Gemini 输出的 `editing-timeline.json` 只负责真实画面剪辑点；
- 配音字幕工作台可继续微调画面剪辑点，并可选分离、混音和最终烧录；
- 所有产物进入当前剧集 Wiki 并形成双链；
- 现有逐句后配路线行为不变；
- 本轮不承诺无对白纯打斗片的 Seed 声音设计。

## 16. 执行边界

本 TDD 只定义 Seed Audio 声音优先路线。实现时优先复用现有宣传片时间轴、后期配音字幕工作台、FFmpeg 和 Wiki 写入能力；全局配音工作台只增加一个路由视图，不新增第二套 Store、字幕阶段或模型抽象层。
