# TDD-15：字幕来源与画面角色识别重构

## 背景

视频翻译工作台的核心目标不是“运行某个识别模型”，而是拿到一份准确、带时间戳、可人工确认的中文字幕。旧链路把“抽帧校准”同时承担了画面字幕建议和画面人物识别，导致用户误以为它会精准读取硬字幕；实际实现是中点抽帧后让多模态模型输出建议，存在改写、猜测和单帧无人等问题。

本轮重构把“字幕来源”和“角色识别”拆开：

- 字幕来源负责生成权威字幕表；
- 画面角色识别只负责人物证据和角色候选；
- 大模型语义推断只能生成候选，不得覆盖字幕事实。

## 用户语言

界面不得暴露 OCR、ASR、FunASR、抽帧等专业词作为主操作名称。字幕来源使用用户能理解的三种素材状态：

1. 导入 SRT
2. 上传有字幕视频
3. 上传无字幕视频

主动作统一为：获取字幕。

## 目标

1. 新增字幕来源选择器，并以“获取字幕”作为唯一主入口。
2. 支持导入 SRT，直接生成字幕工作台 cues，跳过音频识别和画面字幕识别。
3. 支持上传有字幕视频，使用本地视频字幕 OCR 生成 SRT/cues。
4. 支持上传无字幕视频，继续使用 FunASR 音频识别生成 SRT/cues。
5. 删除旧“抽帧校准”作为字幕改写入口的产品概念。
6. 新增或重命名“画面识别人物”，用多帧与上下文辅助角色确认，不再修改字幕文本。
7. 大模型 prompt 分层：SRT 文本说话人候选、画面人物证据、文本+画面合并建议。

## 非目标

- 不在第一版自动保证所有硬字幕 OCR 100% 准确；OCR 结果仍需人工确认入口。
- 不让大模型直接改写已导入 SRT 或 OCR 成功字幕。
- 不把角色绑定完全自动化；低置信度必须进入人工确认。
- 不在安装包内预置大型 OCR 模型；模型仍走一键安装或按需下载策略。

## 字幕来源优先级

准确性优先级固定为：

1. 用户导入 SRT：最高优先级，作为权威字幕来源。
2. 上传有字幕视频：使用视频硬字幕 OCR 读取屏幕字幕。
3. 上传无字幕视频：使用 FunASR 从音频识别字幕。
4. 大模型语义校准：仅作为人工可选建议，不作为字幕来源。

## UI 合同

字幕工作台右侧操作区改为：

- 更换视频
- 字幕来源选择器：
  - 导入 SRT
  - 上传有字幕视频
  - 上传无字幕视频
- 获取字幕
- 画面识别人物
- 大模型语义校准（可选，弱化为辅助）
- 翻译所有字幕
- 进入配音工作台

门禁：

- 未获取字幕前，翻译和配音入口禁用。
- 选择“导入 SRT”时，点击“获取字幕”打开 SRT 文件选择。
- 选择“上传有字幕视频”时，点击“获取字幕”运行视频字幕 OCR。
- 选择“上传无字幕视频”时，点击“获取字幕”运行 FunASR。
- “画面识别人物”只在已有字幕 cues 后可用。
- 旧“抽帧校准”按钮必须删除，不得仅改文案继续调用旧字幕改写逻辑。

## 字幕数据合同

每条字幕 cue 必须保留来源：

```ts
type SubtitleSourceKind = 'imported-srt' | 'video-ocr' | 'audio-asr'

interface VideoTranslationCue {
  cueId: string
  startMs: number
  endMs: number
  sourceText: string
  recognizedText?: string
  subtitleSourceKind: SubtitleSourceKind
  subtitleSourcePath?: string
  subtitleConfidence?: number
}
```

规则：

- `sourceText` 是翻译前的权威工作稿。
- `recognizedText` 只保存机器识别原文；导入 SRT 时可与 `sourceText` 相同。
- SRT/OCR/FunASR 生成的 JSON 与 SRT 必须成对落盘。
- 时间戳不得由大模型修改。
- 大模型语义校准只能写入建议字段，不得直接覆盖 `sourceText`。

