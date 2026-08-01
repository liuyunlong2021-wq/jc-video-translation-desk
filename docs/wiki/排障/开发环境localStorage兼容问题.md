# 开发环境 localStorage 兼容问题

## 状态

已于 2026-07-30 修复。项目没有使用 Vue DevTools 的产品能力，因此移除 `vite-plugin-vue-devtools` 及其 Vite 配置入口。

## 现象

`pnpm dev` 加载 `vite.config.ts` 时，`@vue/devtools-kit@7.7.7` 在 Node 环境执行：

```text
TypeError: localStorage.getItem is not a function
```

同一问题曾使 `src/runtime/mediaTask.test.ts` 在导入 Vue/Pinia 链路时失败。

## 已排除方案

不要把 `--no-experimental-webstorage` 放入 `NODE_OPTIONS`。Electron 22 会直接拒绝该选项并以退出码 9 结束：

```text
electron: --no-experimental-webstorage is not allowed in NODE_OPTIONS
```

## 根因与修复

`vite.config.ts` 静态导入并启用了 `vite-plugin-vue-devtools`。插件加载 `@vue/devtools-kit` 时立即访问 Node 25 暴露但不可用的实验性 `localStorage`，因此尚未进入应用代码就失败。

移除该未使用插件后，Vite 配置不再加载 DevTools Kit。Pinia 的测试依赖仍会间接加载 DevTools Kit，因此测试命令通过 `src/runtime/test-setup.cjs` 在导入模块前提供最小标准 `localStorage`。2026-07-30 完整测试 39 项全部通过，应用代码与未签名本地包构建成功。

相关验证见 [[巡检报告/2026-07-30验证状态]]。
