# 点一点（短视频工厂）项目总览

> 给使用者、维护者和 AI 的唯一总入口。先读本页了解产品、架构和接手方式；需要细节时再沿 Wiki 链接进入专题页。原始 SDD、代码和测试保留在原位置，通过 [[来源索引]] 回溯。

## 一句话说明

点一点是一款本地优先的 Electron 桌面应用：它把用户的短视频需求逐步变成正式文稿、角色/场景/道具资产、导演分镜、分镜图、单镜头视频、配音、字幕和最终成片，并让每个付费生成步骤都可检查、重试和恢复。

项目当前主要服务 AI 短视频创作者。它不是“一键生成黑盒”，而是一个可逐阶段确认、以项目 Wiki 和本地媒体文件为交付物的创作工作台。

## 产品主链

当前代码已完成共享合同、项目总监、声音绑定、素材 SRT、Gemini 剪辑时间轴与配音字幕工作台骨架；真实逐句配音、音频处理和成片仍按 TDD 串行实施。完整状态以 [[hot|当前状态与风险]] 为准：

```text
创建或打开项目
  -> 输入需求或导入 Markdown
  -> 生成、编辑并确认正式文稿
  -> 项目总监判断旁白宣传片或剧情片，用户确认或修改路线
  -> 按路线准备正式旁白或角色声音绑定
  -> 为角色、场景、道具生成资产设计 JSON
  -> 可选搜索/上传参考图，生成并确认资产图
  -> 宣传片 / Veo / Grok 导演路线生成分镜并绑定稳定资产 ID
  -> 生成分镜图和原始视频素材
  -> Faster-Whisper 为每条素材生成 SRT
  -> Gemini 结合确认剧本、完整分镜提示词和素材 SRT 逐条直读原视频
  -> editing-timeline.json
  -> 配音字幕工作台微调剪辑点、生成配音并按需处理原人声
  -> FFmpeg 按当前采用点裁切、混音、烧录字幕并输出成片
```

当前界面采用三栏工作区：左栏负责阶段和对象导航，中栏是文稿、资产、分镜及媒体成果的主要阅读区，右栏放当前对象的参数、修改意见和执行操作。顶部任务抽屉只显示当前项目的云端媒体任务。

现行产品主链见 [[架构/项目Wiki与资产主导工作流]]，逐镜成片合同见 [[架构/逐镜智能剪辑与声音成片]]，哪些能力已经验证、哪些仍待验收，以 [[hot|当前状态与风险]] 为准。

## 系统架构

```text
Vue 3 / Vuetify 渲染进程
  |  Pinia 工作流状态、三栏界面、Markdown 阅读编辑
  v
contextBridge（electron/preload.ts）
  |  仅暴露显式 IPC 合同
  v
Electron 主进程
  |-- 云端编排：文稿/Skill/图片/视频/逐镜分析
  |-- 项目工作区：Wiki、状态、资产和任务持久化
  |-- 本地执行：ffprobe / FFmpeg 合成
  |-- 辅助能力：Pinterest 参考图、音色库、本地 TTS
  v
Electron userData/media-runs/<projectId>/
```

| 层级 | 主要职责 | 关键文件 |
|---|---|---|
| 渲染进程 | 三栏交互、阶段编排、成果展示、项目切换 | `src/views/Home/index.vue`、`src/views/Home/components/` |
| 状态与合同 | 工作流状态、下游失效、模型输出解析与校验、持久化迁移 | `src/store/mediaTask.ts`、`src/runtime/` |
| 安全桥接 | 将有限的 Electron 能力暴露给界面，不开放 Node.js | `electron/preload.ts`、`electron/types.ts` |
| 主进程编排 | 注册 IPC，调用云端模型，轮询/恢复任务，管理项目文件 | `electron/ipc.ts`、`electron/cloud.ts`、`electron/media-workspace.ts` |
| 确定性媒体执行 | 校验源媒体、裁切拼接、混音、字幕和成片输出 | `electron/ffmpeg/` |
| 桌面容器 | 窗口、协议、菜单、SQLite 与应用生命周期 | `electron/main.ts`、`electron/sqlite/` |

