# Desktop 3D 导演预演与 Storyboarder 能力融合 SDD

> 状态：待实施
> 编写日期：2026-08-03
> 适用项目：点一点（短视频工厂）
> 目标平台：Electron Desktop；Web 不实现高级 3D 导演预演
> 执行原则：分阶段落地，每阶段独立验证；不整套移植 Storyboarder

## 1. 一句话目标

在现有“分镜”阶段内增加一个 Desktop-only 的“3D 导演预演”工作区，让 AI 或用户用六类可摆姿势的人物、道具、场景和真实摄影机先完成走位、表演、构图与机位，再把 3D 截图作为现有 GPT Image 分镜图的构图参考，继续进入单镜视频、配音和成片链路。

这不是新增一套分镜系统，也不是把 Storyboarder 整个塞进产品。它是现有导演分镜与分镜图之间的一层可编辑空间草图。

```text
文稿
  -> 资产
  -> 导演分镜（现有 Markdown + StoryboardSegment）
  -> 3D 导演预演（本 SDD，分镜阶段内）
  -> 分镜图（现有 GPT Image 2）
  -> 单镜视频（现有 Veo）
  -> 配音 / 剪辑 / FFmpeg 成片（现有链路）
```

## 2. 为什么放在点一点，不放在韭菜盒子 Studio

点一点的主链已经以镜头为中心，拥有文稿、角色/场景/道具资产、导演分镜、分镜图、单镜视频和最终成片。3D 预演产生的机位、走位和构图可以直接服务下一步分镜图，是同一条生产链上的缺口。

韭菜盒子 Studio 的核心是通用 Wiki、记忆、写作和轻量空间表达。把完整骨骼、IK、摄影机、GLB 资产与 3D 编辑器放进去，会让通用产品承担一套导演专用工作台，产品边界和包体都会变重。

因此锁定以下决定：

- 完整能力归属点一点 Desktop。
- 不在点一点顶部增加第八个阶段。
- 入口放在现有“分镜”阶段内部，与文字分镜和分镜图并列协作。
- Web 端不加载人物 GLB、IK 和编辑器资源；最多只读已经生成的预演缩略图。

## 3. 用户要解决的实际问题

当前导演 Skill 能写出景别、角度、运镜、动作起止和画面提示词，但这些仍是文字。生图前缺少一个能直接检查的空间层：

- 人物到底站在哪里、面向哪里；
- 多人之间的距离、遮挡、视线和轴线是否成立；
- 人物姿态是否支持动作意图；
- 镜头焦段、机位高度和俯仰是否真的得到目标景别；
- 同一场景的相邻镜头是否连续；
- 提示词中的构图是否有一张明确参考图。

3D 预演不追求最终画质，只追求导演决策可见、可改、可保存、可传给下游。

## 4. 范围与非目标

### 4.1 必须完成

- 六类人物：成年男、成年女、少年男、少年女、儿童、婴儿。
- 人物身高、头部比例、肤色/服装基础颜色和健壮/瘦弱/肥胖 Morph。
- 完整骨骼编辑：以头、髋、手、脚 IK 为主，局部关节旋转为兜底。
- 姿势、手势、镜像、恢复默认、自定义预设。
- 人物走位、旋转、落地、复制、分组、锁定、隐藏、多选。
- 多机位、焦段、景别、角度、pan/tilt/roll 和构图辅助线。
- 镜头级 3D 状态保存、恢复、复制与缩略图。
- 预演截图绑定现有镜头，作为分镜图生图参考。
- 第二阶段资产：道具、自定义 GLB、附件、房间/环境和可摆放灯光。
- AI 根据现有导演分镜和资产自动建立初始预演，用户再人工修正。
- macOS 与 Windows Desktop 打包和真机验收。

### 4.2 明确不做

- 不移植 Storyboarder 的 React、Redux 或 Electron 外壳。
- 不引入 Storyboarder 文件格式，不创建第二套项目格式。
- 不复制其绘画、Fountain、Photoshop、PDF、GIF、FCP、PSD 导出流程。
- 不做 VR/XR、手机遥控、远程客户端和云端多人协作。
- 不调用 Storyboarder 的线上服务，不上传用户姿势。
- 首期不接旧表情贴图，不做雨、雾、爆炸和体积特效。
- 不把 3D 预演直接当最终动画渲染器；最终视频仍走现有视频生成与成片链路。
- 不为了本功能重构现有媒体任务、配音、剪辑或 FFmpeg 架构。

## 5. Storyboarder 来源、授权与审计基线

来源仓库：<https://github.com/wonderunit/storyboarder>

本次源码审计使用的本地快照 commit：

```text
8b81a25c71d5f7ca46e8d5b8e3d4f7b3968f95c2
```

用户已确认从项目作者处取得微信书面授权，允许使用相关能力和资产。执行前仍必须完成以下留档，不得仅凭本页代替授权凭证：

