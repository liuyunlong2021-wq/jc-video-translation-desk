# Pinterest 浏览器参考图搜索 P0 SDD

> 日期：2026-07-31
> 状态：已实施；影视参考收窄与类型专属参考指令已通过自动测试，待真实搜索与生图验收
> 目标版本：1.2.3
> 范围：角色、场景、道具的可选参考图搜索
> 取代：`道具提示词参考搜索与资产生成P0-SDD.md` 中基于 Pinterest 私有 HTTP 接口的搜索实现

## 1. 结论

参考图搜索改为真实浏览器执行，不再请求 Pinterest 私有接口，也不调用模型筛选候选。

```text
题材/媒介/风格 + 资产类型 + 关键特征
  -> Electron 浏览器打开 Pinterest 搜索页
  -> 读取已渲染的 Pin 列表
  -> 进入第一个可用 Pin 页面
  -> 截取 Pin 主图（gallery-dl 可选增强）
  -> 保存为资产参考版本
  -> 显示在中栏资产表
```

搜索只是三个资产主操作中的第二步，原 UI 顺序不变：

```text
[生成资产提示词] -> [搜索下载参考图（可跳过）] -> [生成资产图]
```

## 2. 根因

当前 App 使用 `axios` 请求：

```text
https://www.pinterest.com/resource/BaseSearchResource/get/
```

这是 Pinterest 网页内部接口，不是稳定开放 API。请求没有真实浏览器的页面脚本、Cookie、登录状态和风控上下文，因此在打包 App 中持续连接失败。即使请求成功，当前按图片尺寸排序也不等于 Pinterest 页面搜索顺序。

原版 `jc-character-prompt` 的有效能力来自真实浏览器：打开搜索页、读取渲染结果、进入 Pin 页面、截图或下载。P0 应恢复这一执行方式，但按产品需要去掉模型候选判断。

## 3. 固定流程

### 3.1 形成查询

角色、场景、道具专业 Skill 在生成资产提示词时，同时生成一条 `searchQuery`。查询表达以下语义：

```text
题材/媒介/风格 + 资产类型 + 关键特征
```

示例：

```text
cinematic live action anxious office worker
modern realistic private knowledge study
cinematic branded smartphone display prop
```

查询不按空格机械限制单词数量，只保存一条，不生成候选列表。三类查询必须锁定媒介、具体对象和制作用途构图：角色使用全身定妆/角色设定构图，场景使用全景建立镜头/环境设定构图，道具使用独立道具/产品设定构图。

资产 Skill 保存的 `searchQuery` 继续作为核心对象词。点击搜索时，App 根据已有 `asset.role` 和项目视觉类型自动生成本次 Pinterest 实际查询，不新增按钮，不回写或污染资产 JSON：

| 资产类型 | 真人摄影项目追加词 | 动画项目追加词 |
| --- | --- | --- |
| 角色 | `film character costume portrait full body movie still` | `animation character design full body key visual` |
| 场景 | `cinematic film still establishing shot wide shot` | `animation background art establishing shot wide shot` |
| 道具 | `movie prop close up film still` | `animation prop design concept art` |

其中场景必须包含 `establishing shot` 与 `wide shot`，优先得到电影或动画中的全景建立镜头；角色必须收敛到影视定妆、全身角色图或动画角色设定；道具必须收敛到电影道具截图或动画道具设计。不得搜索商品空壳、无关矢量素材、局部角落或泛化图库词。

### 3.2 打开 Pinterest

点击右栏“搜索下载参考图”后，App 按资产顺序逐项处理当前没有上传或联网参考图的资产。

Electron 主进程创建一个可复用的专用 `BrowserWindow`：

- 使用持久分区 `persist:pinterest-reference`，保留 Pinterest Cookie 和登录状态；
- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`；
- 只允许导航到 `https://www.pinterest.com/`、`https://jp.pinterest.com/` 和其 Pin 页面；
- 禁止 Pinterest 页面打开任意外部窗口；
- 搜索期间显示该窗口，让用户能看见真实搜索过程；
- 固定缩放为 100%，便于稳定截取页面元素。

搜索地址：

```text
https://jp.pinterest.com/search/pins/?q=<encodeURIComponent(searchQuery)>
```

不得再调用 `BaseSearchResource/get/` 或其他 Pinterest 私有 HTTP 接口。

### 3.3 读取渲染结果

页面完成加载后，等待搜索结果中的 Pin 链接和图片真实渲染。主进程通过 `webContents.executeJavaScript` 读取 DOM，只提取：

- 链接属于 `/pin/<id>/`；
- 链接内存在已加载且可见的图片；
- 图片具有有效宽高；
- 不是已经被用户删除过的 Pin；
- 按页面 DOM 顺序排列。

P0 不评分、不调用模型、不展示候选列表。直接选择第一个满足条件的 Pin。

等待 30 秒仍没有有效 Pin 时：

