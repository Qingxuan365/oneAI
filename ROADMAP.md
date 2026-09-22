# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 11 - 深度集成 xAI Grok CLI 工作台支持完成
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
- [x] Phase 7: 界面与终端字体大小手动设置与快捷缩放（支持 12px ~ 24px 任意微调，UI 缩放 4 档，持久化至 `localStorage`）。
- [x] Phase 8: 彻底根治 Codex 终端星空粒子动画引发的光标横移跳动顽疾（数据流伪光标过滤 + 16ms 微帧缓冲合并）。
- [x] Phase 9: 全面升级各大模型官方品牌专属矢量徽标。
- [x] Phase 10: 生成专属 Terminal 风格应用图标并全站统一为终端风格。
- [x] Phase 11: 深度集成 xAI Grok CLI：
  - 注册 `grok` CLI 分组类型与专属标识。
  - 为 Grok 定制 xAI 极简冷光星系白（`#F8FAFC`）Terminal 终端微光徽标。
  - 在侧边栏内置 `Grok CLI` 独立分组、默认并发会话及多任务派生能力。
  - 在 PTY 进程管理器中为 `grok` 增加防未安装闪退的安全降级机制。
  - 在配额服务中增加 Grok 模型（`grok-2`）状态侦测与联动刷新。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 打包为 Windows 便携版单文件可执行程序（`.exe`）。

## 3. 阻塞与风险
- 暂无阻塞。Grok CLI 已无缝纳入系统管理，类型检查与全量构建均通过。

## 4. 最近验证
- **2026-09-22**：
  - 完成 Grok CLI 全链路集成（类型声明、专属图标、默认分组、PTY 命令保护与配额联动）。
  - 执行 `npx tsc --noEmit` 与 `npm run build` 均 0 报错通过。



