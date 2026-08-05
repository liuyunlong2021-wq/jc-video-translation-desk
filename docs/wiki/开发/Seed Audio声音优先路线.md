# Seed Audio 声音优先路线

> 状态：前置全局配音工作台、角色声音提示词/参考音、可编辑“豆包语音稿”节点已落地；真实 Seed Audio 官方请求和完整项目成片待用项目 Key 验收。

## 最终架构

`seed-full-track` 默认启用；用户明确选择 `post-dub` 时才使用 Qwen3-TTS/IndexTTS2。Seed 路线复用现有项目总监、视觉资产、后期配音字幕工作台、Faster-Whisper、Spleeter 和 FFmpeg，并增加资产之后的前置“全局配音工作台”视图，不复制 Store/Wiki。

```text
确认文稿 -> 项目总监 -> 视觉资产确认
-> 全局配音工作台：逐角色选择/绑定参考音
-> 按角色 JSON 生成音色提示词 -> 生成角色参考音
-> 整段配音安排 -> 生成全局声音提示词
-> 生成豆包语音稿 -> 用户查看/修改
-> 生成完整声音轨
-> Faster-Whisper 自动生成对白时间轴与 SRT
-> 导演读取声音时间轴 -> 分镜图/视频
-> Gemini 画面剪辑点 -> 配音字幕工作台 -> 成片
```

VEO/Grok 继续按原分镜提示词生成原生声音。Seed 路线只在后期默认采用 Seed 完整声音轨，不在视频提示词阶段禁止对白、音乐、环境声或动作音效。完整上游合同见 [[架构/逐镜智能剪辑与声音成片]]。

## 已完成能力

- Seed 官方客户端使用 `X-Api-Key`，支持安全存储和 `SEED_AUDIO_API_KEY` 环境变量；临时 URL 立即下载，Base64 为备用。
- MP3 落盘后转换为 48kHz 双声道 WAV，并写 `声音生成记录.json`。
- 产品自己的 `voiceProfileId` 是角色声音身份；Seed 基准音、声音设计和角色 `entityId` 写入项目声音 Wiki 并回链角色页。
- “整段配音安排”由确定性程序统计角色；每个任务最多三个角色，第四人起按每组三人拆为纯人声补充轨，最终由 FFmpeg 混合，不能静默丢角色。
- 已确认的新合同把 `jc-doubao-seed-audio` 提升为独立“生成豆包语音稿”按钮，并将结果保存为可编辑 `声音导演稿.md`；该拆分尚待代码执行。
- “生成完整声音轨”只读取用户当前保存的声音导演稿并调用 Seed Audio，不能在内部重新调用 Skill 覆盖用户修改；现有代码仍为按钮内部即时编译，属于待修正差异。
- Whisper 只提供时间证据；`dialogue-timeline.json` 和 Seed SRT 的正式文字来自确认文稿。
- 分镜入口在 Seed 路线下要求声音时间轴已经完成，并把时间轴和 SRT 作为导演输入。
- 配音字幕工作台可试听完整轨；未分离时直接烧录完整轨，执行分离后使用人声/背景声处理结果。
- Qwen3-TTS、IndexTTS2、VEO、Grok 和逐句后配路线未删除、未替换。

## 按钮与后端

| 按钮 | 后端 | 主要产物 |
|---|---|---|
| 生成角色音色提示词 | `jc-voice-design` | 角色声音提示词、角色声音 Wiki |
| 生成角色参考音 | `jc-doubao-seed-audio` + Seed API + 产品音色库 | 角色 `voiceProfileId`、基准音、角色声音 Wiki |
| 整段配音安排 | `planSeedAudioArrangement` | `整段配音安排.json` |
| 生成全局声音提示词 | `jc-doubao-seed-audio` | 全局声音导演稿输入记录 |
| 生成豆包语音稿 | `jc-doubao-seed-audio` | 可编辑 `声音导演稿.md` |
| 生成完整声音轨 | Seed API + FFmpeg + Faster-Whisper | `完整声音轨.wav`、生成记录、Whisper JSON、时间轴、SRT |
| 分离完整声音轨的人声和背景声 | Spleeter | `vocal.wav`、`instrument.wav`、音频处理记录 |
| 烧录配音和字幕 | FFmpeg | 本集成片和成片 Wiki |

## 唯一事实源

- 路线：项目总监制作路线 Wiki与 Store 的 `audioProductionRoute`。
- 角色身份：项目角色 `entityId` 与产品 `voiceProfileId`。
- 安排：`wiki/声音/<episodeId>/seed-audio/整段配音安排.json`。
- Seed 提示词：`wiki/声音/<episodeId>/seed-audio/声音导演稿.md`；正文是用户可编辑的最终 `text_prompt`。
- 完整声音：剧集 `seed-audio/完整声音轨.wav` 和 `声音生成记录.json`。
- 对白时间：`wiki/时间轴/<episodeId>/dialogue-timeline.json`。
- 正式字幕：`wiki/字幕/<episodeId>-seed-dialogue.srt`。
- 画面剪辑：`wiki/剪辑/<episodeId>/editing-timeline.json`。

## 验证与边界

- 原代码主链 `pnpm test`：`147/147` 通过，输出指纹 `sha256:7102f1031f66`。
- `pnpm exec vue-tsc --noEmit` 与 `git diff --check`：通过。
- 独立“生成豆包语音稿”按钮、Markdown 编辑和“完整声音轨只读该稿”的新合同已实现，并通过类型检查与运行时测试。
- 尚未使用真实 Seed Audio Key 跑通付费请求、自动 Whisper 和完整成片，不写成真实端到端已验收。
- 用户提供的官方资料只描述 `references[].speaker`，没有提供“上传本地基准音并注册 provider speaker ID”的接口。当前产品会保存并绑定自己的基准音和 `voiceProfileId`；只有档案中已有传输层 `providerSpeakerId` 时才向官方请求携带 `references`，否则使用已确认的文字声音设计，不能把产品角色 ID 伪装成官方 speaker ID。
- 无对白纯动作项目仍不属于本轮 Seed 声音优先路线的验收范围。

## 下一次进入

先读 `docs/tdd/10-Seed Audio声音设计整段配音与完整声音轨TDD.md` 和本页，再用一个单人旁白项目、一个两至三人剧情项目分别完成真实 API 与成片验收。若火山补充参考音注册接口，再在主进程适配器中写入 `providerSpeakerId`，不改变产品 `voiceProfileId`。
