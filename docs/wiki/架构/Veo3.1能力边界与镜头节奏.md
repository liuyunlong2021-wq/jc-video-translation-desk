# Veo 3.1 能力边界与镜头节奏

## 已确认的官方能力

Google Cloud 官方资料确认：

- Veo 可以把现有图片作为第一帧生成视频，也可以同时接收图片与描述性文本。
- Veo 短视频生成支持 4、6、8 秒。
- 提示词可以描述主题、动作、场景、机位、摄像机运动、光学效果、视觉风格和时间元素。
- 官方列出的时间元素包括慢动作、快节奏动作和延时。
- 官方列出的电影术语包括同景剪辑、跳切、场景建立镜头序列和蒙太奇。
- 官方明确提示，部分高级机位和镜头控制并不稳定受支持，可靠性会随整体提示和具体场景变化。

## 对本项目的约束

Veo 能理解剪辑术语，不等于它能稳定输出可逐镜控制的结构化剪辑。为了保留以下能力，本项目仍使用独立镜头：

- 每镜单独查看分镜图和视频；
- 每镜单独重试，不重复支付成功任务；
- 明确决定哪些镜头绑定核心参考图；
- 本地精确控制最终剪辑点和统一配音；
- 避免片内切镜破坏主体、场景和运动连续性。

因此镜头节奏只改变独立生成任务的数量，不让一条 Veo 视频内部执行蒙太奇。片内剪辑若未来进入产品，必须作为独立实验能力，不与普通快节奏混用。

## 节奏合同

| 档位 | 目标镜头时长 | 说明 |
|---|---:|---|
| 慢 | 7 秒 | 更长的连续动作和情绪停留 |
| 中 | 4.5 秒 | 常规讲解与信息表达 |
| 快 | 2.5 秒 | 更多独立画面和更密的信息切换 |
| 自动 | 由 Skill 解析为前三档之一 | 按文稿、视觉风格和情绪选择 |

字数不是硬切分条件。语义短句、动作变化、信息点和情绪转折决定切点；真实配音时长和节奏档位决定总镜头数。

详细实施合同见 [[开发/镜头节奏控制]] 和项目原始 SDD `docs/镜头节奏控制SDD.md`。

## 官方来源

- [Video generation prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide)
- [Generate videos from images using Veo](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-an-image)
- [Vertex AI release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)

官方网页是外部 Raw，只记录链接，不复制整页正文。来源映射见 [[来源索引]]。