技术栈是 Electron 22、Vue 3、TypeScript、Vite、Vuetify、Pinia、Node 内置测试器、FFmpeg 和 SQLite。云端能力通过韭菜盒子 OpenAI 兼容 API 使用；界面只配置 API Key，不让用户维护模型地址。

## 数据与唯一事实源

仓库中的 `docs/wiki/` 是“软件项目 Wiki”，解释这套应用如何设计、开发、运行和排障。应用运行后，每个短视频项目还会在本机生成自己的“创作项目 Wiki”。两者用途不同，不要混写。

每个创作项目位于 Electron `userData/media-runs/<projectId>/`，核心内容如下：

```text
project.json          项目名称、阶段和 Wiki 状态
state.json            可恢复的结构化工作流状态（执行事实源）
run.json              云端媒体任务账本
.raw/                 用户原始提交和导入资料快照
wiki/                 面向用户的 Markdown 投影与双链导航
inputs/ assets/       输入和资产版本
storyboards/ clips/   分镜图和单镜头视频
wiki/字幕/素材/       每条原始视频的 Whisper SRT
wiki/剪辑/            editing-timeline.json
wiki/声音/            角色绑定、逐句配音与音频处理记录
picture-master.mp4    裁切拼接后的画面母版
final.mp4             最终成片
```

关键规则：

- `state.json`、稳定 ID 和受控媒体路径决定程序如何继续执行；Markdown 负责阅读、编辑、审阅和导航，不能替代运行状态。
- `projectId` 是项目、Wiki、资产版本、任务和产物的所有权边界；切换项目后，后台结果仍必须写回原项目。
- 资产类型固定为角色、场景、道具；商品也属于道具。资产设计 JSON 是生图正式合同，参考图只补充视觉约束。
- 图片、视频等付费任务按单项持久化。继续查询或继续下载必须复用原任务，只有“重新生成”才再次提交付费请求。
- API Key 不写入项目状态或 Wiki；优先使用 Electron `safeStorage` 加密保存，不可用时只保留当前会话。
- 媒体文件只允许从当前受控项目目录读取；云端结果只接受 HTTPS。

## 目标能力边界

| 环节 | 当前能力 |
|---|---|
| 文稿与项目 Skill | `gemini-3.6-flash`，Skill 输出按合同解析和校验 |
| 资产图/分镜图 | `gpt-image-2`；无参考图走生成，有参考图走编辑 |
| 制作路线 | 项目总监前置判断 `narration-promo` / `drama`，用户拥有最终修改权 |
| 视频生成 | Veo 采用一镜一视频 `4/6/8` 秒；Grok 采用组合分镜、多图参考和 `6-30` 秒片内切镜 |
| 素材转录 | Faster-Whisper Large V3 Turbo 为每条原始视频生成人声文字和精确时间 SRT |
| 逐镜分析 | `gemini-3.6-flash` 读取原视频、确认剧本、完整分镜提示词和素材 SRT，不抽帧 |
| 配音 | Qwen3-TTS/云端能力设计声音；IndexTTS2 根据稳定角色音色包生成逐句中英文配音 |
| 人声处理 | Sherpa-ONNX + Spleeter 仅在替换原人声时分离 `vocal.wav` 与 `instrument.wav` |
| 媒体执行 | `ffprobe` 校验，FFmpeg 只按 `editing-timeline.json` 当前采用点裁切、混音和烧录 |

Whisper 不改写确认剧本；Gemini 通过 SRT 台词和确认剧本直接确定 `speakerId`，通过画面判断无对白动作和真实区间。模型不能直接执行剪辑，`editing-timeline.json` 是唯一剪辑合同，`ffprobe` 负责校验真实时长，FFmpeg 是最终执行器。完整合同见 [[架构/逐镜智能剪辑与声音成片]]。