- 如果出现登录或验证页面，保持浏览器窗口可见，提示“请在 Pinterest 窗口完成登录后重试”；
- 其他情况提示“Pinterest 未加载出可用参考图，请稍后重试”；
- 不泄漏 `Error invoking remote method` 等 IPC 技术信息；
- 不阻断用户跳过搜索并直接生成资产图。

### 3.4 进入 Pin 并保存图片

选定第一个可用 Pin 后，浏览器导航到对应 Pin 页面。等待主图渲染，然后：

1. 找到页面中面积最大的、来源为 `i.pinimg.com` 的已加载图片元素；
2. 读取其 `getBoundingClientRect()`；
3. 使用一次性隐藏 BrowserWindow 打开原图，并用 Electron 原生 `webContents.capturePage(rect)` 截取图片区域；可见 Pinterest 窗口保持在 Pin 页面；
4. 以 PNG 保存到当前项目受控目录；
5. 校验文件非空且可以作为图片解码；
6. 写入资产版本并立即显示在中栏资产卡。

保存结果继续使用现有 `AssetVersion` 合同：

```json
{
  "source": "search",
  "relativePath": "assets/<assetId>/search-<id>.png",
  "sourcePageUrl": "https://jp.pinterest.com/pin/<pinId>/",
  "searchQuery": "cinematic live action anxious office worker",
  "createdAt": "ISO-8601"
}
```

`sourceUrl` 只有在页面能稳定读取 `i.pinimg.com` 地址时才保存，不作为成功必需字段。

### 3.5 gallery-dl 边界

`gallery-dl` 不是 P0 硬依赖，不新增安装器、不新增设置项：

- 本机已有可执行文件时，可用 Pin URL 下载原图并优先保存；
- 不存在、执行失败或无法复用登录状态时，立即回到浏览器元素截图；
- 浏览器截图必须可以独立完成整个流程；
- 不把 `gallery-dl` 打进 App，也不修改 `/Users/by3/Documents/jiucaihezi-app`。

## 4. 删除与重新搜索

现有规则保持：

- 有上传或联网参考图的资产不重复搜索；
- 用户删除不满意的上传或联网参考版本后，该资产恢复为待补参考状态；
- 再次点击“搜索下载参考图”时，只处理没有参考图的资产；
- 其他已有满意参考图的资产不变；
- AI 生成资产版本不允许通过参考图删除按钮删除。

为避免重搜得到同一张被删除的 Pinterest 图片，资产增加最小历史字段：

```json
{ "rejectedReferencePinIds": ["123456789"] }
```

删除联网参考版本时，从 `sourcePageUrl` 提取 Pin ID 并写入该字段。DOM 读取结果自动跳过这些 Pin。P0 不展示该历史，也不保存完整候选列表。

## 5. 执行与状态

批量搜索按资产串行执行，避免同时打开多个 Pinterest 页面：

```text
角色 1 -> 场景 1 -> 道具 1
```

每项只需要四个内部状态：

```text
打开搜索页 -> 读取结果 -> 保存图片 -> 完成/失败
```

- 单项失败继续处理下一资产；
- 全部完成后统一显示简短结果；
- 错误只显示资产名和可执行原因，不重复在 Toast 与右栏展示完整技术堆栈；
- 用户关闭 Pinterest 浏览器窗口视为取消当前搜索，其他资产保持不变；
- 连续资产搜索复用可见窗口，下一项开始会取消关闭计时；最后一项成功后自动关闭；登录、验证或失败时保留窗口；
- 搜索结果写入现有项目状态持久化，不另建任务系统。

## 6. Skill 与工具边界

`jc-asset-reference-search` 只描述固定编排：

```text
browser_search_pinterest
  -> browser_open_first_pin
  -> browser_capture_pin_image
  -> save_asset_reference
```

这些名称是执行职责，不要求建立四层抽象。P0 可以由一个 Electron 主进程函数顺序完成。

- 专业资产 Skill：只生成完整 `design` 与由其派生的 `searchQuery`；`design.project` 内含项目视觉风格和画面比例，是资产生图唯一事实源；
- 搜索 Skill：约束浏览器执行顺序和结果合同；
- Electron：创建受控浏览器、读取 DOM、截图、写盘；
- 模型：不参与搜图、选图、下载和视觉分析；
- 图像模型：仅在用户点击“生成资产图”后使用提示词与可选参考图。

## 7. UI 合同

不新增第四个按钮，不新增候选面板，不在中栏加入浏览器控制：

- 右栏仍是“生成资产提示词 / 搜索下载参考图 / 生成资产图”；
- 搜索时弹出一个独立 Pinterest 浏览器窗口，展示真实搜索和 Pin 页面；
- 中栏资产卡只显示已保存结果；
- 当前选中参考版本仍可预览和删除；
- 浏览器登录或验证只在专用窗口完成，不把账号信息传给模型或渲染进项目 Wiki。
- 用户点击“生成资产图”即视为明确提交，不再弹出第二次确认框；三个页面级按钮及其顺序不变。

