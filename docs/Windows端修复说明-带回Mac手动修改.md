# Windows 端确认过的两处代码修复

这份文档记录的是在 Windows 机器上验证过、确认有效的两处修复。请在 Mac 上找到对应文件，手动做同样的修改。

---

## 修复 1：字幕乱码（Windows 上中文显示乱码）

**文件位置：**
```
electron/video-translation-asr.ts
```

**问题原因：**
调用 FunASR 的 Python 子进程时，Windows 上默认输出编码不是 UTF-8，导致返回的中文字幕被错误解码，显示为乱码。

**修改内容：**
找到调用 Python 脚本的子进程创建代码（通常是 `spawn(...)` 或 `execFile(...)` 之类的调用），在传给子进程的环境变量里，补充这两个变量：

```
PYTHONIOENCODING=utf-8
PYTHONUTF8=1
```

具体做法：找到类似下面结构的代码（写法可能略有差异，关键是找到 `env` 这个配置项）：

```ts
spawn(pythonPath, args, {
  env: {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  },
})
```

如果原来的调用没有 `env` 配置，就补上这一项；如果已经有 `env` 但没写这两个变量，就在里面加上这两行。

---

## 修复 2：翻译模式下"按提示词生成角色参考音"按钮消失

**文件位置：**
```
src/views/Home/components/VideoRender.vue
```

**问题原因：**
"按提示词生成角色参考音"这个按钮的代码上写了 `v-if="!translationMode"`，导致翻译模式（Windows 版）下这个按钮被主动隐藏，跟 Mac 非翻译版行为不一致。

**修改内容：**
找到这个按钮对应的模板代码，类似：

```vue
<v-btn v-if="!translationMode" @click="generateReferenceVoice">
  按提示词生成角色参考音
</v-btn>
```

把 `v-if="!translationMode"` 这个属性整个删掉，改成：

```vue
<v-btn @click="generateReferenceVoice">
  按提示词生成角色参考音
</v-btn>
```

（也就是让这个按钮不再受 `translationMode` 条件限制，始终显示在"角色配音"页签里）

---

## 配套修改：测试文件

**文件位置：**
```
src/runtime/videoTranslation.test.ts
```

**修改内容：**
如果这个测试文件里有针对"按提示词生成角色参考音"按钮可见性的断言（比如断言翻译模式下这个按钮不可见/不存在），需要把对应断言删掉或改成"按钮应该可见"。

请在 Mac 上打开这个测试文件，搜索关键词 `translationMode` 或 `生成角色参考音` 或 `generateReferenceVoice`，找到相关的测试用例，按新的按钮行为（翻译模式下也应该显示）调整断言。

---

## 改完之后

1. 在 Mac 上执行 `pnpm test`，确认测试通过
2. `git add` 这 3 个文件，`git commit`，`git push`
3. 因为 Windows 这台机器还没提交这两处改动，之后不要在 Windows 上重复提交同样的内容，直接 `git pull` 同步 Mac 推送的版本即可，避免冲突