1. 保存授权截图或导出记录到项目外的私密合规存档；Wiki 只记录存放位置，不复制私人聊天内容。
2. 明确授权是否覆盖源码、六个人物 GLB、姿势/手势 JSON、道具、附件、修改、分发和商业发布。
3. 重新拉取用户指定的最终上游版本，记录 commit、文件清单和 SHA-256；本次审计 commit 只是技术基线，不自动代表最终选用版本。
4. 检查仓库和具体资产的许可证/署名要求。README 只链接其开源许可说明，本次快照根目录未发现可直接据此下结论的标准 LICENSE 文件，因此不得擅自写成 MIT 或“无限制”。
5. 在应用“关于/第三方许可”中按最终授权要求保留署名或许可文本。

## 6. 已从 Storyboarder 源码验证的资产

### 6.1 六类人物

源目录：`src/data/shot-generator/dummies/gltf/`

| 文件 | 约体积 |
|---|---:|
| `adult-male.glb` | 2.4 MB |
| `adult-female.glb` | 2.0 MB |
| `teen-male.glb` | 1.9 MB |
| `teen-female.glb` | 1.9 MB |
| `child.glb` | 1.6 MB |
| `baby.glb` | 1.0 MB |

人物合计约 11 MB。每个 GLB 有 67 个 joint 节点；排除 13 个无编辑意义的 `leaf.*` 末端节点后，有 54 个有效关节。六个模型的有效骨骼名称完全一致，只有部分 `leaf.*` 节点排序不同，因此可以共享一套骨骼映射、姿势、手势和 IK 逻辑。

有效骨骼覆盖：

- `Hips`、`Spine`、`Spine1`、`Spine2`、`Neck`、`Head`；
- 左右眼；
- 左右肩、上臂、前臂、手；
- 十指各三节；
- 左右大腿、小腿、脚和脚趾根。

六个模型自身没有 animation clips。人物动作不是播放模型内动画，而是把姿势数据中的骨骼旋转写回 skeleton。

### 6.2 姿势、手势与其他资产

- 342 个全身姿势：`src/js/shared/reducers/shot-generator-presets/poses.json`，约 1.6 MB。
- 32 个手势：`hand-poses.json`，约 96 KB。
- 6 个旧表情：`emotions.json`；视觉风格不统一，首期不接。
- 46 个道具定义、51 个 GLB，道具约 10 MB。
- 7 个附件，约 0.9 MB，包括手枪、背包、眼镜、口罩、胡子和两种头发。
- 人物支持身高、头部比例、颜色以及健壮/瘦弱/肥胖 Morph。

### 6.3 源码体量结论

- 原 Shot Generator 相关源码约 40,000 行。
- IK/控制器相关实现约 9,500 行。
- 原代码依赖旧版 Three.js API、React/Redux 状态和 Storyboarder 自身运行环境。

结论：可以复用资产、数据格式、骨骼命名和交互思想；不得整目录复制原 Shot Generator。执行者应在目标项目现有 Vue 3 + TypeScript 架构内实现最小所需能力。

## 7. 点一点当前事实与缺口

当前技术栈为 Electron 22、Vue 3、TypeScript、Vite、Vuetify、Pinia。`package.json` 当前没有 `three`，也没有 3D 场景、GLTFLoader、骨骼状态或 3D 编辑 UI。

现有 `StoryboardSegment` 已经包含：

- `index`、`storyBeat`、镜头职责与剪辑处理；
- `shotSize`、`cameraAngle`、`cameraMovement`；
- `startState`、`actionProgression`、`endState`；
- `referenceAssetIds`；
- `storyboardImagePrompt`、`videoPrompt`；
- 声音、对白、时长、图片、视频和剪辑状态。

必须先修正一个数据合同：当前 `StoryboardSegment` 没有持久化 `shotId`，部分代码用 `shot-${index.padStart(3)}` 临时推导。3D 状态不能只绑定可变化的数组位置。阶段 0 应给每个镜头固化稳定 `shotId`；旧数据迁移时只在缺失时按现有规则生成，之后即使重排也不得改 ID。

资产已有稳定 `entityId`。3D 人物、道具和场景实例必须引用现有资产 ID，不得另造一套“3D角色 ID”替代业务实体身份。

## 8. 产品入口与界面合同

### 8.1 入口

保持现有顶部阶段不变。在“分镜”工作区中增加视图切换：

```text
文字分镜 | 3D 预演 | 分镜图
```

只在 Electron Desktop 显示“3D 预演”。Web 环境不加载 Three.js 和 GLB，可只显示已有预演缩略图或提示该能力需桌面版。

### 8.2 三栏职责

- 左栏：沿用镜头列表；显示每镜预演状态和缩略图。
- 中栏：全尺寸 Three.js 场景，不套装饰卡片；这里完成选择、走位、骨骼、摄影机和截图。
- 右栏：当前选中对象的属性。对象不同，显示人物、关节、道具、灯光或摄影机的对应控件。
- 顶部/画布工具条：选择、移动、旋转、缩放、落地、复制、删除、撤销、重做、构图线、保存、截图。

