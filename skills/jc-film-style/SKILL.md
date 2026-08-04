---
name: jc-film-style
description: Use when a user asks to establish a film or drama project's country, era, medium, director, visual direction, aspect ratio, color language, or complete character, scene, and prop register before asset production.
---

# 项目总监 —— 一部剧定一次

## 应用运行时模式

输入 `mode: "app-director"` 时，跳过欢迎语、多轮选择、Pinterest、浏览器和文件写入。同时读取 `rawRequest`、`approvedScript`、`project`，一次确定项目总纲和完整资产清单。

输入包含 `currentPlan` 和非空 `instruction` 时，在保持 `project.visualStyle`、`project.aspectRatio` 及所有未被用户点名事实不变的前提下，返回修改后的完整同结构 JSON；仍要重新执行主体与资产完整性检查。

原始需求保存画面主体和创作意图；确认文稿保存最终旁白、对白和叙事文字。确认文稿没有重复原始画面要求不代表删除该要求，只有明确冲突时才服从确认文稿。输入的 `visualStyle`、`aspectRatio` 和 `targetDuration` 是硬约束。

只输出以下合法 JSON，不输出 Markdown、路径、图片或解释：

```json
{
  "productionRoute": "narration-promo/drama 二选一",
  "routeReason": "判断叙事主要由统一旁白还是角色行动与对白推动",
  "project": {
    "title": "项目名",
    "format": "剧情短片/产品广告/口播等",
    "genre": "具体题材",
    "countryRegion": "国别或地域",
    "era": "时代",
    "medium": "真人/韩漫/二维动画等",
    "aspectRatio": "原样返回 project.aspectRatio",
    "visualStyle": "原样返回 project.visualStyle"
  },
  "direction": {
    "director": "具体导演或动画主创",
    "referenceWork": "具体代表作",
    "rationale": "为什么适合当前项目",
    "visualAnchor": "全项目统一视觉锚点",
    "colorLanguage": "色彩与光线规则",
    "cameraLanguage": "镜头与构图规则"
  },
  "assets": [{
    "role": "character/scene/prop",
    "label": "实体名称",
    "aliases": [],
    "description": "实体说明",
    "storyFunction": "叙事职责",
    "identityTraits": ["跨镜不可漂移特征"],
    "required": true,
    "evidence": "来自原始需求或确认文稿的简短依据"
  }],
  "completeness": {
    "narrativeSubjectRequired": true,
    "noCharacterReason": "有角色时留空；无角色时必须解释",
    "warnings": []
  }
}
```

强制规则：

1. 统一旁白、解说、产品介绍、知识讲述或广告口播推动全片时返回 `narration-promo`；角色行动、对白、冲突和场景表演推动故事时返回 `drama`。存在角色不等于剧情片，必须判断叙事驱动力。
2. `routeReason` 必须具体说明判定依据，不能只复述路线名称。
3. 任何具名人物、说话者、动作执行者或跨镜主体都列为角色；存在行动主体时不得返回空角色。
4. 主要地点和需要保持连续的环境列为场景；品牌设备、包装、APP 载体和重要物件列为道具。
5. “角色、场景、道具”作为产品功能词时不是剧情实体。
6. 只列实体和身份锚点，不写完整生图 JSON、搜索词或资产 ID；这些由 APP 和专业资产 Skill 处理。
7. 没有角色时设置 `narrativeSubjectRequired: false` 并填写具体原因，不能用“旁白广告”掩盖已存在的行动主体。

> 输入故事梗概 → 输出风格决策文件。媒介、比例、导演、色卡——四样全锁，下游 Skill 只管执行。

## ⛔ 启动闸门

首次对话必须输出以下欢迎语，等用户选择后再执行：

```
🎨 影视风格定调 —— 帮你的故事选对视觉基因

我能帮你定四件事：
• 媒介：真人还是动漫？
• 画幅：9:16 竖屏短剧还是 16:9 横屏？
• 导演+作品：基于你的故事推荐 3 个匹配的导演作品
• 色卡库：Pinterest 搜导演作品截图，提取画面+色卡对照

输出写入 style-design.md，下游的角色设计/场景设计/分镜 Skill 都能复用。

准备好了吗？
A 粘贴故事梗概，开始定风格
B 我只有一句话梗概，够用吗？
C 我已经有导演和作品了，直接建色卡
```

## 理念

风格决策是**项目级**的——一部剧定一次，后面所有场次、所有镜头都在这个框架里跑。拆出来独立成 Skill，两个好处：

1. **复用**：角色设计、场景设计、分镜等下游 Skill 都读同一份风格决策
2. **迭代**：风格不满意只重跑这一个，不用从头来

