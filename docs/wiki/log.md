# Wiki Log

## 2026-07-30

- 使用 `jc-everything-wiki` 建立开发项目 Wiki 骨架。
- 记录分段式 AI 短视频工作流、固定模型合同、单核心参考资产、媒体持久化和 FFmpeg 统一配音规则。
- 记录视频接口、滚动布局、素材恢复、旧 Electron 进程与动态分块不一致等已验证经验。
- 完成 39 项自动测试、类型检查和未签名通用应用打包；发布证书签名仍受本机钥匙串 `errSecInternalComponent` 影响。
- 记录人工验收：最终视频合成成功；提交 `57c48b6` 已推送到 `origin/main`。
- 审计根目录项目文档：重写 `README.md` 为当前 AI 原生工作流说明，在 `CHANGELOG.md` 增加未发布版本记录，并给两份 SDD 标注现行与历史状态。
- 查证 Google Cloud 官方 Veo 文档，记录图生视频、4/6/8 秒、摄像机运动、时间元素和剪辑术语能力及高级控制可靠性边界。
- 确定并实施自动、慢、中、快四档独立镜头节奏，创建 `docs/镜头节奏控制SDD.md`。
- 移除未使用的 `vite-plugin-vue-devtools`，并为 Pinia 测试入口补充最小 `localStorage` 预加载，修复 Node 25 兼容问题。
- 执行《创作参数与品牌视觉升级 SDD》：增加 9 个风格预设、动态时长、旧数据迁移、赚钱短片品牌、SVG/PNG Logo 和绿色主操作主题。