不要把 54 个关节做成 54 行永久滑杆。默认在人物身上显示头、髋、双手、双脚等导演常用控制点；点击“高级关节”后，才允许点选具体骨骼并使用旋转环。

### 8.3 完整用户流程

1. 用户完成文字导演分镜。
2. 打开某个镜头的“3D 预演”。
3. 若该镜头没有预演，系统可从上一个镜头复制场景连续性，或创建默认空场景。
4. AI/系统按 `referenceAssetIds` 放入对应人物、场景和道具；无 3D 外观资产时使用六类灰模之一。
5. 根据文字中的景别、机位、动作起止建立初始人物姿势与摄影机。
6. 用户调整人物位置、朝向、姿势、手势、视线、道具、灯光和摄影机。
7. 保存镜头快照并生成缩略图。
8. 点击“用作分镜图构图参考”，把预演截图送入现有分镜图生成流程。
9. 生成出的正式分镜图继续走现有单镜视频、声音和成片链路。

## 9. 数据唯一事实源

`state.json` 仍是程序恢复和执行的唯一事实源。Markdown 只投影关键决策，便于用户和 AI 阅读，不保存完整骨骼矩阵或重复整份 3D JSON。

建议在项目状态中增加一个版本化字段：

```ts
interface BlockingState {
  version: 1
  scene: BlockingScene
  characters: BlockingCharacter[]
  props: BlockingProp[]
  lights: BlockingLight[]
  cameras: BlockingCamera[]
  shots: Record<string, BlockingShot>
  customPresets: BlockingPreset[]
}
```

这里的 `shots` key 必须是稳定 `shotId`。每个对象另有场景实例 ID，但人物/道具实例必须同时保存其业务 `entityId`。

### 9.1 坐标和旋转

- 使用 Three.js 右手坐标系；Y 轴向上。
- 位置统一使用米。
- 持久化旋转统一用四元数 `[x, y, z, w]`，不以 Euler 角作为事实源。
- UI 可以显示角度，但保存前转换为四元数。
- 相机焦段保存毫米值；FOV 由焦段和固定 sensor size 计算，避免同时持久化两套冲突值。
- 所有浮点数保存前限制合理精度，避免拖拽产生无意义 diff。

### 9.2 项目级场景

```ts
interface BlockingScene {
  environmentAssetId?: string
  room?: {
    width: number
    depth: number
    height: number
    wallColor: string
  }
  backgroundColor: string
  groundVisible: boolean
  units: 'meter'
}
```

项目级场景保存共享环境；每镜只保存相对变化。首期可先保存每镜完整快照，确认数据量与恢复可靠后再考虑差量，禁止一开始实现复杂继承系统。

### 9.3 人物

```ts
type DummyKind =
  | 'adult-male'
  | 'adult-female'
  | 'teen-male'
  | 'teen-female'
  | 'child'
  | 'baby'

interface BlockingCharacter {
  instanceId: string
  entityId: string
  dummyKind: DummyKind
  label: string
  height: number
  headScale: number
  morphs: { muscular: number; skinny: number; heavy: number }
  colors: Record<string, string>
  attachments: BlockingAttachment[]
}
```

`instanceId` 标识场景中的一个 3D 实例；`entityId` 对应现有角色资产。通常一对一，同一业务角色确需分身时才允许多个 `instanceId` 引用同一 `entityId`。

### 9.4 骨骼、IK 与手势

```ts
interface CharacterPoseState {
  root: TransformState
  bones: Record<string, [number, number, number, number]>
  ikTargets?: Partial<Record<'head' | 'hips' | 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot', [number, number, number]>>
  poleTargets?: Partial<Record<'leftElbow' | 'rightElbow' | 'leftKnee' | 'rightKnee', [number, number, number]>>
  posePresetId?: string
  leftHandPresetId?: string
  rightHandPresetId?: string
}

interface TransformState {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  scale: [number, number, number]
}
```

最终恢复以 `bones` 为准；IK target 是编辑辅助信息。每次 IK 求解完成后，把求解后的骨骼四元数写入 `bones`，避免未来 IK 实现变化导致旧项目姿势漂移。

只接受白名单骨骼名。载入模型后必须验证骨骼集合、Morph 名和 bind pose；不匹配时拒绝套用姿势并给出明确错误，不能静默扭曲人物。

### 9.5 道具、附件与灯光

```ts
interface BlockingProp {
  instanceId: string
  entityId?: string
  source: { kind: 'built-in' | 'project-glb'; pathOrKey: string }
  transform: TransformState
  visible: boolean
  locked: boolean
}

interface BlockingAttachment {
  attachmentId: string
  sourceKey: string
  boneName: string
  transform: TransformState
}

interface BlockingLight {
  instanceId: string
  kind: 'ambient' | 'directional' | 'point' | 'spot'
  color: string
  intensity: number
  transform: TransformState
  target?: [number, number, number]
}
```

