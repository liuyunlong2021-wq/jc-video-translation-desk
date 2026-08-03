---
name: jc-prop-prompt
description: Use when a user asks to create a prop design prompt, prop concept image, or reusable prop visual asset from story material.
---

# 道具参考图 → 提示词

## 应用运行时模式

输入 `mode: "app-plan"` 时，直接从 `script` 提取所有需要跨镜保持一致的重要道具，一次输出：

```json
{ "assets": [{ "role": "prop", "label": "道具名", "description": "用途与叙事职责", "identityTraits": ["轮廓、结构、材质、尺寸和识别标记"], "styleRequirements": ["项目风格要求"], "required": true, "design": { "严格完整遵守 references/prop-format.md 的 JSON 模板": "不得省略字段" }, "searchQuery": "从 design 派生的一条精确英文 Pinterest 查询" }] }
```

品牌设备、包装和应用载体统一作为 `prop`；在 `identityTraits` 和 `design` 中锁定 Logo、文字、品牌色、包装轮廓及关键结构。`design` 是唯一生图事实源，必须把输入 `projectStyle` 的视觉风格和比例原样写入 `design.project`。不得输出 `generationPrompt`、`prompt` 或另一份自然语言提示词。`searchQuery` 只用于寻找现实影视或广告参考，与最终项目画风分离：使用“具体物件 + 必要用途/结构 + movie prop close up”的一条英文查询，例如 `professional pen display tablet movie prop close up`；真实产品和软件界面可使用 `product commercial still`。不得加入 webtoon、anime、animation、illustration、concept art、prop sheet、项目色彩或画风。不输出多个备选查询。没有重要道具时输出 `{ "assets": [] }`。不得提取角色或场景，不得返回路径、图片或其他字段。

输入 `mode: "app-runtime"` 时跳过下方搜图、询问和文件流程。只读取 `asset` 和 `projectStyle`，输出：

```json
{ "assetId": "原样返回 asset.id", "design": {}, "searchQuery": "从 design 派生的一条精确英文 Pinterest 查询" }
```

`design` 必须严格完整遵守 `references/prop-format.md`，锁定轮廓、结构、材质、尺寸、识别标记、项目风格和画面比例，使用纯净背景、多角度和特写标注的资产设定图。不得返回路径、图片、Markdown、`generationPrompt`、`prompt` 或其他字段。

`searchQuery` 必须继续遵守上面的现实影视或广告参考规则，不得从 `projectStyle` 抄入画风词。

APP 主流程中的 `asset` 来自已确认项目总监清单。必须原样保留 `asset.id`、道具身份和叙事职责；不得重新阅读全文决定道具数量，不得新增、删除、合并、拆分或改名道具。

输入 `mode: "app-revise"` 时读取 `asset`、`currentDesign`、`instruction` 和 `projectStyle`，只把用户意见应用到完整设计，并从修改后的 `design` 重新派生 `searchQuery`，返回相同的 `{ "assetId", "design", "searchQuery" }` 合同。不得搜索、下载或生成图片，不得改变道具身份。

> 输入道具描述 → Pinterest 搜索真实道具参考图 → 分析图片提取视觉DNA → 融合道具需求输出道具设定图 JSON。参考图是像素，不是回忆。

## 理念

「一把末世拾荒者的镰刀长什么样？」——不让 LLM 回忆，直接去 Pinterest 搜给你看。

道具的核心不是「酷」，是**功能、材质和使用痕迹**。搜到参考图后，提取形状、材质、尺寸、磨损的视觉 DNA，再用剧本里的具体需求（时代、使用者、用途）覆盖不匹配的部分。

## 输入

道具描述，至少含：

```
道具名称 / 类别（武器/工具/饰品/文件/日常用品） / 使用者 / 时代背景 / 功能 / 材质 / 尺寸 / 特殊标记
```

## 核心规则

1. 不用 LLM 回忆道具——用 Pinterest 搜真实参考图，或用户自备参考图
2. 直接推荐最佳参考图，不满意就换
3. 每张参考图必须用 `view_image` 做详尽视觉分析
4. 最终提示词必须融合参考图 DNA + 道具需求差异
5. 输出为 JSON 格式——机器可解析，直接投喂下游 AI 工具

## 阶段 0.5：项目风格确认（全剧只确认一次）

搜索参考图之前，先确认项目整体风格。确认后所有道具共用。若已在角色/场景设计阶段确认过，直接复用。

**A. 媒介类型**：真人剧 / 动漫剧 / 漫剧(webtoon)

**B. 题材类型**：悬疑 / 爱情 / 奇幻 / 科幻 / 末世 / 武侠 / 都市 / 校园 / 恐怖 / 其他\_\_\_

**C. 视觉风格**：偏写实 / 偏风格化 / 偏卡通 / 黑暗成人向 / 明亮少年向 / 其他\_\_\_

