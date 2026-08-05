# TDD-12：项目存储位置与资产用途版本

> 日期：2026-08-05
> 状态：已执行，待桌面人工验收
> 前置依赖：[[../tdd/08-项目与剧集数据边界TDD|TDD-08]]、[[../tdd/09-项目与剧集UITDD|TDD-09]]
> 关联架构：[[../wiki/架构/项目Wiki与资产主导工作流|项目 Wiki 与资产主导工作流]]

## 1. 目标

本轮以“开发期重新设计产品”为前提，不兼容旧测试项目，不迁移旧 `media-runs` 数据，不保留旧项目路径。直接建立正式产品应该使用的新项目结构：

1. 用户创建项目时选择项目存储位置，项目文件夹使用可读名称；程序保留稳定的内部 `projectId`。
2. 资产图片把“来源”和“用途”分离。搜索、上传、生成是三种来源；参考图和当前使用图是两种用途。用户上传或搜索到的图片可以直接设为当前资产，不必重复调用生图模型。

项目 Wiki、状态、媒体、任务和资产全部属于项目根目录；API Key、数据库、模型缓存、全局声音库和运行时仍属于应用级数据，不进入项目目录。

## 2. 新项目所有权模型

### 2.1 稳定 ID 与可读目录名

```ts
type ProjectLocation = {
  projectId: string       // 稳定内部 ID，不因改名或移动变化
  displayName: string     // UI 项目名
  rootPath: string        // 用户选择的项目根目录，仅存应用注册表
  lastOpenedEpisodeId: string
}
```

新建项目流程：

1. 用户点击“新建项目”。
2. 系统打开“选择或新建项目文件夹”目录选择器。
3. 用户选中的文件夹本身就是项目根；例如选中 `D:/文稿/西游小剧场`：

```text
D:/文稿/西游小剧场/
```

4. 项目显示名直接取该文件夹的 basename，不再输入另一个名称，也不再创建日期子目录。
5. 所选目录必须为空。已含 `project.json` 时提示使用“打开已有项目目录”；其他非空目录直接拒绝，防止污染用户资料。
6. 程序直接在所选目录写入 `project.json`，生成第 1 集和项目 Wiki。
7. 应用级注册表写入 `projectId -> rootPath`，应用重启后通过稳定 ID 找回项目。

文件夹名只负责给用户识别，不参与数据关联。项目改名默认只修改 `displayName`，不自动重命名物理文件夹；用户需要改变物理目录时使用“移动项目”操作。

### 2.2 应用级与项目级数据边界

应用级数据继续放在 Electron `userData`：

```text
data.db
media-projects.json       projectId -> rootPath 注册表
jiucai-api-key.bin
seed-audio-api-key.bin
voice-library/
models/、local-tts/
```

每个项目根目录只放项目内容：

```text
西游小剧场/
├── project.json
├── shared-state.json
├── episodes/
├── assets/
├── inputs/
├── .raw/
└── wiki/
```

注册表是“项目在哪里”的事实源；项目内 `project.json` 是“这个目录属于哪个项目”的事实源。二者的 `projectId` 必须一致，否则拒绝打开。

### 2.3 项目移动与重新打开

开发期项目可以被用户直接移动到其他目录。正式动作不是扫描电脑，而是提供：

```text
打开已有项目目录
→ 选择包含 project.json 的项目根
→ 校验 projectId、schemaVersion 和目录结构
→ 更新 projectId -> rootPath 注册表
→ 通过同一项目 ID 继续工作
```

移动项目只改变注册表中的根目录，不改写项目内任何 Wiki、状态、资产 ID 或媒体相对路径。

## 3. Wiki 与路径不变量

- 所有项目内媒体、资产和 Markdown 链接都保存为相对项目根路径。
- Wiki 双链只引用项目内相对页面，例如 `[[文稿/episode-001/确认文稿]]`、`[[资产/角色/asset-xxx]]`。
- Wiki 图片、视频、音频嵌入只使用相对路径；禁止写入 `/Users/...`、`/Volumes/...` 或 `D:\...`。
- `short-video-media://asset` 协议通过 `projectId + relativePath` 调用统一项目根解析器；项目移动后只要注册表已更新，媒体预览继续有效。
- 项目根解析、Wiki 读写、媒体导出、媒体预览、任务恢复、FFmpeg 输入和声音库项目反链必须全部调用同一个 `resolveProjectRoot(projectId)`，禁止各模块自行拼接 `userData/media-runs`。
- 项目目录名、项目显示名和 `projectId` 永远不是 Wiki 双链目标；Wiki 只依赖稳定 ID 对应的项目内相对文件。

## 4. 资产来源与用途模型

### 4.1 最小数据合同