首期道具只需要变换、锁定、隐藏和落地，不实现物理碰撞。附件必须绑定白名单骨骼，不允许任意脚本或外链资源。

### 9.6 摄影机与镜头快照

```ts
interface BlockingCamera {
  cameraId: string
  label: string
  transform: TransformState
  focalLengthMm: number
  sensorWidthMm: number
  near: number
  far: number
}

interface BlockingShot {
  shotId: string
  activeCameraId: string
  characterPoses: Record<string, CharacterPoseState>
  objectOverrides: Record<string, Partial<TransformState> & { visible?: boolean }>
  cameraOverrides: Record<string, Partial<BlockingCamera>>
  guide: {
    thirds: boolean
    center: boolean
    eyeline: boolean
  }
  thumbnailPath?: string
  referenceImagePath?: string
  updatedAt: string
}
```

推荐焦段范围 12–500mm。UI 提供常用焦段按钮和连续输入，但不把“景别”硬编码成唯一焦段；景别还取决于相机距离与主体大小。

景别预设可覆盖：大远景、远景、大全景、全景、中全景、中景、中近景、近景、特写、大特写。机位角度可覆盖：鸟瞰、俯拍、平视、仰拍、虫视。预设只负责把相机放到合理起点，用户仍可继续调整。

## 10. 项目文件目录

所有运行数据必须位于当前受控项目目录：

```text
<用户选择的项目根>/
  episodes/<episodeId>/
    state.json
    blocking/
      thumbnails/
        <shotId>.png
      references/
        <shotId>.png
      imports/
        <sha256>.glb
```

3D 状态本体优先随当前集 `state.json` 原子持久化，不另建第二个事实源。`blocking/` 只放当前集的二进制缩略图、提供给生图的参考图和用户导入 GLB。项目根仍由 `projectId -> rootPath` 注册表统一解析。

内置人物、姿势、手势、道具和附件属于应用资源，不复制进每个项目。运行时用稳定资源 key 引用。

## 11. Electron IPC 与路径安全合同

渲染进程不能获得 Node.js 或任意文件系统权限。沿用现有链路：

```text
Vue -> window 暴露的有限 preload API -> IPC -> electron/media-workspace.ts
```

只增加本功能必需的窄接口：

- 读取内置 3D 资源清单；
- 读取受控内置 GLB；
- 导入用户选择的本地 GLB，并复制到当前项目 `blocking/imports/`；
- 保存/读取预演状态（优先复用现有 state 保存入口）；
- 保存 canvas 截图到当前项目；
- 删除当前项目内指定预演产物。

安全要求：

1. IPC 输入必须带 `projectId`、稳定对象 ID 和相对目标名。
2. 主进程通过现有项目解析函数得到根目录，`path.resolve` 后验证结果仍在该目录内。
3. 不接受渲染进程传入任意绝对输出路径。
4. 自定义导入首期只允许 `.glb`，设置单文件体积上限，并实际解析验证；扩展名不能代替内容校验。
5. 不加载远程 URL、`file://` 任意路径或 GLB 中的外部依赖。
6. 文件保存采用临时文件 + rename 的原子写入；失败保留旧文件。
7. 删除只允许命中当前项目 `blocking/` 下的已登记文件。
8. preload 只暴露业务方法，不暴露 `ipcRenderer`、shell 或通用读写接口。

## 12. Desktop 资源与构建

当前 `electron-builder.json5` 的 `files` 只包含：

```text
dist, dist-electron, dist-native, locales, skills
```

新增应用资源目录建议为：

```text
resources/shot-generator/
  manifest.json
  characters/
  poses/
  hand-poses/
  props/
  attachments/
```

执行者必须先做一个最小打包实验，再决定用 `files` 还是 `extraResources`：

- 若资源需要在 asar 外以普通文件读取，用 `extraResources` 并通过 `process.resourcesPath` 定位。
- 若 Three.js loader 能稳定读取打包内资源，可随 `files` 打包，但必须验证开发版、macOS DMG 安装版和 Windows 安装版路径一致。

高级资源不得放进 Web `public/`，否则 Web 构建会无条件携带它们。资源 manifest 必须记录资源 key、类型、相对路径、SHA-256、骨骼版本和授权标识。

首期只增加 `three` 一个运行依赖。优先使用 Three.js 自带 addons：`GLTFLoader`、`SkeletonUtils`、`TransformControls` 和必要的相机/控制器；不要为每个小功能再加库。选定 Three.js 版本后锁定精确版本，并针对旧 Storyboarder 资产完成加载测试。

## 13. Three.js 实现规则

### 13.1 场景基础

