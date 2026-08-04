# TDD-02：声音引擎与角色音色绑定

> 日期：2026-08-03
> 状态：已完成并验证
> 上位设计：`docs/导演分镜时间轴与角色配音编排SDD.md`
> 前置依赖：`docs/tdd/00-共享生产合同与状态机TDD.md`、`docs/tdd/01-项目总监与制作路线TDD.md`

## 1. 目标

在不生成正式旁白或逐句对白的前提下，完成两项前置能力：用户可以在现有生成设置中检测和控制本地声音引擎；剧情片可以把项目总监确认的角色 `entityId` 稳定绑定到一个真实可用的 IndexTTS2 音色包。

## 2. 本轮范围

1. 本地声音设置增加 `Qwen3-TTS VoiceDesign | IndexTTS2` 引擎选择。
2. 两个本地引擎都显示运行时、模型路径和真实检测结果；IndexTTS2 增加启动、停止和进程状态。
3. 只停止本 APP 启动的 IndexTTS2 子进程，不处理外部同类进程；APP 退出时清理本 APP 启动的进程。
4. 资产页只为项目总监确认的角色提供音色绑定；旁白绑定留给宣传片正式旁白 TDD。
5. 可选音色只包含已审核、已授权、可克隆并具有已确认 IndexTTS2 情绪包的档案。
6. 绑定写入 `wiki/声音/角色/<speakerId>.md`，角色页面与声音页面双向链接；同项目继续使用该绑定，跨项目不按名称继承。

## 3. 明确不做

- 不生成正式旁白、不运行 Faster-Whisper。
- 不创建逐句对白任务、空 WAV、待处理数或配音完成数。
- 不调用 Gemini，不实现配音字幕工作台。
- 不新增设置页面、弹窗或音色情绪试听播放器。
- 不把 IndexTTS2 PID、端口或启动时间写入创作项目 Wiki。

## 4. 声音引擎合同

本地引擎代码固定为：

```ts
type LocalVoiceEngine = 'qwen3-tts' | 'indextts2'
type VoiceServiceState = 'unchecked' | 'unavailable' | 'stopped' | 'starting' | 'running' | 'failed'
```

IndexTTS2 状态至少返回：

```ts
interface IndexTtsServiceStatus {
  engine: 'indextts2'
  state: VoiceServiceState
  available: boolean
  runtimePath?: string
  modelPath?: string
  pid?: number
  startedAt?: string
  error?: string
}
```

规则：

- “检测”只验证 CLI 与模型前置条件，不加载权重、不生成音频。
- “启动服务”启动本 APP 管理的常驻服务；重复点击不得创建第二个进程。
- “停止服务”只停止本 APP 记录的子进程；没有受管进程时返回当前检测状态。
- 进程意外退出后状态必须变成 `failed` 或 `stopped`，不能继续显示运行中。
- Qwen3-TTS 延用现有本地状态检测；它不是常驻服务，不显示启动/停止按钮。

## 5. 设置 UI

沿用现有 API 配置弹窗中的本地声音区域：

```text
配音模式  [云端 | 本地]
本地引擎  [Qwen3-TTS VoiceDesign | IndexTTS2]
状态      运行时 / 模型 / 真实状态
动作      检测；IndexTTS2 另有启动服务 / 停止服务
```

- 切换本地引擎只改变本机生成能力选择；不自动切换云端/本地模式。
- 引擎选择属于应用会话设置，不属于某个创作项目 Wiki。
- 不增加额外保存按钮；继续使用现有设置弹窗保存行为。

## 6. 角色声音绑定合同

剧情片资产阶段的 `speakerId` 就是项目总监角色资产 `entityId`。绑定前必须同时满足：

1. 当前项目已确认且路线为 `drama`。
2. `speakerId` 存在于 `wiki/项目/项目总监.md` 确认的角色白名单。
3. 音色档案 `quality=approved`、`rights=commercial-cleared`、`cloneReady=true`。
4. 对应声音包中存在 `status=confirmed`、`model.id=indextts-2` 的 `manifest.json`，参考音频和至少一个情绪音频可读。

绑定产物：

```text
wiki/声音/角色/<speakerId>.md
wiki/资产/角色/<speakerId>.md
```

声音页面保存 `speakerId`、`voiceProfileId`、`status: approved`，并链接角色页面与声音库页面；角色页面增加声音页面回链。重新绑定覆盖同一个声音页面，不创建第二个角色身份。

## 7. UI 交互

- 资产卡只有角色显示真实绑定图标；场景和道具不显示声音状态。
- 选中角色后，右栏只显示当前绑定、音色包选择、“打开文件夹”和“绑定/更换”。
- 下拉只展示符合绑定合同的 IndexTTS2 音色包。
- 绑定成功后卡片立即显示“音色已绑定”；不显示八种情绪播放器。
- 绑定失败保留原绑定并显示真实错误。

## 8. 测试先行清单

1. IndexTTS2 检测区分运行时缺失、模型缺失和可启动状态。
2. 启动服务去重，状态包含受管 PID；停止只终止受管进程。
3. 进程异常退出后不再显示运行中。
4. 可绑定音色过滤掉未审核、未授权、不可克隆或没有确认情绪包的档案。
5. 绑定拒绝非项目总监角色、非剧情路线和非法 `speakerId`。
6. 绑定先校验后写入，失败时不覆盖旧声音页面。
7. 成功绑定后角色页面和声音页面互相双链。
8. 设置 UI 和资产 UI 只有本轮要求的最小控件，不出现逐句任务或情绪播放器。

## 9. 验收标准

- 定向测试先红后绿。
- 全量 `pnpm test`、`pnpm exec vue-tsc --noEmit`、`git diff --check` 通过。
- 桌面 APP 中可见双本地引擎、IndexTTS2 真实状态及启停按钮；剧情角色可选择真实可用音色包并看到绑定状态。
- 不新增依赖，不实现 TDD-03 及之后的音频生成、转录和剪辑功能。

## 10. 执行结果

- 设置弹窗已提供 `Qwen3-TTS VoiceDesign | IndexTTS2` 本地引擎选择；IndexTTS2 支持真实检测、启动、停止和受管进程清理。
- 本机真实启动使用 `/Users/by3/.local/bin/uv run webui.py`，模型目录为 `/Users/by3/Documents/peiyin-pyvideotrans/models/IndexTTS-2`；`/config` 健康检查、UI 运行中状态和停止清理均已验收。
- 剧情角色绑定已限制为项目总监白名单角色和已确认 IndexTTS2 声音包，并写入角色/声音双向 Wiki 链接；旁白绑定和逐句 WAV 未提前实现。
- 定向测试 `54/54`、全量测试 `122/122`、`pnpm exec vue-tsc --noEmit` 和 `git diff --check` 通过；桌面设置 UI 已验证无遮挡和完整按钮状态。
