# Windows 字幕乱码与参考音按钮缺失

> 状态：修复已合入 Mac 工作区；Windows 字幕乱码修复来自 Windows 实机确认，完整新包回归待 Windows 拉取后执行。
>
> 记录时间：2026-08-10 CST

## 症状一：FunASR 中文字幕乱码

Windows 默认 Python 标准输出编码不一定是 UTF-8。`runtime/funasr/runtime.py` 使用 `ensure_ascii=False` 输出真实中文 JSON；Electron 若按 UTF-8 解码非 UTF-8 字节，字幕会乱码。

修复固定在共享 FunASR 转写入口 `electron/video-translation-asr.ts`：调用 Python 时同时传入：

```text
PYTHONIOENCODING=utf-8
PYTHONUTF8=1
```

该入口同时服务原片字幕识别和完整配音块识别，因此只修一处，不在各业务按钮重复补编码逻辑。原有 `PYTORCH_ENABLE_MPS_FALLBACK=1` 保留，不影响 macOS。

## 症状二：翻译模式缺少参考音按钮

“按提示词生成角色参考音”属于角色配音固定动作，不应受 `translationMode` 隐藏。按钮模板已删除 `v-if="!translationMode"`，翻译产品固定显示：

1. 生成角色提示词
2. 按提示词生成角色参考音
3. 进入成片工作台

按钮仍受 API Key、角色提示词和最终配音完整性门禁约束；修复只改变正确的可见性，不放宽执行条件。

## 验证

- Windows 原始报告确认上述 UTF-8 环境变量能消除中文字幕乱码。
- Mac 工作区 `pnpm exec vue-tsc --noEmit` 通过。
- Mac 工作区 `pnpm test`：`200/200` 通过。
- 合同测试固定 `PYTHONIOENCODING`、`PYTHONUTF8` 和翻译模式三个角色配音按钮，防止回退。
- 待验证：Windows 拉取新提交、重新构建安装包后，再跑一次真实 FunASR 中文字幕识别和三个按钮桌面检查。

## Windows 同步方式

Windows 端不要重复手工提交相同修改，直接更新 Mac 推送的主分支：

```bash
git pull origin main
```

随后在 Windows 本机重新执行依赖安装和安装包构建。

## 来源与追溯

- 来源角色：用户从 Windows 机器带回的已验证修复说明、当前工作区实现与 2026-08-10 自动测试。
- 原始说明：`docs/Windows端修复说明-带回Mac手动修改.md`，`sha256:abb559b40f40afda6bd7fa4a0ead67edfef9e3f8853c59bbd3cc83333512bcf8`。
- `electron/video-translation-asr.ts`：`sha256:102ac8acbe54d2b70bd6a1e15e93d172fac11cab022aabf9db42f2adcb054ca9`。
- `src/views/Home/components/VideoRender.vue`：`sha256:f15b276c430995792d47382ab61649e8e1bfb2a4015adb5444f3b4777d425d54`。
- `src/runtime/sdd-contract.test.ts`：`sha256:c7bce432da95ae67627f138f865236c47de4c8a8cba6105ec1230376510bbd1b`。
- `src/runtime/videoTranslation.test.ts`：`sha256:27a76764fb6c5eafa4bc6717826ad0e675965ab31ae7ce1c46555f4d47a45399`。
- 当前会话指纹：未计算（会话不是项目内文件）。
- 已处理范围：Windows FunASR 输出编码和翻译模式参考音按钮可见性；未把尚未执行的新安装包 Windows 回归写成已完成。
