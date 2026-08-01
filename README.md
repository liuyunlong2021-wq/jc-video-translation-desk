# 点一点

点一点是一款分阶段生成 AI 短视频的 Electron 桌面应用。用户输入视频诉求，依次确认文稿与配音，准备角色、场景和道具资产，再生成分镜图、单镜头视频并合成为最终成片。

当前版本基于 [YILS-LIN/short-video-factory](https://github.com/YILS-LIN/short-video-factory) 演进，现行仓库为 [liuyunlong2021-wq/short-video-factory](https://github.com/liuyunlong2021-wq/short-video-factory)。

## 当前工作流

```text
用户诉求
  -> 生成并确认文稿
  -> 生成声音方案
  -> 生成统一配音
  -> 生成逐镜分镜图
  -> 每张图生成一条单镜头视频
  -> 本地 FFmpeg 拼接画面并替换为统一配音
  -> 最终成片
```

每个付费阶段都由用户明确触发，音频、分镜图、视频和最终成片会立即进入中栏素材库。失败后只重试未成功的任务，不重复提交已经成功的生成请求。

## 固定媒体能力

| 阶段 | 模型或能力 | 说明 |
|---|---|---|
| 文稿与内置 Skill | `gemini-3.6-flash` | 根据诉求、目标时长、比例和视觉风格生成文稿 |
| 声音设计 | `rh-aiapp-voice-design` | 基于文稿生成并应用人设、音色、风格、情感和节奏 |
| 分镜图 | `gpt-image-2` | 支持无参考图生成和单核心参考图编辑 |
| 分镜视频 | `veo-3.1-generate-preview` | 一张分镜图生成一个 4、6 或 8 秒连续镜头 |
| 最终合成 | `ffmpeg-static` | 丢弃视频片段原声，按统一配音真实时长输出成片 |

云端能力通过韭菜盒子 API 使用：

- API 地址：`https://api.jiucaihezi.studio/v1`
- 获取 API Key：[https://api.jiucaihezi.studio/keys](https://api.jiucaihezi.studio/keys)

界面只要求配置 API Key，不需要填写模型名或 API 地址。

## 核心特性

- 分段确认：文稿、声音、分镜图、视频和合成可分别测试与重试。
- 单核心参考资产：可上传一张产品或主体参考图，按镜头决定是否保持主体一致。
- 单镜头合同：每个视频片段只描述一个连续镜头，避免让模型在单张图中错误切镜。
- 真实音频时长：先生成配音，再据此计算分镜数量和最终时间线。
- 统一声音：最终成片只保留声音设计生成的统一配音。
- 可恢复任务：任务状态和媒体文件保存在 Electron `userData/media-runs/<runId>/`。
- 受控媒体路径：应用只允许读取当前任务目录内的素材。
- 紧凑素材库：参考图、音频、分镜图、视频和成片分类展示，点击后弹窗预览。
- 双语界面：保留中文和英文界面资源。

当前第一版不包含字幕、BGM、批量自动生产、用户素材文件夹绑定，也不包含完整角色、场景和道具资产系统。

## 支持范围

- 系统：macOS、Windows、Linux
- 画面比例：当前 AI 视频工作流支持 `9:16` 和 `16:9`
- 视频生成时长：每段仅支持 4、6、8 秒
- 核心参考图：PNG、JPEG、WebP，最大 20 MB

## 本地开发

环境要求：

- Node.js `>=22.17.0`
- pnpm `10.12.4`

安装依赖：

```bash
pnpm install
```

运行测试：

```bash
pnpm test
```

构建安装包：

```bash
pnpm build
```

macOS 构建完成后可直接打开：

```bash
open release/1.2.2/mac-universal/点一点.app
```

Vue DevTools 在 Node 25 中导致的 `localStorage` 配置加载问题已通过移除未使用插件修复，详情见[开发环境 localStorage 兼容问题](docs/wiki/排障/开发环境localStorage兼容问题.md)。

## 项目文档

- [项目 Wiki 总入口](docs/wiki/CLAUDE.md)
- [当前状态与风险](docs/wiki/hot.md)
- [单核心参考资产的单镜头媒体编排工作流 SDD](docs/短视频工厂AI原生创作改造SDD.md)
- [工作流架构](docs/wiki/架构/分段式AI短视频工作流.md)
- [实现落地记录](docs/wiki/开发/AI原生创作工作流落地.md)
- [本地构建与发布](docs/wiki/运维/本地构建与发布.md)
- [2026-07-30 验证状态](docs/wiki/巡检报告/2026-07-30验证状态.md)

## 当前验证状态

- 构建版已完成一次端到端人工验证，最终视频合成成功。
- 39 项自动测试、类型检查和未签名本地应用打包已通过，覆盖媒体合同、恢复、持久化、合成、镜头节奏和品牌参数迁移。
- AI 原生工作流实现提交：`57c48b6`。

## 数据与安全

- API Key 优先使用 Electron `safeStorage` 加密保存；系统安全存储不可用时仅在当前会话内使用。
- `run.json` 和 Wiki 不保存 API Key。
- 云端生成结果只接受 HTTPS 地址，不允许重定向降级到 HTTP。
- 媒体生成依赖云端 API；任务状态、下载后的素材和最终 FFmpeg 合成保存在本机。

## 历史与许可证

旧版 EdgeTTS、BGM、字幕、批量混剪和用户素材文件夹工作流已被当前 AI 原生工作流替代。历史版本说明保留在 [CHANGELOG.md](CHANGELOG.md)，不代表当前界面仍提供这些能力。

项目沿用原仓库许可证，详见 [LICENSE](LICENSE)。原项目作者与历史贡献记录归 [YILS-LIN/short-video-factory](https://github.com/YILS-LIN/short-video-factory) 所有。