### 7.1 参考图参与生图

`design` JSON 仍是唯一资产设计事实源，搜索或上传参考图不得修改 JSON。只有当前资产存在上传或搜索参考图时，App 在提交图像模型的瞬间，按照已有 `asset.role` 自动在 JSON 前注入一条类型专属规则：

- 角色：参考图只约束身份、脸部、发型、体型轮廓和服装关键元素；忽略背景、文字与原画风。
- 场景：参考图只约束空间布局、建筑结构、环境层次和整体氛围；忽略人物、临时道具、文字与原画风。
- 道具：参考图只约束外形轮廓、结构、材质和可识别细节；忽略人物、手部、背景、文字与原画风。

最终画风、比例、光影和其他要求始终服从当前资产 `design` JSON。无参考图时仍只提交原始 JSON。不得使用一条同时声称参考角色、场景和道具的通用指令，也不得要求模型参考图片中不存在的资产类型。

## 8. 安全约束

- Pinterest 页面运行在独立、沙箱化 BrowserWindow，不能访问 App preload、Node.js 或项目文件；
- 所有项目写盘由主进程完成，网页不能指定输出路径；
- 只接受当前项目合法 `assetId`，并把输出限制在该资产目录；
- 页面导航和主图来源必须通过 Pinterest 域名白名单；
- 截图前重新校验当前 URL 是已选择 Pin 页面；
- 不记录 Pinterest Cookie、账号内容、页面 HTML 或搜索浏览历史到项目 Wiki；
- App 退出时关闭专用浏览器窗口，持久分区只保留站点会话。

## 9. 明确不做

- 不调用模型判断哪张图片最匹配；
- 不评分、不排序、不展示多个候选；
- 不调用 Pinterest 私有 HTTP 接口；
- 不引入 Playwright、Puppeteer 或新的浏览器依赖；
- 不要求用户安装 `gallery-dl`；
- 不自动分析参考图视觉 DNA，也不自动改写资产提示词；
- 不并行打开多个 Pinterest 窗口；
- 不恢复 Bing、Wikimedia 或其他静默备用图库。

## 10. 验收标准

1. 点击“搜索下载参考图”会打开真实 Pinterest 浏览器窗口，而不是后台请求私有接口。
2. 搜索查询包含题材/媒介/风格、资产类型和关键特征，不按空格机械限制单词数。
3. App 从已渲染 DOM 按页面顺序进入第一个可用 Pin，不调用模型。
4. App 能用浏览器元素截图独立保存参考图；没有 `gallery-dl` 也能成功。
5. 成功图片立即成为该资产当前参考版本并显示在中栏资产表。
6. 已有参考图的资产不会重复搜索；删空后只补搜该资产。
7. 删除联网参考后重搜不会再次采用同一 Pin。
8. Pinterest 要求登录时保留可见窗口，并给出可执行提示。
9. 单项失败不影响其他资产，也不阻断直接生成资产图。
10. 用户界面不显示 IPC 方法名、堆栈或重复的大段错误。
11. 不修改 `/Users/by3/Documents/jiucaihezi-app` 的任何文件。
12. 搜索实际查询按角色、场景、道具自动追加影视制作限定词，场景查询必须包含全景建立镜头限定。
13. 有参考图时，图像模型收到当前资产类型专属的参考规则与完整 JSON；无图时不注入参考规则。
14. “生成资产图”点击后直接执行，不出现重复确认弹窗。

## 11. 实施顺序

1. 删除当前 `BaseSearchResource/get/` 搜索路径，建立一个可复用的 Pinterest `BrowserWindow`。
2. 实现搜索页 DOM 读取、首个有效 Pin 选择和被删除 Pin 排除。
3. 实现 Pin 主图元素截图、项目目录写入和 `AssetVersion` 回写。
4. 接通串行批量处理、登录/取消/超时状态和简洁错误提示。
5. 更新 `jc-asset-reference-search` 合同，删除后台 HTTP 下载描述。
6. 增加合同测试、DOM 解析测试和删除后重搜测试。
7. 完成一次真实 Pinterest 搜索、Pin 导航、截图保存和资产版本合同验收；打包 App 验收留到正式打包轮次。

## 12. 真实浏览器验收记录

2026-07-31 使用独立 Electron 审计入口完成真实联网验收，本轮未打包 App：

- 查询：`cinematic anxious office worker character reference`
- Pin：`https://jp.pinterest.com/pin/216243219604437379/`
- 原图：`https://i.pinimg.com/736x/d5/1b/20/d51b204e858d4d095759a002eb4fb927.jpg`
- 输出：`reference-search-audit.png`
- 结果：成功进入真实 Pin 并保存独立图片；输出不含浏览器导航、Pinterest 按钮、推荐内容或页面空白区域。