## 核心规则

1. A/B/C/D 选项推进，不替用户决定
2. 风格必须「导演 + 作品」，不泛泛说类型
3. 色卡必须有图有真相——Pinterest 搜截图，图像和色卡同框
4. 输出写入 `wiki/世界观/style-design.md`，下游 Skill 直接读

## 流程总览

```
故事梗概
    ↓
阶段1: 媒介分类（真人/动漫）
    ↓
阶段2: 画幅比例（9:16 / 16:9）
    ↓
阶段3: 锁定导演+作品（A/B/C/D）
    ↓
阶段4: Pinterest 搜色卡建库
       图像+色卡对照，3-5套
    ↓
输出: wiki/世界观/style-design.md
```

## 输入

故事梗概/大纲。来自短剧世界模型、短故事、或用户手写——不挑上游。

## 阶段 1：媒介分类（A/B）

- **A 动漫** → 读取 `references/anime-style-bank.md`
- **B 真人** → 读取 `references/director-style-bank.md`

## 阶段 2：画幅比例（A/B）

- **A 9:16** — 竖屏短剧/抖音
- **B 16:9** — 横屏影视/传统剧

## 阶段 3：锁定导演+作品（A/B/C/D）

基于梗概的题材/情绪/节奏，推荐 **3 个「导演 + 作品」**（A/B/C）+ D 自定义。

每个推荐含：

- 导演 + 作品名
- 为什么适合（一句话，点明该导演处理哪类戏型最贴合本剧本）
- 画幅确认

3 个选项覆盖不同方向（情绪作者型 / 节奏商业型 / 写实纪录型）。

选 A/B/C → 锁定，进阶段 4。选 D → 收敛到具体「导演+作品」才能继续。

## 阶段 4：导演色卡档案

锁定导演的**配色基因**。

### 做法

Pinterest 搜 **「[导演名] [作品名] color palette」** 或 **「[导演名] [作品名] cinematography」**，拉 5-8 张截图——要那种 **画面+色卡对照的图**（电影截图旁边带 LIGHT/MEDIUM/DARK 色条的），不是纯色码表。

推荐搜索词：

- `王家卫 花样年华 color palette`
- `Wong Kar-wai In the Mood for Love cinematography`
- `[导演] [作品] scene color analysis`

### 输出格式

按色调分类展示：

```
导演色卡档案：王家卫《花样年华》

【冷调都市系】← 适合办公/街景/疏离感场景
[图像] ← 截图展示画面+色卡
色卡范围: 浅蓝灰、深墨绿、暖棕、雾感白
参考场: 苏丽珍在办公室的灯光下

【暖色怀旧系】← 适合室内/近景/情感浓度高场景
[图像] ← 截图展示画面+色卡
色卡范围: 土黄、橘红、沙色、复古绿
参考场: 旗袍近景的灯光下

【夜景高反差系】← 适合夜戏/对峙/悬疑场景
[图像] ← 截图展示画面+色卡
色卡范围: 深蓝黑、霓虹红、青灰、琥珀点光
参考场: 雨夜楼道擦肩

（共 3-5 套色卡）
```

用户确认：**A 全部保留 / B 去掉某套 / C 按剧本情绪调顺序 / D 自定义色卡**。

确认后写入 `wiki/世界观/style-design.md`。这套色卡库就是全剧的配色天花板——下游 Skill 逐场选色卡时只能从库里挑。

## 输出文件

`wiki/世界观/style-design.md`：

```markdown
# 风格决策

- 媒介：真人
- 画幅：9:16
- 导演+作品：王家卫《花样年华》

## 色卡库

### 冷调都市系

色卡范围: 浅蓝灰、深墨绿、暖棕、雾感白
适合: 办公/街景/疏离感

### 暖色怀旧系

色卡范围: 土黄、橘红、沙色、复古绿
适合: 室内/近景/情感浓度高

### 夜景高反差系

色卡范围: 深蓝黑、霓虹红、青灰、琥珀点光
适合: 夜戏/对峙/悬疑
```

## 下游消费

以下 Skill 读取本输出：

- **jc-script-storyboard**：读导演+作品 → 生成节奏档案；读色卡库 → 逐场选色卡
- **jc-character-prompt**：读媒介+导演风格 → 角色视觉DNA
- **jc-scene-prompt**：读色卡库 → 场景配色约束

## 约束

1. 风格「导演 + 作品」，不泛泛
2. 色卡必须有图有真相——Pinterest 搜截图
3. 输出写入 `wiki/世界观/style-design.md`
4. A/B/C/D 选项推进

## 指令

```
风格定调：帮我给这个故事定影视风格：
[粘贴故事梗概]
```
