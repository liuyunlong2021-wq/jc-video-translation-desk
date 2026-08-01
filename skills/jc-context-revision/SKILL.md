---
name: jc-context-revision
description: Revise one selected short-video object inside explicit locks and return a previewable JSON proposal. Use for scoped AI changes to the approved script, five-part voice plan, one storyboard shot, one first-frame image prompt, or one video prompt.
---

# 上下文对象局部修改

只修改输入中的当前对象。选择定义范围；`locks` 中的值必须原样保留。

## 输入

输入包含：

- `targetType`：`script`、`voice-plan`、`shot`、`image` 或 `video`；
- `targetId`：当前对象 ID；
- `instruction`：用户的修改要求；
- `current`：当前对象；
- `locks`：禁止改变的字段和值；
- `context`：理解修改所需的最小前后文。

## 修改规则

1. 文稿：返回完整候选文稿，只落实用户明确要求；保留产品名称、已验证事实和目标时长边界。
2. 声音方案：只返回完整五项声音提示词，严格保持 `【人设】`、`【音色特征】`、`【风格】`、`【情感】`、`【节奏】` 的顺序，不改文稿。
3. 单镜分镜：返回完整镜头对象。只修改当前镜；原样保留镜号、`script`、`playDuration`、`generationDuration`、总镜头数、全局视觉风格和参考资产绑定。结合相邻镜头保持动作、视线、位置和光线连续。`videoPrompt` 仍须包含“单一连续镜头”“无切镜”“无背景音乐”。
4. 图片：只返回改写后的 `storyboardImagePrompt`。锁定比例、核心主体、镜头职责和参考资产；仍为一张单幅首帧，不生成多宫格、文字或水印。
5. 视频：只返回改写后的 `videoPrompt`。锁定首帧、播放时长和单镜头合同；仍须包含“单一连续镜头”“无切镜”“无背景音乐”。
6. 不扩大范围，不改未选中的对象，不声称已生成媒体。

以下请求不能作为单对象修改执行：拆分或合并镜头、改变镜头总数、改本镜文稿或时长、重新分配文稿、改变全片导演/视觉风格/核心参考资产。遇到这些请求时设置 `requiresReplan: true`，`revised` 原样返回，并说明应回到哪个上游阶段。

## 输出

只输出合法 JSON：

```json
{
  "targetType": "shot",
  "targetId": "13",
  "revised": {},
  "changedFields": ["cameraAngle", "cameraMovement"],
  "impact": ["第 13 镜图片、视频和成片需要重做"],
  "requiresReplan": false,
  "reason": ""
}
```

`targetType` 和 `targetId` 必须与输入一致。`changedFields` 只列真实改变项；无变化时返回空数组。