- 一个画布、一个 renderer、一个主 scene。
- 编辑相机与镜头相机分开；用户查看场景时不应意外改写镜头相机。
- 使用 requestAnimationFrame，但无交互且场景静止时可按需渲染，避免后台持续占 GPU。
- resize 通过容器观察更新 renderer size 和 camera aspect。
- 默认提供地面、网格、环境光和方向光，保证空场景也可看清人物。
- 截图必须从“当前镜头相机”而不是编辑相机输出。

### 13.2 加载与克隆

- 每个内置 GLB 只解析一次，按资源 key 缓存模板。
- 每次放入人物时使用 `SkeletonUtils.clone`，不得普通 `Object3D.clone()` 共享错误 skeleton。
- 姿势应用按骨骼名查找，不能依赖 children 顺序或 `leaf.*` 顺序。
- 模型加载后先标准化高度、朝向、脚底原点和材质，再开放编辑。
- 加载失败显示资源 key、文件和原因，不以空白画布代替错误。

### 13.3 资源释放

离开项目、关闭预演或替换场景时：

- 停止渲染循环和事件监听；
- dispose geometry、material、texture、render target 和 renderer；
- 释放 TransformControls/OrbitControls；
- 清理对象选择、helper 和缓存引用；
- 不销毁仍被其他场景实例引用的共享模板资源。

必须用开发工具或可重复脚本验证多次进入/退出预演后 GPU 内存和 listener 数不持续增长。

## 14. 人物与完整关节编辑

### 14.1 两层操作

导演常用层：

- 拖头部：调整头/颈朝向；
- 拖髋部：调整重心和躯干；
- 拖双手：手臂 IK；
- 拖双脚：腿部 IK；
- 肘、膝 pole target：控制弯曲方向；
- 视线 target：控制头和眼的方向；
- 人物整体移动、旋转、落地。

高级关节层：

- 在骨骼树或人物上点选任一有效关节；
- 用旋转控制器调整局部骨骼；
- 对手指等 IK 不适合的关节做精细修正；
- 单关节恢复默认、左右镜像、整人恢复 bind pose。

### 14.2 IK 策略

先实现可测试的四肢链和头/髋控制，再扩展，不直接复制约 9,500 行旧 IK 代码。可以参考 Storyboarder 的链、约束、pole target 和 IK/骨骼切换思想，但必须改写为当前 Three.js API 和 TypeScript。

必须验证：

- 六类人物使用同一骨骼映射；
- 手脚 target 到达合理范围，超出时伸直到最大长度而不爆炸；
- 肘膝弯曲方向稳定；
- 切换 IK 与局部旋转时姿势不跳；
- 保存、关闭、重开后骨骼姿态像素级可接受一致；
- 镜像不会交换前后轴或破坏手指。

## 15. 姿势、手势与预设 UX

342 个姿势不能平铺在一个长列表。导入时建立本地静态索引：

- 稳定 `presetId`；
- 原名称与中文显示名；
- 分类与关键词；
- 适用姿态（站、坐、蹲、躺、动作、互动等）；
- 骨骼旋转数据；
- 可选缩略图。

UI 提供搜索、分类、最近使用和收藏。点击姿势先预览，确认后应用；支持撤销。32 个手势独立选择左手或右手，提供“应用到双手”和左右镜像。

自定义预设只保存必要的人物姿态字段，不复制人物业务身份、位置或摄影机。内置预设只读；用户预设保存在项目状态，后续若确有跨项目需求再增加全局库。

## 16. 摄影机与导演工具

必须支持：

- 多机位创建、命名、复制、删除和切换；
- 12–500mm 焦段；
- camera pan、tilt、roll；
- 10 种景别和 5 种角度的起点预设；
- 中心线、三分线、视线辅助线；
- 从当前编辑视角创建镜头、从镜头视角继续编辑；
- 锁定摄影机，防止摆人物时误拖；
- 当前镜头截图与缩略图；
- 相邻镜头复制后再修改，保持连续性。

首期不做真实镜头畸变、景深渲染、物理相机和复杂曝光。焦段、位置、方向和画幅已经足够服务构图参考；真实视觉风格仍由分镜图模型完成。

## 17. 与现有镜头和资产的绑定

### 17.1 镜头

- 给 `StoryboardSegment` 增加稳定 `shotId`。
- 解析新导演分镜时生成一次 `shot-NNN`；之后保存和重排保持不变。
- 旧项目加载时，缺失才按原 index 补齐并持久化。
- 3D `shots`、缩略图、参考图、媒体任务和 Wiki 镜头页使用同一个 `shotId`。
- 删除镜头时不要立刻物理删除其 3D 文件；先进入可恢复的孤儿清理流程，避免误操作丢失。

### 17.2 资产

- `referenceAssetIds` 继续决定本镜应该出现哪些角色、场景和道具。
- 3D 人物选择六类灰模只是“代理外形”；身份仍是现有 `entityId`。
- 正式角色图、服装、脸和美术风格不要求映射到灰模材质。
- 缺失关键 `entityId` 时阻止 AI 自动预演并指出缺失项，不偷偷创建新资产。

## 18. 3D 截图进入分镜图链路