## 导入 SRT 合同

导入 SRT 时：

- 解析标准 SRT 时间格式 `HH:MM:SS,mmm --> HH:MM:SS,mmm`。
- cue 必须按时间递增、不可重叠、文字非空。
- cue 结束时间不能超过视频时长容忍范围。
- 成功后写入：
  - `wiki/翻译/{episodeId}/原始字幕.srt`
  - `wiki/翻译/{episodeId}/原始转写.json`
- 字幕工作台立即展示导入字幕。

失败时：

- 不清空现有字幕。
- 显示明确错误：SRT 时间格式错误、字幕重叠、字幕为空或超过视频时长。

## 有字幕视频 OCR 合同

“上传有字幕视频”路线使用本地 OCR 读取画面硬字幕。

推荐实现：

- 第一版优先接 RapidOCR / RapidVideOCR。
- 视频关键帧或字幕区域识别流程：
  - 提取字幕区域关键帧；
  - OCR 识别文字；
  - 合并连续相同文字；
  - 输出标准 SRT；
  - 转为字幕工作台 cues。

规则：

- OCR 只读取屏幕可见字幕，不得根据音频补全文字。
- OCR 置信度低、空白、乱码时标记 `needsReview` 或提示用户改用无字幕视频路线。
- 不自动调用大模型改写 OCR 文本。
- OCR 输出也必须保留可人工编辑。

## 无字幕视频 FunASR 合同

“上传无字幕视频”路线沿用现有 FunASR：

- FFmpeg 提取 16 kHz 单声道音频；
- FunASR 输出 JSON/SRT；
- 程序校验时间戳、cue 顺序、空文本和越界；
- 结果进入字幕工作台。

改动要求：

- 用户不再看到“FunASR”作为主按钮名；
- 本地引擎未就绪时，引导“生成设置 -> 一键安装/修复本地字幕引擎”；
- 不再显示 `pnpm probe:funasr` 给普通用户。

## 画面识别人物合同

旧“抽帧校准”退出字幕修正职责，改为“画面识别人物”。

输入：

- 已确认或待确认字幕 cues；
- 原视频；
- 已有角色库；
- 已有画面人物目录。

抽帧策略：

- 每条 cue 至少抽 3 帧：
  - 开始后 20%
  - 中点 50%
  - 结束前 80%
- 对低置信度或无人画面，可补抽前后相邻 cue 的关键帧。
- 批处理继续按 20 条 cue 左右，批次之间携带人物目录。
- 批次必须保留输入 hash 和人物目录 hash，避免复用过期结果。

输出：

```ts
interface VisualPersonEvidence {
  visualPersonId: string
  features: string
  confidence: number
}

interface CueVisualEvidence {
  cueId: string
  sampledFramePaths: string[]
  visiblePersonIds: string[]
  mostLikelySpeakingPersonId?: string
  confidence: number
  needsReview: boolean
  evidence: string
}
```

规则：

- 画面无人、背影、遮挡、多人无法确认时不得硬绑定。
- 允许画外音。
- 视觉 ID 不等于正式角色 ID。
- “画面识别人物”不得修改字幕文本。

## Prompt 设计

### Prompt A：SRT 文本说话人候选

输入：整集或分批 SRT cues。

输出：

```json
{
  "speakerCandidates": [
    {
      "speakerId": "speaker-1",
      "traits": "语气、称呼、关系推断",
      "confidence": 0.72
    }
  ],
  "turns": [
    {
      "cueId": "cue-001",
      "speakerId": "speaker-1",
      "confidence": 0.74,
      "evidence": "相邻问答与称呼证据"
    }
  ]
}
```

约束：

- 字幕文本是事实，不得改写。
- 只推断说话人轮次，不创造真实姓名。
- 尽量使用最少说话人数量。
- 不确定时输出 `unknown` 并降低置信度。

