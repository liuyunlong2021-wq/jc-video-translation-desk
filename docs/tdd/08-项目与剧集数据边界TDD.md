# TDD-08：项目与剧集数据边界

> 日期：2026-08-04
> 状态：已完成
> 上位设计：`docs/多集项目与共享资产架构SDD.md`
> 前置依赖：`docs/tdd/00-共享生产合同与状态机TDD.md`

## 1. 目标

建立“一项目多集”的真实数据边界。项目保存共享资产和剧集摘要；每集保存独立制作状态与媒体。所有本集产物显式使用 `episodeId`，不再把 `episode-001` 硬编码为唯一一集。

本轮只建立数据和路径底座，不实现顶部新建集/切集 UI、项目总监资产自动复用、多集 Wiki 反链或异步任务抽屉筛选。

## 2. 测试先行合同

### 2.1 项目清单

新建项目必须创建：

```text
project.json
shared-state.json
episodes/episode-001/state.json
```

`project.json` 必须包含：

```ts
episodes: [{ episodeId: 'episode-001', episodeNumber: 1, title: '第 1 集', stage: 'draft', ... }]
lastOpenedEpisodeId: 'episode-001'
wikiVersion: 2
```

项目目录不再使用根 `state.json` 作为制作事实源。

### 2.2 共享状态与本集状态

- `shared-state.json` 只持久化项目默认配置、共享 `referenceAssets` 和角色声音相关项目状态。
- `episodes/<episodeId>/state.json` 保存当前集完整制作状态，必须同时包含正确 `runId/projectId` 与 `episodeId`。
- `loadProject(projectId, episodeId)` 只读取一个共享状态和指定集状态；即使项目有 100 集，也不能读取其余 99 个完整状态。
- 保存当前集只能覆盖对应 `episodes/<episodeId>/state.json`，不得修改其他集状态。

### 2.3 路径隔离

这些本集产物必须显式接收 `episodeId`：

- 确认文稿和本集项目总监文档；
- 分镜总览、镜头 Markdown、分镜图和视频；
- Faster-Whisper JSON/SRT；
- `editing-timeline.json`；
- 中英文字幕；
- IndexTTS2 逐句音频、本集音频和对白资产；
- 人声分离、混音和音频处理记录；
- 画面母版与最终成片；
- 本集成片页和制作索引。

同一 `projectId` 下 `episode-001` 和 `episode-002` 写同类产物时，绝对路径必须不同且都位于当前项目目录内。

### 2.4 状态序列化

- Pinia 当前制作状态增加非空 `episodeId`。
- 新建项目默认 `episodeId = episode-001`。
- 序列化和恢复必须保留 `episodeId`。
- 项目共享资产路径仍相对项目根；本集媒体路径允许位于 `episodes/<episodeId>/`，仍保存为项目根相对路径。
- 不增加旧根 `state.json` 兼容或迁移分支。

## 3. 最小数据合同

```ts
type EpisodeManifest = {
  episodeId: string
  episodeNumber: number
  title: string
  stage: string
  createdAt: string
  updatedAt: string
}

type ProjectManifest = {
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  episodes: EpisodeManifest[]
  lastOpenedEpisodeId: string
  wikiVersion: 2
}
```

第一轮共享状态直接从当前 Store 状态投影最少字段，不新增数据库、仓储层、事件总线或第二套 Store。

## 4. 主进程边界

新增并统一使用：

```ts
getEpisodeDir(projectId, episodeId)
loadProjectState(projectId, episodeId)
saveMediaState(projectId, episodeId, state)
```

- `projectId` 和 `episodeId` 都只允许安全 ID 字符。
- 路径解析必须验证结果仍在对应项目/剧集目录内。
- 本集 IPC 必须显式传递 `episodeId`，不能从最近打开项或界面当前值推断。
- 项目共享资产 API 继续只使用 `projectId + entityId`。

## 5. Wiki 路径

本轮把现有单集 Wiki 写入改为：

```text
wiki/文稿/<episodeId>/确认文稿.md
wiki/项目总监/<episodeId>.md
wiki/分镜/<episodeId>/导演总览.md
wiki/分镜/<episodeId>/镜头/<shotId>.md
wiki/分镜图/<episodeId>/<shotId>.md
wiki/视频/<episodeId>/<shotId>.md
wiki/转录/<episodeId>/<mediaId>-whisper.json
wiki/字幕/素材/<episodeId>/<mediaId>-whisper.srt
wiki/剪辑/<episodeId>/editing-timeline.json
wiki/声音/<episodeId>/...
wiki/字幕/<episodeId>-zh.srt
wiki/字幕/<episodeId>-en.srt
wiki/成片/<episodeId>.md
wiki/制作/<episodeId>.md
```

共享资产和角色声音 Wiki 路径保持不变。

## 6. 明确不做

- 不做旧项目迁移或兼容。
- 不做新建集、切集或重命名 UI。
- 不做项目总监 `reuse/create/review`。
- 不做跨集反链计算。
- 不做删除、复制、排序、季管理或批量生成。
- 不把 100 集完整状态塞进一个 JSON。

## 7. 验收测试

1. 新项目自动创建第 1 集三类状态文件。
2. 项目清单模拟 100 集时，加载第 73 集只读取共享状态和第 73 集状态。
3. 保存第 2 集后，第 1 集状态字节内容不变。
4. 两集分别生成时间轴、字幕、配音索引和成片索引，路径互不覆盖。
5. `episodeId` 非法、缺失或与状态不一致时拒绝写入。
6. 源码业务写入中不再出现固定 `episode-001` 路径；仅测试样例和默认首集常量允许出现。
7. 全量 `pnpm test`、`pnpm exec vue-tsc --noEmit` 和 `git diff --check` 通过。

## 8. 执行结果

- 项目清单升级为 Wiki v2，并记录剧集摘要与最近打开剧集。
- 项目共享状态写入 `shared-state.json`，本集状态写入 `episodes/<episodeId>/state.json`。
- 文稿、项目总监、分镜、媒体、转录、剪辑时间轴、配音、字幕、音频处理和成片均显式使用 `episodeId`。
- 新项目只用一个默认首集常量；生产代码不再固定写入 `episode-001` 业务路径。
- 已通过 100 集清单、跨集状态隔离、跨集产物隔离、非法与错配 ID 测试。
