---
name: jc-scene-prompt
description: Use when a user asks to create a scene design prompt, scene concept image, empty-environment shot, or a reusable scene asset from story material.
---

# 场景参考图 → 提示词

## 应用运行时模式

输入 `mode: "app-plan"` 时，直接从 `script` 提取所有主要场景，一次输出：

```json
{ "assets": [{ "role": "scene", "label": "场景名", "description": "空间功能与氛围", "identityTraits": ["固定空间结构"], "styleRequirements": ["项目风格要求"], "required": true, "design": { "严格完整遵守 references/scene-format.md 的 JSON 模板": "不得省略字段" }, "searchQuery": "从 design 派生的一条精确英文 Pinterest 查询" }] }
```

`design` 是唯一生图事实源，必须把输入 `projectStyle` 的视觉风格和比例原样写入 `design.project`。不得输出 `generationPrompt`、`prompt` 或另一份自然语言提示词。`searchQuery` 只用于寻找现实影视参考，与最终项目画风分离：使用“空间身份/功能 + 必要布局特征 + film still wide shot”的一条英文查询，例如 `screenwriter independent studio workspace film still wide shot`。也可使用 television still 或 commercial still，但一条查询只选一种来源。不得加入 webtoon、anime、animation、illustration、concept art、background art、项目色彩或画风。不输出多个备选查询。没有主要场景时输出 `{ "assets": [] }`。不得提取角色或道具；设计必须是无人物、无角色剪影、无动物的空环境。不得返回路径、图片或其他字段。

输入 `mode: "app-runtime"` 时跳过下方搜图、询问和文件流程。只读取 `asset` 和 `projectStyle`，输出：

```json
{ "assetId": "原样返回 asset.id", "design": {}, "searchQuery": "从 design 派生的一条精确英文 Pinterest 查询" }
```

`design` 必须严格完整遵守 `references/scene-format.md`，锁定空间布局、材质、光源、关键物件、项目风格和画面比例，并明确纯环境空镜、无人物、无角色剪影、无动物。不得返回路径、图片、Markdown、`generationPrompt`、`prompt` 或其他字段。

`searchQuery` 必须继续遵守上面的现实影视参考规则，不得从 `projectStyle` 抄入画风词。

APP 主流程中的 `asset` 来自已确认项目总监清单。必须原样保留 `asset.id`、场景身份和叙事职责；不得重新阅读全文决定场景数量，不得新增、删除、合并、拆分或改名场景。

输入 `mode: "app-revise"` 时读取 `asset`、`currentDesign`、`instruction` 和 `projectStyle`，只把用户意见应用到完整设计，并从修改后的 `design` 重新派生 `searchQuery`，返回相同的 `{ "assetId", "design", "searchQuery" }` 合同。不得搜索、下载、生成图片、改变空间身份或加入人物。

> 输入场景描述 → Pinterest 搜索真实场景参考图 → 分析图片提取视觉DNA → 融合场景需求输出场景设定图 JSON。参考图是像素，不是回忆。

## 理念

「吉卜力风格的森林小屋长什么样？」——不让 LLM 回忆，直接去 Pinterest 搜给你看。

场景的核心不是「好看」，是**这个空间的功能逻辑和氛围锚点**。搜到参考图后，提取空间布局、材质、光源、物件密度的视觉 DNA，再用剧本里的具体需求（时代、地域、功能、氛围）覆盖不匹配的部分。

## 输入

场景描述，至少含：

```
场景名称 / 时代背景 / 地域 / 室内/室外 / 功能 / 氛围基调 / 关键物件 / 风格偏好
```

## 核心规则

1. 不用 LLM 回忆场景——用 Pinterest 搜真实参考图，或用户自备参考图
2. 直接推荐最佳参考图，不满意就换
3. 每张参考图必须用 `view_image` 做详尽视觉分析
4. 最终提示词必须融合参考图 DNA + 场景需求差异
5. 输出为 JSON 格式——机器可解析，直接投喂下游 AI 工具
6. **场景图必须是空镜**——无人物、无角色剪影、无动物。纯环境。所有视角纯空镜

## 阶段 0.5：项目风格确认（全剧只确认一次）

搜索参考图之前，先确认项目整体风格。确认后所有场景共用。若已在角色设计阶段确认过，直接复用。

**A. 媒介类型**：真人剧 / 动漫剧 / 漫剧(webtoon)

**B. 题材类型**：悬疑 / 爱情 / 奇幻 / 科幻 / 末世 / 武侠 / 都市 / 校园 / 恐怖 / 其他\_\_\_

**C. 视觉风格**：偏写实 / 偏风格化 / 偏卡通 / 黑暗成人向 / 明亮少年向 / 其他\_\_\_

**D. 特殊设定（可多选，无则跳过）**：兽人 / 机甲 / 修仙 / 异能 / 蒸汽朋克 / 赛博朋克 / \_\_\_

确认后，所有场景的搜索词自动拼接风格信息。

