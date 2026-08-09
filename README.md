# 视频翻译工作台

视频翻译工作台是一款 Electron 桌面应用，用于将已有视频制作成目标语言配音与字幕成片。它将本地语音识别、字幕翻译、角色声音绑定、目标语言配音、背景声处理和字幕烧录组织为可确认、可重试的工作流。

## 当前工作流

```text
上传原片
  -> FFmpeg 提取 16 kHz 单声道音频
  -> FunASR 识别文字、时间戳、匿名说话人和可用情绪候选
  -> 人工检查原文和时间戳
  -> 按需运行大模型语义校准并应用或撤销
  -> 人工绑定真实角色并确认工作稿
  -> 翻译确认后的字幕
  -> 为角色绑定参考音
  -> 生成目标语言人声
  -> 分离原人声与背景声
  -> 混回背景声与目标语言人声
  -> 烧录字幕并输出成片
```

上传仅校验并归档原片，并用 FFprobe 流式读取时长，不压缩或整文件载入视频。点击“识别字幕”只运行 FFmpeg 和 FunASR；“大模型语义校准”是独立按钮，模型只能按 `cueId` 建议文字，不能输出时间戳。FunASR 原文永久保留，工作稿可以应用、撤销或恢复原文，时间戳允许人工修正。

语音识别、FFmpeg 音频处理、混音和字幕烧录在本地执行。原始转写按原片指纹复用；语义校准失败不会覆盖 FunASR 原文或当前人工工作稿。

## 已验证能力

- FunASR `1.4.1` 已在 Apple Silicon + MPS 上跑通 SenseVoiceSmall、FSMN-VAD 和 CAM++ 完整探针。
- 探针校验文字、毫秒时间戳和匿名说话人；语言、情绪和音频事件在模型返回时保留为候选信息。
- 翻译角色可在同一项目的后续剧集复用；翻译资料与内容创作资料分开保存。
- 原片与生成产物保存在本机任务目录；API Key 使用 Electron `safeStorage` 优先保存，任务文件和 Wiki 不保存 API Key。

## 当前边界

- “链路跑通”不代表所有样片的识别、翻译、情绪表演和音画同步都已达到最终生产标准。
- 当前正在用同一集素材比较整段 Seed 配音与逐句克隆配音，评估台词完整率、音色稳定性、情绪、时间窗贴合度、局部修改成本和调用成本。

## 安装

当前发布方式是“从 GitHub 克隆源码后安装”。DMG 不包含约 2 GB 的 Python 环境和模型，不能作为新电脑上的独立首次安装器；运行 DMG 前仍需在源码目录完成下面的 `pnpm setup:funasr`。

环境要求：Git、Node.js `>=22.17.0`、pnpm `10.12.4`、[uv](https://docs.astral.sh/uv/getting-started/installation/) 和 FFmpeg。

当前已实测 macOS Apple Silicon。Windows 和 Linux 安装脚本已按跨平台路径编写，发布前仍需在干净机器上完成验收。

```bash
git clone https://github.com/liuyunlong2021-wq/short-video-factory.git
cd short-video-factory
corepack enable
pnpm install
pnpm setup:funasr
```

`pnpm setup:funasr` 会自动：

1. 浅克隆并锁定 FunASR 提交 `680b1b3f`。
2. 在用户应用数据目录创建 Python 3.10 独立环境。
3. 安装 PyTorch、torchaudio 和 FunASR。
4. 下载 SenseVoiceSmall、FSMN-VAD、CT-Punc 和 CAM++ 模型。
5. 用 FunASR 自带音频跑探针；探针失败则安装命令失败。

Python 环境和模型不提交到 GitHub。默认数据目录为：

```text
macOS:   ~/Library/Application Support/jc-video-translation-desk
Windows: %APPDATA%/jc-video-translation-desk
Linux:   ~/.local/share/jc-video-translation-desk
```

可以通过 `FUNASR_HOME` 修改数据目录，通过 `FUNASR_PYTHON` 指定已安装的 Python。

## 本地开发

```bash
pnpm install
pnpm setup:funasr
pnpm dev:translation
pnpm test
pnpm build:translation
```

只重跑 FunASR 探针：

```bash
pnpm probe:funasr
```

`build:translation` 生成应用安装包，产物位于 `release-translation/<version>/`。该安装包复用用户目录中由 `setup:funasr` 建立的环境和模型。

## 项目文档

- [视频翻译工作台“识别字幕”执行流程](docs/视频翻译工作台-扒片按钮执行流程.md)
- [视频翻译工作流 TDD](docs/tdd/13-视频翻译工作流TDD.md)
- [项目 Wiki 总入口](docs/wiki/CLAUDE.md)
- [本地构建与发布](docs/wiki/运维/本地构建与发布.md)

## 历史

本仓库由 `short-video-factory` 演进而来。旧的 AI 短视频生成工作流不作为本产品的当前说明；历史变更见 [CHANGELOG.md](CHANGELOG.md)，许可证见 [LICENSE](LICENSE)。