截图不是最终分镜图，而是构图参考。生成时应同时提供：

1. 当前 3D 镜头截图；
2. 已确认角色/场景/道具资产图；
3. `storyboardImagePrompt`；
4. 项目固定视觉风格和画幅。

下游提示必须说明：保留截图的主体位置、景别、机位、朝向、动作关系和构图；人物身份、服装、场景质感与美术风格以正式资产图和提示词为准，不照抄灰模外观。

如果现有图片 API 的参考图数量或顺序有限，优先级为：关键人物身份图 > 3D 构图图 > 主要场景 > 次要道具。不得为了接入 3D 改坏现有无 3D 的分镜图生成路径。

用户必须能选择：

- 使用 3D 构图参考生成；
- 忽略 3D，按原流程生成；
- 更新预演截图后重新生成。

## 19. AI 自动预演

AI 的职责是产生可编辑初稿，不是直接操纵任意文件或执行 Three.js 代码。

输入：

- 当前 `StoryboardSegment`；
- 当前镜头和相邻镜头的稳定 `shotId`；
- 本镜 `referenceAssetIds` 及资产类型/名称/描述；
- 六类人物、姿势、手势、摄影机和内置道具的受控清单；
- 上一镜已确认的预演状态（用于连续性）。

输出必须是严格 JSON，由本地校验器验证后一次性应用，至少包括：

- 选择哪些已有资产；
- 每个人物使用哪类灰模；
- 位置、朝向、姿势/手势预设；
- 无合适预设时的受控骨骼调整；
- 摄影机位置、朝向、焦段；
- 需要的道具、灯光和构图线；
- 选择依据和无法确定的字段。

安全边界：

- 只允许引用随请求提供的 `shotId`、`entityId`、资源 key、骨骼白名单和数值范围。
- 禁止 AI 输出脚本、文件路径、URL、shader 或任意 Three.js 代码。
- 校验失败时不部分应用；返回具体字段错误。
- 应用前形成一个撤销检查点。
- AI 结果必须允许用户逐项修改。

首版映射可以是确定性起点：把中文景别/角度映射为相机预设，把已有姿势关键词映射到姿势库；只有确定性映射不足时才调用模型。不要一开始为所有拖拽操作引入 Agent 工具协议。

## 20. 状态、撤销与错误恢复

- 场景编辑使用内存草稿，明确保存或短暂防抖后写入现有项目状态。
- 持久化复用现有原子保存与项目隔离能力，不另建数据库。
- 撤销/重做只覆盖当前预演编辑命令，不混入云端媒体任务。
- 每次切换镜头、项目和退出预演前刷新待保存状态。
- 写入失败必须保留内存草稿并提示重试，不能假装已保存。
- 截图先写临时文件，成功后 rename；更新 `state.json` 的路径必须晚于文件成功落盘。
- GLB 加载失败不破坏已保存场景；用错误占位符标识缺失实例。
- 版本不兼容时保留原始字段，只阻止进入编辑，不自动清空。

## 21. 旧项目兼容与迁移

迁移规则只能向前补缺失字段：

1. 没有 `blocking`：视为从未建立预演，不影响任何现有功能。
2. `StoryboardSegment` 没有 `shotId`：按当前 `shot-NNN` 规则补齐并持久化一次。
3. 有 `blocking` 但版本较旧：通过纯函数迁移到当前版本，失败时保留原数据并停止写回。
4. 没有 3D 资源或 GPU 不可用：文字分镜、分镜图、视频和成片必须照常工作。
5. 卸载/关闭 3D 功能不能使已有项目无法打开。

迁移必须有包含真实旧状态样本的小测试；禁止只用空对象测试。

## 22. 分阶段实施

每阶段只在上一阶段通过后开始。不要一次性搬入所有 Storyboarder 代码和资源。

### 阶段 0：锁定合同和来源

实施：

- 完成授权范围留档和最终上游 commit 锁定。
- 生成所选资产 manifest、SHA-256 和骨骼/Morph 审计报告。
- 给 `StoryboardSegment` 固化 `shotId`，完成旧状态迁移。
- 把本 SDD 中的数据模型收敛为实际 TypeScript 类型。

验证：

- 旧项目加载后所有镜头得到唯一且稳定的 `shotId`。
- 重排镜头不改变 ID。
- 六类人物有效骨骼集合一致；资产哈希可复现。
- `pnpm test` 和 `pnpm build` 不回归。

### 阶段 1：Desktop 3D 基础壳

实施：

- 加入锁定版本 `three`。
- 增加 Desktop-only 分镜内部入口。
- 建立空场景、地面、灯光、编辑相机、镜头相机和 resize。
- 完成开发/打包资源路径的最小实验。

验证：

- macOS 和 Windows 开发环境可打开非空画布。
- Web 构建不下载高级 GLB。
- 连续进入退出 20 次无 listener 和 renderer 累积。

### 阶段 2：六类人物与 Morph

