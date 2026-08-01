---
name: jc-asset-reference-search
description: Open Pinterest in a real browser and capture one traceable reference image for a character, scene, or prop. Use when an asset already has a searchQuery and needs an optional local reference image before image generation.
---

# 资产参考图搜索

只负责搜索并下载参考图。不得生成或修改资产设计、生图提示词和资产图。

## 输入

```json
{ "assetId": "asset-prop-1", "searchQuery": "rusty sickle prop design" }
```

- `assetId` 必须原样返回；
- `searchQuery` 必须是专业资产 Skill 已生成的一条精确英文查询，包含媒介、具体对象和制作用途构图，不得删减为单个泛词，也不得扩写为多条查询。

## 执行

1. 使用 App 提供的受控 `search_and_download` 工具，在真实 Electron 浏览器中打开 Pinterest 搜索页。
2. 读取已渲染 DOM，按页面顺序进入第一个有效且未被用户删除的 Pin，不调用模型筛选。
3. 在隐藏的受控窗口打开 Pin 主图地址，只截取页面唯一图片元素并保存到当前项目受控目录；可见 Pinterest 窗口不得跳到原图，截图不得包含导航栏、文字或相关推荐。
4. 保留搜索词、原图 URL、来源页面 URL 和项目相对路径。
5. Pinterest 需要登录时保留可见浏览器窗口；搜索失败明确返回错误，不改用私有接口或其他图片站，不修改任何已有资产数据。
6. 连续资产搜索复用同一个可见窗口；全部成功后自动关闭，登录、验证或搜索失败时保留窗口供用户处理。

该能力依赖 Electron 真实浏览器会话；独立验收必须运行 Electron 审计入口，不能退回普通 HTTP 脚本。

## 输出

```json
{
  "assetId": "asset-prop-1",
  "searchQuery": "rusty sickle prop design",
  "selectedImage": {
    "sourceUrl": "https://i.pinimg.com/...",
    "sourcePageUrl": "https://jp.pinterest.com/pin/.../",
    "relativePath": "assets/asset-prop-1/search.jpg"
  }
}
```

不得声称模型本身下载了文件；实际联网、写盘和路径校验必须由受控工具或随 Skill 提供的脚本完成。