```ts
type AssetVersionSource = 'search' | 'upload' | 'generated'

type AssetVersion = {
  id: string
  source: AssetVersionSource
  relativePath: string
  createdAt: string
  designFingerprint?: string
  derivedFromVersionId?: string
  sourceUrl?: string
  sourcePageUrl?: string
  searchQuery?: string
  generatedBySkill?: string
}

type ReferenceAsset = {
  // 现有角色、场景、道具、设计 JSON 和版本字段继续保留
  versions: AssetVersion[]
  activeVersionId?: string // 当前正式用于分镜、视频和 Wiki 的版本
}
```

规则：

- 搜索结果下载到项目后，`source = search`。
- 用户从电脑导入图片，`source = upload`。
- 生图模型产物，`source = generated`。
- `source` 只记录来源，不决定能否正式使用。
- `activeVersionId` 可以指向任意来源的版本。没有 `activeVersionId` 时，必需资产不能通过正式资产门禁。
- 参考图是生成输入；当前使用图是下游生产引用。二者可以指向同一张图片，但必须在 UI 上明确显示用途。
- 版本切换不删除任何旧版本；删除当前版本前必须先切换其他版本或明确回到待确认状态。

### 4.2 用户流程

资产卡片显示两个区域：

```text
参考图
  搜索/上传得到的图片，可预览、删除、作为生图输入

当前使用图
  activeVersionId 指向的正式版本，分镜、视频和 Wiki 都引用它
```

最小按钮集合：

- `添加参考图`：搜索或上传，写入版本集合，不自动成为正式资产。
- `生成项目风格图`：使用参考图调用图像模型，追加一个 `generated` 版本。
- `设为当前使用图`：任意版本均可成为 `activeVersionId`；不调用模型、不产生费用。
- `版本选择器`：在搜索、上传和 AI 生成版本之间切换。
- `在文件夹中显示`：打开该版本的实际文件位置。

用户上传上一版本已经满意的图片时，系统不猜测它原来是否由本产品生成；先记录为 `upload`，用户点击“设为当前使用图”即可直接使用。

### 4.3 下游门禁与失效

- 必需资产都有 `activeVersionId` 才算正式就绪，不再要求 `source === 'generated'`。
- 分镜图、分镜视频、Wiki 资产页和提示词只读取当前 `activeVersionId` 的相对路径。
- 切换 `activeVersionId` 后，引用该资产的分镜图和视频标记为 `stale`；文稿、项目总监、其他资产和旧媒体文件保留。
- 仅添加或删除未激活的参考图，不使下游失效。
- 生成任务记录输入参考版本 ID、生成版本 ID、模型、时间和设计指纹，Wiki 保留完整证据。

## 5. 主进程与 IPC 合同

新增并统一使用：

```ts
resolveProjectRoot(projectId): string
registerProjectRoot(projectId, rootPath): void
createProjectAt(projectId, rootPath, state): ProjectManifest
openProjectDirectory(rootPath): ProjectManifest
```

约束：

- 所有项目文件操作先通过 `resolveProjectRoot`，再做路径边界校验。
- 所有 IPC 继续显式传递 `projectId` 和 `episodeId`，不能通过当前 UI 状态猜测项目。
- 新项目创建、注册表更新和 `project.json` 写入必须使用原子写入；任何一步失败都不能留下半注册项目。
- 上传、搜索下载和模型生成的文件都复制到项目根受控目录，运行时不依赖用户原始路径。
- `project-show`、`cloud-show-media`、`cloud-export-media`、`cloud-resolve-media`、媒体协议、任务恢复和声音库索引必须使用同一个根解析器。

## 6. Wiki 记录

每个项目 Wiki 记录：

- 项目显示名、稳定 `projectId`、剧集清单；
- 每个资产版本的版本 ID、来源、相对路径、创建时间和当前使用标记；
- 当前资产版本切换及受影响的分镜/视频；
- 项目移动后的新根目录可读名称和操作时间，但不写机器绝对路径。

Wiki 不写入 API Key、数据库路径、模型缓存路径或机器绝对路径。

## 7. UI 验收

1. 新建项目时可以选择或新建项目文件夹；所选文件夹本身直接成为项目根，显示名与文件夹名一致。
2. 顶部文件夹按钮打开当前项目根目录，不再打开隐藏的应用数据目录。
3. 应用重启后，项目列表通过注册表恢复用户选择的项目根目录。
4. 可以选择一个包含 `project.json` 的项目目录重新打开，项目 ID 不变。
5. 资产卡片明确区分“参考图”和“当前使用图”。
6. 搜索图、上传图和 AI 图都能设为当前使用图。
7. “设为当前使用图”不调用模型、不产生云端任务。
8. 版本切换后，新生成内容使用新版本，旧内容和旧版本不被删除。
9. Pinia/localStorage 残留的 `runId` 不在项目注册表时，启动、新建项目和打开已有项目都不得尝试保存该 ID；界面先清空无效状态，再直接进入新建或打开流程。