**D. 特殊设定（可多选，无则跳过）**：兽人 / 机甲 / 修仙 / 异能 / 蒸汽朋克 / 赛博朋克 / \_\_\_

## 阶段 1：获取参考图

先问用户：「有自备道具参考图吗？有的话直接发我，跳过搜索。」

**有自备图** → `view_image` 直接分析，进阶段 3。

**无自备图** → 从道具描述 + 阶段 0.5 确认信息中提取 3-5 个英文关键词构造搜索 URL。

关键词组合逻辑：

- 题材+媒介+风格（来自阶段 0.5 确认）
- 道具类型（英文）：`sword`, `dagger`, `watch`, `notebook`, `syringe`, `necklace`, `radio`
- 材质/风格（英文）：`rusty`, `minimal`, `ornate`, `tactical`, `worn`, `antique`
- **必加限定词**：`prop design` 或 `asset reference` 或 `concept art`

用 `+` 连接，URL 模板：

```
https://jp.pinterest.com/search/pins/?q=关键词1+关键词2+prop+design
```

备选搜索源：

```
https://www.artstation.com/search?q=关键词1+关键词2+prop
```

## 阶段 2：Pinterest 搜索 + 选图

```
open_browser_page(搜索URL)
→ read_page 读取搜索结果
→ 从列表中找到最有潜力的参考图
→ navigate_page(pinURL) 直接导航到 Pin 页面
→ screenshot_page 截取大图
→ 推荐：「这张最贴合——[具体理由，3句话]」
```

用户 OK → 进阶段 3。不满意 → 翻页或换搜索词再找。

## 阶段 3：提取视觉 DNA

```
view_image 查看选定的参考图
→ 详细分析以下维度：

形状与轮廓：
- 整体形状/剪影
- 关键结构组件（刃/柄/表盘/扣环/页面）
- 比例关系（长宽比/厚度）

材质与表面：
- 主要材质（金属/木材/皮革/布料/塑料/玻璃）
- 表面处理（抛光/哑光/生锈/磨损/做旧）
- 颜色+纹理

尺寸与重量感：
- 相对于手的比例
- 厚度/重量暗示（轻巧↔厚重）

特殊标记：
- 刻字/铭文/logo
- 损坏痕迹（缺口/裂纹/修补）
- 独特装饰（宝石/雕刻/镶嵌）

多角度：
- 正面/侧面/背面/顶部/底部各有何特征
```

## 阶段 4：道具需求融合

对照道具描述，逐一比对差异：

```
参考图 DNA          vs    剧本道具需求
─────────────────────────────────────────
崭新抛光长剑       →    末世拾荒者镰刀 → 褪去光泽、废旧金属拼接、刀身缺口
皮质表带           →    极简黑表盘      → 换不锈钢表带、极简设计
```

输出调整清单，逐项融入最终提示词。

## 阶段 5：输出最终提示词

读取 `references/prop-format.md`，按 JSON 模板输出。

## 阶段 6：保存参考图

优先用浏览器截图。

## 文件约定（与 Wiki 架构联动）

本 skill 与 **jc-duanju-world** / **jc-novel** 共用 `wiki/道具/` 目录。

| 文件                           | 来源         | 说明                                             |
| ------------------------------ | ------------ | ------------------------------------------------ |
| `wiki/道具/道具名.md`          | 世界模型     | 道具档案（道具引擎/视觉锚点）——本 skill 的输入源 |
| `wiki/道具/道具名.design.json` | **本 skill** | 道具设定图 JSON——本 skill 的产出                 |
| `wiki/世界/世界设定.md`        | 世界模型     | 世界观描述（辅助参考）                           |

### 联动要点

- 读取 `wiki/道具/道具名.md` 中的「标志形状」「标志材质」「识别标记」→ 直接作为 Pinterest 搜索关键词
- 读取「道具引擎」中的「原型」字段 → 如果原型是知名道具（如「金箍棒式」），搜索词直接包含该原型
- 输出 JSON 写入同一目录：`wiki/道具/道具名.design.json`

### 多道具流程

```
扫描 wiki/道具/ 目录找到所有 .md 道具档案（或从剧本提取道具列表）
    ↓
阶段 0.5 全剧确认风格 → 所有道具共用
    ↓
逐道具：读取 wiki/道具/道具名.md → 提取标志形状/材质/原型 → 搜参考图 → 生成 wiki/道具/道具名.design.json → 下一个
    ↓
更新 CLAUDE.md ## [道具设计] 区块
```

### 独立使用（无 Wiki 时）

`analysis/prop-design.json`

## 约束

1. App 中先生成完整设计与提示词；参考图是可选增强，可随后联网搜索或由用户上传
2. 道具图须纯色背景、多角度展示
3. 视觉 DNA 提取必须详尽——特别关注材质磨损和使用痕迹
4. 不满意就换图，不走选项流程
