# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 5 - 核心功能研发完成与构建验证通过
- **状态**：就绪可用（Ready）

## 2. 进度看板

### 已完成
- [x] 完成多 CLI 工作台 UI 效果图设计与确认（含各大模型品牌 Logo、树状多任务分组与顶栏单行横排实时额度）。
- [x] 确立项目级规范文档 [AGENTS.md](file:///d:/GitHub/OneDesktop/AGENTS.md) 。
- [x] 初始化本地 Git 仓库与 `.gitignore` 规则。
- [x] 出具完整开发实施计划 [implementation_plan.md](file:///C:/Users/31317/.gemini/antigravity/brain/e1268a3a-17f8-419c-a5fd-ef3ba0c51fb0/implementation_plan.md) 。
- [x] Phase 1: 搭建 Electron + Vite + React 18 + Tailwind CSS 基础工程骨架。
- [x] Phase 2: 实现 Electron 主进程 `node-pty`（Windows ConPTY）多进程池管理与大模型配额服务。
- [x] Phase 3: 构建大模型专属品牌 Logo 资产库（Codex / Kimi / OpenCode / Claude 等）与双层会话数据模型。
- [x] Phase 4: 研发左侧树状折叠子任务菜单、顶栏单行横排实时额度组件与右侧 `@xterm/xterm` 多实例保活视窗。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 根据主人实际使用的 CLI 工具进一步定制具体的 API Key / Token 自动抓取 Provider。
- [ ] 打包为 Windows 便携版单文件可执行程序（`.exe`）。

## 3. 阻塞与风险
- 暂无阻塞。原生模块与渲染构建均已调通。

## 4. 最近验证
- **2026-09-22**：
  - 修复终端获取焦点后光标剧烈抖动问题：在 `TerminalViewport.tsx` 引入 100ms 防抖、字符矩阵行列变化比对，并将光标设置为原生稳定块状模式（`cursorStyle: 'block'`，禁用 CSS 动画与 ANSI 擦除冲突）。
  - 修复 Codex 输入框光标横向移动与残影拖尾问题：移除了 WebGL 显存 alpha 混合残留（`allowTransparency: false`），开启 `windowsPty: { backend: 'conpty' }` 官方 Windows ConPTY 字符协议适配，回归稳定的 DOM/Canvas 原生渲染通道。
  - 执行 `npm run build` 全量重新编译打包通过。

## 3. 阻塞与风险
- 暂无阻塞。
- 风险点：Windows 环境下 `node-pty` 原生 C++ 模块的编译与打包需确保与 Electron ABI 版本匹配。

## 4. 最近验证
- 暂未开始代码编译验证。