## 8. 测试先行验收

### 项目存储与 Wiki

1. 选择临时空目录 `/文稿/功夫女友`，验证 `project.json` 直接写入该目录、显示名为“功夫女友”，且不产生 `/功夫女友/新项目-YYYYMMDD/`。
2. 验证 `projectId -> rootPath` 注册表与项目内 `project.json.projectId` 一致；不一致时拒绝打开。
3. 将完整项目目录复制到另一临时目录，更新注册表后重启应用，Wiki 页面、双链、图片、视频和音频全部可读。
4. 断言项目内所有 JSON 和 Markdown 不包含机器绝对路径。
5. 断言媒体协议、导出、任务恢复、FFmpeg 输入和声音库项目反链都能从新根目录解析。
6. 移动项目目录后只更新注册表，不修改 `projectId`、资产 ID、Wiki 相对链接和媒体相对路径。
7. 项目名相同不能覆盖已注册项目；项目根目录中缺少 `project.json` 或目录结构不完整时拒绝打开。
8. 模拟本地缓存残留未注册 `runId`，验证新建和打开入口不会调用 `cloud-save-state`，自动保存监听也不会提交该 ID。
9. 选择普通非空目录时拒绝创建且保留原文件；选择已含 `project.json` 的目录时提示使用“打开已有项目目录”。

### 资产来源与版本

1. 搜索、上传、生成三种来源写入正确的 `source`。
2. 上传或搜索版本点击“设为当前使用图”后，资产通过正式门禁且没有云端生图任务。
3. 必需资产只有参考图、没有 `activeVersionId` 时，分镜按钮禁用并说明原因。
4. 切换当前版本只使引用该资产的下游媒体失效，不清除其他版本或 Wiki 证据。
5. 删除当前版本必须先切换其他版本；删除未激活版本不改变当前生产链。
6. 生成项目风格图会追加版本，不覆盖参考图，并记录输入版本和模型证据。

### 工程检查

```bash
pnpm test
pnpm exec vue-tsc --noEmit
git diff --check
```

## 9. 明确不做

- 不兼容旧测试项目，不迁移旧 `media-runs` 项目，不为旧状态增加兼容分支。
- 不把应用配置、API Key、数据库和模型缓存迁移到项目目录。
- 不自动扫描用户电脑寻找旧图片。
- 不删除当前项目的旧资产版本；版本删除必须是用户明确操作。
- 不为“下载”新增独立资产类型；搜索下载统一记录为 `source=search`。
- 不在本轮增加云端项目同步、跨设备自动发现或多人协作权限。

## 10. 执行结果

- 新项目使用系统目录选择器；用户选中的空文件夹本身直接成为项目根，文件夹名就是初始项目显示名，不再追加“新项目-日期”子目录。应用级 `media-projects.json` 只保存 `projectId -> rootPath`，项目内 `project.json` 保存稳定 ID 和结构版本。
- 创建入口已允许初始化用户选中的空目录；普通非空目录会被拒绝且不改动原文件，已有项目目录会引导使用“打开已有项目目录”。初始化失败时仅清理本次生成内容，保留用户原本选中的根目录。
- 启动恢复、新建项目、打开项目和自动保存统一增加注册表门禁：未注册的缓存 `runId` 不允许写盘，不再阻塞系统新建/打开对话框。
- `resolveProjectRoot(projectId)` 已成为 Wiki、媒体、任务恢复、FFmpeg、导出预览和声音库反链的统一项目根解析入口；未注册项目直接拒绝访问，不兼容或迁移旧 `media-runs` 测试项目。
- 顶部已增加“打开已有项目目录”；新建、打开、项目列表、最近项目和“在文件夹中显示”均使用注册表根目录。
- 资产版本已分离来源与用途：`search | upload | generated` 只描述来源，`activeVersionId` 决定当前正式使用图。搜索图、上传图和 AI 图均可直接设为当前使用图；没有当前版本时不能通过正式资产门禁。
- 分镜图、Grok 多图参考和资产 Wiki 投影只读取当前使用版本；资产页记录版本来源、用途、项目相对路径和创建时间，不写机器绝对路径。
- 验证：`pnpm test` 通过 `151/151`，包含所选空目录直接成为项目根、非空目录不被改动、已有项目目录引导打开、项目目录移动后重新打开，以及未注册缓存 ID 不参与显式/自动保存的回归；`pnpm exec vue-tsc --noEmit`、`git diff --check` 与 `pnpm build` 均退出成功；macOS universal APP 和 DMG 已生成。尚未完成新目录选择器的用户桌面操作验收及 Windows 路径验收。