实施：

- 加载、缓存和 SkeletonUtils 克隆六类人物。
- 标准化高度、朝向、脚底原点。
- 实现身高、头部比例、颜色和三种 Morph。
- 实现人物整体移动、旋转、落地、锁定、隐藏、复制和多选。

验证：

- 六类人物分别加载和并列加载成功。
- 两个同模型人物姿势互不串联。
- Morph、保存、重开一致。

### 阶段 3：姿势、手势和预设

实施：

- 导入 342 个姿势和 32 个手势。
- 建立搜索、分类、镜像、恢复默认和自定义预设。
- 实现撤销/重做。

验证：

- 每个预设引用的骨骼都存在。
- 六类人物抽样和全量批处理应用无 NaN、无丢骨骼。
- 左右手势与镜像方向正确。

### 阶段 4：完整关节编辑和 IK

实施：

- 头、髋、双手、双脚 target。
- 肘膝 pole target。
- 高级局部骨骼旋转。
- IK 与局部旋转无跳变切换。

验证：

- 针对六类人物运行固定 IK 场景。
- 超出可达范围、重合 target、极端身高不产生 NaN 或翻转爆炸。
- 保存/恢复后的截图与保存前做像素差检查。

### 阶段 5：摄影机与镜头保存

实施：

- 多机位、焦段、景别、角度、pan/tilt/roll。
- 中心线、三分线、视线线。
- 镜头快照、缩略图、复制上一镜。

验证：

- 12、24、35、50、85、200、500mm 焦段计算正确。
- 缩略图来自镜头相机，不受编辑相机影响。
- 切换 100 次镜头不串状态、不持续涨内存。

### 阶段 6：接入现有分镜图链路

实施：

- 用稳定 `shotId` 和 `entityId` 连接现有镜头与资产。
- 保存构图参考图。
- 让现有分镜图生成可选地携带 3D 参考图。
- 保留原无 3D 生成路径。

验证：

- 分镜图任务仍遵守单项提交、恢复查询和避免重复付费规则。
- 切换项目后结果仍写回原项目。
- 有/无 3D 两条路径都可完成一次真实生图验收。

### 阶段 7：道具、附件、环境与灯光

实施：

- 接入获准的内置道具和附件。
- 支持受控自定义 GLB 导入。
- 增加简单房间、环境模型、图片参考板和灯光。

验证：

- 路径穿越、外部依赖、超大/损坏 GLB 被拒绝。
- 道具/附件保存恢复一致。
- 打包后资源完整，包体增长与 manifest 一致。

### 阶段 8：AI 自动预演

实施：

- 定义严格输入输出 schema。
- 优先确定性映射，模型补全复杂调度。
- 一次性校验、应用和撤销。

验证：

- 非法 ID、未知骨骼、越界数值和脚本字段全部拒绝。
- 同一固定输入可重复建立有效场景。
- 用户能在 AI 初稿上继续编辑并保存。

### 阶段 9：完整回归与真机验收

实施：

- 全量自动测试、构建、安装包和真实导演工作流验收。
- 修复内存、GPU、资源路径和项目恢复问题。
- 验收通过后才更新 Wiki 中的“已完成”状态。

验证：

- `pnpm test` 通过。
- `pnpm build` 通过。
- macOS Apple Silicon、macOS Intel 构建策略和 Windows 真机结果有记录；不能只以开发机成功代替跨平台结论。
- 从新建项目走通“文稿 -> 资产 -> 导演分镜 -> 3D 预演 -> 分镜图 -> 单镜视频 -> 成片”。
- 旧项目不建立 3D 也能走通原链路。

## 23. 自动测试最低清单

- `shotId` 生成、唯一性、迁移和重排稳定性。
- BlockingState schema 校验和版本迁移。
- 六类人物骨骼白名单一致性。
- 姿势/手势数据中的骨骼名、四元数有限值和范围。
- 左右镜像映射。
- 焦段到 FOV 计算。
- 项目路径约束、文件名清洗和目录穿越拒绝。
- 原子保存失败时旧状态保留。
- 自定义 GLB 大小、格式和外部资源拒绝。
- 分镜截图路径只属于当前项目。
- 切换项目后 3D 状态和截图不串项目。
- 资源释放后的场景、listener 和 renderer 数量。
- 无 `blocking` 的旧项目完整回归。

复杂 UI 和骨骼交互必须补人工验收，不能只依赖单元测试。

## 24. 人工验收脚本