### Prompt B：多帧画面人物证据

输入：每条 cue 的 3 到 5 帧图片、cue 文本和前后文。

输出：`VisualPersonEvidence` 与 `CueVisualEvidence`。

约束：

- 只记录画面真实可见人物。
- 多人同框、无口型或无镜头语言时不得强行判断正在说话的人。
- 允许复用已有 `visualPersonId`，新人物按序递增。

### Prompt C：文本候选与画面证据合并

输入：Prompt A 结果、Prompt B 结果、已有角色库。

输出：

```json
{
  "roleBindings": [
    {
      "cueId": "cue-001",
      "speakerId": "speaker-1",
      "visualPersonId": "visual-person-1",
      "translationRoleId": "role-1",
      "confidence": 0.84,
      "source": "text+visual",
      "needsReview": false
    }
  ]
}
```

约束：

- 视觉证据清晰时优先。
- 只有文本推断时必须低置信度并要求人工确认。
- 不得把推断当事实。
- 不得因单句台词创建正式角色，除非多条证据稳定。

核心系统约束：

> 字幕文本是权威事实；画面是角色证据；大模型推断只是候选，不得覆盖事实。

## 删除与迁移

必须删除或迁移：

- UI 上的“抽帧校准”按钮。
- 后端“抽帧校准会返回字幕建议并写入 frameSuggestion”的产品路径。
- 文档中“抽帧校准读取字幕/修正字幕”的描述。
- 任何把多模态模型输出直接作为字幕事实的逻辑。

可保留但需改名/改职责：

- 现有批处理任务框架；
- 抽帧缓存；
- 每批 20 条、批次复用与失败重试；
- 画面人物目录。

历史项目迁移：

- 已存在的 `frameSuggestion` 只作为旧项目兼容展示，不再作为新流程生成字段。
- 已确认的 `sourceText` 不受迁移影响。
- 旧的画面人物 ID 可迁移到新的视觉人物目录。

## 测试计划

### 单元与合同测试

1. SRT 解析成功生成 cue，时间戳毫秒准确。
2. SRT 重叠、空文本、越界时拒绝且不清空旧字幕。
3. `subtitleSourceKind` 支持 `imported-srt`、`video-ocr`、`audio-asr`。
4. UI 不再出现“抽帧校准”。
5. UI 出现“字幕来源”、“导入 SRT”、“上传有字幕视频”、“上传无字幕视频”和“获取字幕”。
6. “画面识别人物”存在且不调用字幕改写接口。
7. 大模型语义校准不得修改 cue 数量、ID、顺序或时间戳。

### 集成测试

1. 导入一份真实 SRT 后，字幕工作台立即显示字幕并可翻译。
2. 上传有字幕视频后，OCR 生成 SRT/cues，FunASR 不被调用。
3. 上传无字幕视频后，FunASR 生成 SRT/cues，OCR 不被调用。
4. 画面识别人物对同一 cue 的多帧输入输出视觉证据，字幕文本保持不变。
5. 某批画面识别失败后，已成功批次保留，后续重跑不复用过期目录。

### 桌面验收

1. 用户选择“导入 SRT”，点“获取字幕”，字幕表和播放器可对齐。
2. 用户选择“上传有字幕视频”，点“获取字幕”，硬字幕视频能产出可编辑字幕。
3. 用户选择“上传无字幕视频”，点“获取字幕”，无字幕视频能产出 FunASR 字幕。
4. 用户点“画面识别人物”，系统给出角色候选而不改字幕。

## 执行顺序

1. 先实现导入 SRT。
2. 重构 UI 为字幕来源选择器和“获取字幕”。
3. 删除旧“抽帧校准”按钮与字幕改写调用。
4. 将现有抽帧批处理迁移为“画面识别人物”。
5. 接入视频硬字幕 OCR。
6. 接入文本说话人候选和文本+画面合并 prompt。
7. 更新 docs/wiki、README 和端到端验收文档。
