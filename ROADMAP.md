# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 7 - 界面与终端字体大小手动设置与快捷缩放完成
- **状态**：就绪可用（Ready & Verified）

## 2. 进度看板

### 已完成
- [x] 完成多 CLI 工作台 UI 效果图设计与确认（含各大模型品牌 Logo、树状多任务分组与顶栏单行横排实时额度）。
- [x] 确立项目级规范文档 [AGENTS.md](file:///d:/GitHub/OneDesktop/AGENTS.md) 。
- [x] 初始化本地 Git 仓库与 `.gitignore` 规则。
- [x] 出具完整开发实施计划 [implementation_plan.md](file:///C:/Users/31317/.gemini/antigravity/brain/e1268a3a-17f8-419c-a5fd-ef3ba0c51fb0/implementation_plan.md) 。
- [x] Phase 1: 搭建 Electron + Vite + React 18 + Tailwind CSS 基础工程骨架。
- [x] Phase 2: 实现 Electron 主进程 `node-pty`（Windows ConPTY）多进程池管理与真实大模型配额服务。
- [x] Phase 3: 构建大模型专属品牌 Logo 资产库（Codex / Kimi / OpenCode / Claude 等）与双层会话数据模型。
- [x] Phase 4: 研发左侧树状折叠子任务菜单、顶栏单行横排实时额度组件与右侧 `@xterm/xterm` 多实例保活视窗。
- [x] Phase 5: 解决终端输入光标抖动与 Codex 控制台粒子动画横移残影问题。
- [x] Phase 6: 多 CLI 真实配额对接与切换联动（Kimi 官方 API、Codex 本地会话解析、Claude 本地快照与离线适配）。
- [x] Phase 7: 界面与终端字体大小手动设置与快捷缩放：
  - 终端代码字体：默认由 13px 提升至 15px，支持 12px ~ 24px 任意微调，热更新 xterm 字符矩阵且不中断会话。
  - 界面全局缩放：提供紧凑 (90%)、标准 (100%)、舒适 (110%)、大号 (125%) 四档，自适应高分屏。
  - 快捷操作与持久化：侧边栏左下角增设「⚙️ 设置」弹窗入口，支持 `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` 快捷缩放，偏好配置持久化保存至 `localStorage`。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 打包为 Windows 便携版单文件可执行程序（`.exe`）。

## 3. 阻塞与风险
- 暂无阻塞。界面渲染、终端热重排与配置持久化均已调通并经过构建验证。

## 4. 最近验证
- **2026-09-22**：
  - 验证字体大小与外观设置弹窗（`SettingsModal`）交互，支持终端字号滑块、常用预设（13/14/15/16/18/20px）及实时预览。
  - 验证终端热更新逻辑：`TerminalViewport` 在 `fontSize` 改变时无缝更新已有终端实例并触发 `fitAddon.fit()`。
  - 验证全局快捷键 `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` 缩放响应。
  - 验证 UI 缩放四档动态切换与 `localStorage` 自动持久化存储。
  - 执行 `npx tsc --noEmit` 与 `npm run build` 均 0 报错通过。