## 代码目录

| 路径 | 用途 |
|---|---|
| `src/` | Vue 界面、Pinia 状态和可独立测试的运行时逻辑 |
| `electron/` | 主进程、IPC、云端调用、本地工作区、FFmpeg 和桌面能力 |
| `skills/` | 随项目维护的文稿、导演分镜、图片、角色、场景、道具等 Skill |
| `docs/` | SDD、盘点报告和产品设计原始证据 |
| `docs/wiki/` | 本软件项目的稳定知识库与当前状态入口 |
| `locales/` | 中英文界面文本 |
| `build/`、`electron-builder.json5` | 构建脚本与桌面安装包配置 |
| `native/` | 各平台预编译的原生 SQLite 模块 |

## 本地开发与使用

环境要求：Node.js `>=22.17.0`、pnpm `10.12.4`。

```bash
pnpm install   # 安装依赖
pnpm dev       # 启动 Electron 开发环境
pnpm test      # 运行 src/runtime/*.test.ts
pnpm build     # 类型检查、前端构建和 Electron 打包
```

使用应用时先配置韭菜盒子 API Key，再创建项目并按顶部阶段推进。生成操作可能产生云端费用，因此批量任务只处理缺失项，失败时优先使用继续查询或继续下载。详细构建和发布约束见 [[运维/本地构建与发布]]。

## 继续开发时先看什么

1. 先读本页和 [[hot|当前状态与风险]]，确认当前能力边界和未验证项。
2. 根据任务进入对应架构页或开发页，再从 [[来源索引]] 回看 SDD、代码、Git 或测试证据。
3. 修改工作流前追踪 `src/views/Home/index.vue` -> `src/store/mediaTask.ts` -> `electron/preload.ts` -> `electron/ipc.ts` -> 具体主进程实现的完整链路。
4. 涉及项目数据时，保持 `state.json` 为执行事实源、Markdown 为可读投影，并验证项目隔离、相对路径和下游失效。
5. 涉及付费媒体时，验证单项提交、停止、恢复查询、恢复下载和重新生成的语义，避免重复付费。
6. 只把已有代码、测试或人工验收支持的内容写成“已完成”；设计确定但未验收的内容必须保留待验证状态。

## Wiki 导航

- [[hot|当前状态与风险]]
- [[架构/项目Wiki与资产主导工作流|项目 Wiki 与资产主导工作流]]
- [[架构/资产提示词与Pinterest参考图链路|资产提示词与 Pinterest 参考图链路]]
- [[架构/逐镜智能剪辑与声音成片|逐镜智能剪辑与声音成片]]
- [[架构/Veo3.1能力边界与镜头节奏|Veo 3.1 能力边界与镜头节奏]]
- [[开发/三栏工作区与项目级媒体任务|三栏工作区与项目级媒体任务]]
- [[开发/AI原生创作工作流落地|AI 原生创作工作流历史落地记录]]
- [[开发/镜头节奏控制|镜头节奏控制]]
- [[运维/本地构建与发布|本地构建与发布]]
- [[排障/构建产物与运行进程版本不一致|构建产物与运行进程版本不一致]]
- [[排障/开发环境localStorage兼容问题|开发环境 localStorage 兼容问题]]
- [[学习/AI媒体工作流可复用经验|AI 媒体工作流可复用经验]]
- [[巡检报告/2026-08-02工作流状态|最近一次完整工作流巡检]]
- [[来源索引|证据来源索引]]

## 本 Wiki 的维护规则

`CLAUDE.md` 只保留稳定总览和长期导航；`hot.md` 记录当前状态、风险和下一步；`log.md` 只追加已确认事实；专题结论进入 `架构/`、`开发/`、`运维/`、`排障/`、`学习/` 或 `巡检报告/`。不要把完整聊天、整份 SDD、代码副本或未经验证的讨论复制进 Wiki。
