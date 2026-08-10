# 视频翻译工作台

视频翻译工作台是一款本地优先的桌面应用。它将已有视频处理成目标语言字幕、角色配音和最终成片；视频、音频、模型与项目文件保留在用户自己的电脑上，只有字幕校准、翻译和配音生成会使用你在应用中填写的韭菜盒子 API Key。

## 直接下载 APP

普通用户不需要安装 Node.js、Python、FFmpeg 或运行命令。打开 [GitHub Releases](https://github.com/liuyunlong2021-wq/jc-video-translation-desk/releases)，下载与你的电脑对应的安装包：

- Apple Silicon（M1/M2/M3/M4）：下载 macOS 的 `.dmg` 文件。
- Intel Mac：下载同一个 macOS `.dmg` 文件。
- Windows：下载文件名包含 `win` 的安装程序（发布后提供）。

安装并打开 APP 后，进入“生成设置” -> “本地字幕引擎” -> “一键安装”。APP 会自动安装 FunASR 运行环境、依赖和模型；首次安装建议预留至少 8 GB 磁盘空间并保持网络稳定。完成后日常使用不再重复下载。

Linux 暂不提供桌面安装包，需要使用下面的源码安装方式。

## 能做什么

```text
上传原片
-> FunASR 识别中文原文和固定时间戳
-> 可选抽帧校准、可选大模型语义校准、人工确认
-> 翻译为面向美国观众的英文字幕
-> 绑定角色参考音并生成整段英文配音
-> FunASR 按真实英文发音对齐每句配音
-> 分离原片人声、填充英文配音、烧录字幕
-> 输出翻译成片
```

- 字幕时间戳与文字分开处理：FunASR 提供时间锚点，抽帧和大模型只提供文字建议，最终以人工确认稿为准。
- 整段配音保留表演连贯性。成片阶段使用完整配音块的英文词级时间戳与确认英文字幕单调对齐，避免旧的固定切片造成截尾。
- 生成的项目文件、原视频、音频和成片都保存在你创建或选择的项目文件夹中；卸载应用不会自动删除它们。

## 开始前

你需要准备四样东西：一台电脑、稳定网络、至少 8 GB 可用磁盘空间，以及一个韭菜盒子 API Key。

不需要自己安装 FFmpeg 或 Python。下面的步骤会安装项目需要的 Node、Python 独立环境、FunASR 和模型。

当前已在 Apple Silicon Mac（M1/M2/M3/M4）完成真实 FunASR 探针验证。Intel Mac 和 Windows 使用同一安装脚本，但仍建议首次安装后按“检查是否安装成功”逐项确认；Intel Mac 会使用 CPU，识别速度通常比 M 系列慢。

### 获取源码（开发者备用）

本仓库的公开地址是：

```text
https://github.com/liuyunlong2021-wq/jc-video-translation-desk.git
```

如果你已经下载了 ZIP 文件，也可以解压后进入解压出来的 `jc-video-translation-desk` 文件夹，跳过 Git 安装和克隆步骤。

## 安装：苹果电脑 M 系列芯片

适用于 M1、M2、M3、M4。按顺序完成下面每一步。

### 第一步：安装 Git

1. 打开 Mac 的“终端”应用。
2. 粘贴并运行：

```bash
git --version
```

3. 如果系统弹出“安装命令行开发者工具”，点击“安装”，等待完成。
4. 再运行一次 `git --version`，看到版本号就完成了。

### 第二步：安装 Node.js

1. 打开 [Node.js 官网](https://nodejs.org/)。
2. 下载并安装标有 **LTS** 的 macOS 安装包，选择 **Apple Silicon** 版本。
3. 安装完成后，关闭并重新打开“终端”。
4. 运行：

```bash
node -v
```

看到 `v22.17.0` 或更高版本即可。

### 第三步：安装 uv

在终端运行：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

完成后关闭并重新打开终端，再运行：

```bash
uv --version
```

看到版本号即可。

### 第四步：下载项目并安装

在终端依次运行。第一行的地址要换成发布后的真实 GitHub 地址：

```bash
git clone https://github.com/liuyunlong2021-wq/jc-video-translation-desk.git
cd 仓库名
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
pnpm setup:funasr
```

最后一条命令耗时最长。它会自动创建隔离的 Python 3.10 环境、安装 FunASR、下载模型并实际识别一段测试音频。终端最后出现 `FunASR is ready` 才算安装成功。

### 第五步：启动应用

```bash
pnpm dev:translation
```

等待桌面窗口打开。在设置页填入你的韭菜盒子 API Key，然后就可以创建项目并使用。

## 安装：苹果电脑 Intel 芯片

步骤与 M 系列完全相同，只有 Node.js 下载项不同。

1. 在“关于本机”里确认“芯片”显示为 Intel。
2. 按上面 M 系列的第一、三、四、五步操作。
3. 在 [Node.js 官网](https://nodejs.org/) 下载 **LTS** 的 macOS 安装包时，选择 **Intel** 版本。
4. 运行 `pnpm setup:funasr` 后，必须看到 `FunASR is ready`。

Intel Mac 没有 M 系列的 MPS 加速，FunASR 会在 CPU 上运行。功能链路相同，但字幕识别会更慢；不要在识别过程中合盖、关机或强制退出终端。

## 安装：Windows 10 / Windows 11

以下步骤使用 PowerShell。不要使用“管理员身份”打开，普通 PowerShell 即可。

### 第一步：安装 Git

1. 打开 [Git for Windows](https://git-scm.com/download/win)。
2. 下载并安装，安装过程保持默认选项即可。
3. 打开 PowerShell，运行：

```powershell
git --version
```

看到版本号即可。

### 第二步：安装 Node.js

1. 打开 [Node.js 官网](https://nodejs.org/)。
2. 下载并安装标有 **LTS** 的 Windows 安装包。
3. 关闭并重新打开 PowerShell。
4. 运行：

```powershell
node -v
```

看到 `v22.17.0` 或更高版本即可。

### 第三步：安装 uv

在 PowerShell 运行：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

关闭并重新打开 PowerShell，再运行：

```powershell
uv --version
```

看到版本号即可。

### 第四步：下载项目并安装

选择一个你找得到的位置，例如“文档”文件夹。PowerShell 中依次运行，第一行的地址要换成发布后的真实 GitHub 地址：

```powershell
cd $HOME\Documents
git clone https://github.com/liuyunlong2021-wq/jc-video-translation-desk.git
cd 仓库名
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
pnpm setup:funasr
```

等待终端出现 `FunASR is ready`。若 Windows 弹出防火墙或网络访问提示，请允许 Node.js 和 Python 访问网络，否则模型无法下载。

### 第五步：启动应用

```powershell
pnpm dev:translation
```

首次 Windows 安装尚未在全新电脑上完成正式验收。若 `pnpm setup:funasr` 失败，请保留 PowerShell 的完整报错并提交 Issue，不要反复删除项目文件夹。

## 检查是否安装成功

无论使用哪个系统，进入项目目录后运行：

```bash
pnpm probe:funasr
pnpm test
```

第一个命令会检查 Python 环境、模型和真实转写；第二个命令运行程序自动测试。两条命令都成功后，开发环境就准备好了。

## 日常使用

每次启动时：

```bash
cd 你的仓库文件夹
pnpm dev:translation
```

应用中创建项目时，选择一个空文件夹。这个文件夹就是项目根目录，里面会保存原片、音频、字幕、成片和项目 Wiki。不要在应用运行时手动移动或重命名里面的文件；需要移动整个项目时，先关闭应用，移动后使用“打开已有项目目录”。

## 更新代码

如果你是通过 Git 克隆的仓库，在项目目录运行：

```bash
git pull
pnpm install
pnpm probe:funasr
```

只有 README 或代码提示需要更新模型时，才重新运行 `pnpm setup:funasr`。该命令会复用已有环境和模型，并在需要时补齐缺失部分。

## 构建安装包（开发者）

```bash
pnpm test
pnpm build:translation
```

构建后的安装包位于 `release-translation/<版本号>/`。安装包不内置约 2 GB 的 Python 环境和 FunASR 模型；普通用户安装 APP 后，直接在“生成设置”中点击“一键安装”即可完成配置。

Windows 安装包必须在 Windows 电脑或 GitHub Actions 的 Windows Runner 上构建。不要在 Mac 上交叉构建 Windows 安装包，否则会把 Mac 版 FFmpeg 带入 Windows 包。

## 常见问题

### `pnpm` 或 `corepack` 找不到

关闭当前终端，重新打开，再运行 `node -v`。如果仍找不到，说明 Node.js 安装没有完成，请重新安装 LTS 版 Node.js。

### `uv` 找不到

关闭并重新打开终端或 PowerShell 后再试。仍找不到时，重新执行本文对应系统的 uv 安装命令。

### `pnpm setup:funasr` 很久没有结束

首次安装需要下载 PyTorch 和多个模型，网络慢时可能需要较长时间。不要关闭终端。若明确报错，复制完整报错文本后提交 Issue。

### 想重新检查模型，不想重新下载

运行：

```bash
pnpm probe:funasr
```

### 模型和 Python 环境存在哪里

默认位置如下，不在 Git 仓库里，也不会提交到 GitHub：

```text
macOS:   ~/Library/Application Support/jc-video-translation-desk
Windows: %APPDATA%/jc-video-translation-desk
Linux:   ~/.local/share/jc-video-translation-desk
```

高级用户可以用 `FUNASR_HOME` 修改数据目录，用 `FUNASR_PYTHON` 指向已安装的 Python。

## 开发与文档

- [字幕工作台执行流程](docs/视频翻译工作台-扒片按钮执行流程.md)
- [配音工作台执行流程](docs/视频翻译工作台-配音工作台执行流程.md)
- [成片工作台执行流程](docs/视频翻译工作台-成片工作台执行流程.md)
- [项目开发 Wiki](docs/wiki/CLAUDE.md)
- [本地构建与发布](docs/wiki/运维/本地构建与发布.md)

许可证见 [LICENSE](LICENSE)。