1. 新建一个包含成年男女、儿童、场景和道具的项目。
2. 生成至少 5 个连续镜头，确认每镜有稳定 `shotId`。
3. 第一镜摆两个人物，设置不同身高/Morph、姿势、手势和视线。
4. 建立 35mm 平视双人镜头，打开三分线并截图。
5. 第二镜复制上一镜，切到 85mm 近景，只改变表演和机位。
6. 保存、关闭 App、重开项目，逐项核对人物、骨骼、机位与缩略图。
7. 用 3D 截图生成正式分镜图，确认构图继承且正式资产身份未被灰模覆盖。
8. 不使用 3D 重新生成另一个镜头，确认原路径无回归。
9. 导入一个合法 GLB、一个损坏 GLB 和一个带外部引用的 GLTF/伪 GLB，确认只有合法受控文件进入项目。
10. 快速切换项目与镜头，确认状态、截图和媒体任务不串写。
11. 完成单镜视频、配音和 FFmpeg 成片，确认本功能没有改变后续合同。

## 25. 性能预算与降级

- 六类人物基础资源约 11 MB，道具约 10 MB，姿势/手势约 1.7 MB；最终包体以锁定资源 manifest 为准。
- GLB 按需加载，不在应用启动时预载全部道具。
- 同类人物共享已解析资源和纹理，但 skeleton 实例必须独立。
- 缩略图使用固定输出尺寸，不保存无必要的超大截图。
- 限制同时可见的高复杂度自定义 GLB 数量和单文件大小；具体阈值用真机测量后锁定，不凭空写死。
- WebGL 不可用、context lost 或 GPU 性能不足时，清楚提示并允许返回文字分镜；不能阻塞整个项目。
- App 进入后台时暂停无必要的连续渲染。

## 26. 完成定义

只有同时满足以下条件，本功能才能从“待实施”改为“已完成”：

- 六类人物和共同骨架在打包后的 Desktop App 中可用。
- 完整关节编辑、IK、姿势、手势、Morph 和保存恢复通过验收。
- 多机位、焦段、景别、角度、构图线和缩略图可用。
- 3D 状态只绑定现有稳定 `shotId` 和资产 `entityId`。
- 3D 截图能作为现有分镜图构图参考，且无 3D 路径不回归。
- 道具、附件、环境、自定义 GLB 和灯光完成边界内能力。
- AI 自动预演只输出受控数据，不能执行代码或任意读写文件。
- 项目隔离、路径安全、原子保存、旧项目迁移和错误恢复通过测试。
- macOS 与 Windows 安装包完成真机验证。
- 全量测试、构建和完整创作链验收通过。
- 授权、来源 commit、资源哈希和第三方声明已归档。

## 27. 给执行 AI 的启动检查表

开始写代码前按顺序完成：

1. 读取 `docs/wiki/CLAUDE.md`、`docs/wiki/hot.md` 和本 SDD。
2. 查看 `git status --short`，记录并保护用户已有改动。
3. 追踪现有完整链路：`src/views/Home/index.vue` -> `src/store/mediaTask.ts` -> `src/runtime/videoWorkflow.ts` -> `electron/preload.ts` -> `electron/ipc.ts` -> `electron/media-workspace.ts`。
4. 阅读 `skills/jc-script-storyboard/SKILL.md`，确认导演分镜字段和 Wiki 文件合同。
5. 检查上游 Storyboarder 最终授权、commit 和资产 hash，不使用浮动分支。
6. 先完成阶段 0 的 `shotId` 和数据合同测试，再建立 Three.js UI。
7. 每阶段先写最小失败测试或可重复验收，再实现到通过。
8. 每阶段只修改必要文件；不得顺手重构媒体链、配音、剪辑或 Wiki 系统。
9. 每阶段运行相关测试；跨共享合同后运行完整 `pnpm test` 和 `pnpm build`。
10. 只有真实代码、测试和人工验收支持的能力才能写入 Wiki 为“已完成”。

## 28. 执行禁止事项

- 禁止新增顶部产品阶段。
- 禁止新建第二套分镜、人物、道具或场景业务身份。
- 禁止用数组 index 作为长期 3D 绑定键。
- 禁止让 Markdown 取代 `state.json` 成为运行事实源。
- 禁止一次性复制 Storyboarder Shot Generator、React/Redux 或 Electron 外壳。
- 禁止开放任意文件系统 IPC、任意 URL GLB 或渲染进程 Node 权限。
- 禁止把高级 GLB 放入 Web 公共资源目录。
- 禁止为了 3D 修改现有付费任务的恢复和去重语义。
- 禁止用开发模式成功代替安装包与跨平台验证。
- 禁止覆盖、清理或提交执行前已经存在的用户改动。
- 禁止在没有授权范围和资产来源记录时发布相关资源。

## 29. 最小落地判断

虽然最终目标包含完整导演能力，仍应按价值顺序实施。真正让产品链路第一次闭环的最小版本是：

```text
稳定 shotId
  + Three.js 空间
  + 六类人物
  + 姿势/手势
  + 人物走位
  + 摄影机/焦段
  + 镜头保存与截图
  + 截图进入现有分镜图生成
```

IK、高级关节、道具、附件、环境和 AI 自动预演随后逐阶段补齐。这个顺序不是砍掉完整目标，而是让每一批代码都能独立产生导演价值并可验证，避免 40,000 行级别的大爆炸移植。