## 阶段 1：获取参考图

先问用户：「有自备场景参考图吗？有的话直接发我，跳过搜索。」

**有自备图** → `view_image` 直接分析，进阶段 3。

**无自备图** → 从场景描述 + 阶段 0.5 确认信息中提取 3-5 个英文关键词构造搜索 URL。

关键词组合逻辑：

- 题材+媒介+风格（来自阶段 0.5 确认）
- 场景类型（英文）：`bedroom`, `living room`, `alley`, `rooftop`, `office`, `cafe`, `basement`
- 氛围关键词（英文）：`messy`, `clean`, `dark`, `warm`, `cold`, `cluttered`, `minimal`
- 风格关键词（英文）：`korean drama`, `anime background`, `cyberpunk`, `ghibli`
- **必加限定词**：`environment design` 或 `background art` 或 `set design`

用 `+` 连接，URL 模板：

```
https://jp.pinterest.com/search/pins/?q=关键词1+关键词2+environment+design
```

备选搜索源：

```
https://www.artstation.com/search?q=关键词1+关键词2+environment
```

## 阶段 2：Pinterest 搜索 + 选图

```
open_browser_page(搜索URL)
→ read_page 读取搜索结果
→ 从列表中找到最有潜力的参考图
→ navigate_page(pinURL) 直接导航到 Pin 页面（Pinterest 弹窗常拦截点击）
→ screenshot_page 截取大图
→ 推荐：「这张最贴合——[具体理由，3句话]」
```

用户 OK → 进阶段 3。不满意 → 翻页或换搜索词再找。

## 阶段 3：提取视觉 DNA

```
view_image 查看选定的参考图
→ 详细分析以下维度：

空间布局：
- 房间形状/纵深/层高
- 功能分区（休息区/工作区/通道的分布）
- 家具布置逻辑（对称/非对称/中心式/靠墙）

材质与表面：
- 墙面（油漆/壁纸/砖/混凝土/木板）
- 地面（木地板/瓷砖/水泥/地毯）
- 天花板（高度/灯具/管道/裸露结构）

物件密度：
- 稀疏（极简/空旷）↔ 密集（堆满/杂乱）
- 关键标志物（一眼认出这个场景的物件）

光影与色调：
- 自然光入口（窗户/天窗/门的位置和大小）
- 人工光源（灯具类型/色温/位置）
- 主色调+辅助色
```

## 阶段 4：场景需求融合

对照场景描述，逐一比对差异：

```
参考图 DNA          vs    剧本场景需求
─────────────────────────────────────────
整洁极简卧室       →    乱如战后废墟   → 增加堆叠物件、散落衣物、泡面桶
日式榻榻米         →    中国城市公寓   → 换中式家具、白墙、空调挂机
暖木色调           →    深夜冷感       → 色板转冷灰蓝、屏幕冷白光为主光源
```

输出调整清单，逐项融入最终提示词。

## 阶段 5：输出最终提示词

读取 `references/scene-format.md`，按 JSON 模板输出。

## 阶段 6：保存参考图

优先用浏览器截图——`screenshot_page` 截取的大图足以分析。

## 文件约定（与 Wiki 架构联动）

本 skill 与 **jc-duanju-world** / **jc-novel** 共用 `wiki/场景/` 目录。

| 文件                           | 来源         | 说明                                             |
| ------------------------------ | ------------ | ------------------------------------------------ |
| `wiki/场景/场景名.md`          | 世界模型     | 场景档案（空间引擎/空间描述）——本 skill 的输入源 |
| `wiki/场景/场景名.design.json` | **本 skill** | 场景设定图 JSON——本 skill 的产出                 |
| `wiki/世界/世界设定.md`        | 世界模型     | 世界观描述（辅助参考）                           |

### 联动要点

- 读取 `wiki/场景/场景名.md` 中的「空间描述」「标志材质」「光影基调」→ 直接作为 Pinterest 搜索关键词
- 读取「空间引擎」中的「原型」字段 → 如果原型是知名空间（如「卢浮宫式」），搜索词直接包含该原型
- 输出 JSON 写入同一目录：`wiki/场景/场景名.design.json`

### 多场景流程

```
扫描 wiki/场景/ 目录找到所有 .md 场景档案（或从剧本提取场景列表）
    ↓
阶段 0.5 全剧确认风格 → 所有场景共用
    ↓
逐场景：读取 wiki/场景/场景名.md → 提取空间描述/标志材质/原型 → 搜参考图 → 生成 wiki/场景/场景名.design.json → 下一个
    ↓
更新 CLAUDE.md ## [场景设计] 区块
```

### 独立使用（无 Wiki 时）

`analysis/scene-design.json`

## 约束

1. App 中先生成完整设计与提示词；参考图是可选增强，可随后联网搜索
2. 场景图须是空镜（无人物），纯色背景或自然环境的空场景
3. 视觉 DNA 提取必须详尽——不跳过任何维度
4. 不满意就换图，不走选项流程
