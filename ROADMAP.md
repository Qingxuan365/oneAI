# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 6 - 多 CLI 真实配额接入与动态顶栏联动完成
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
- [x] Phase 6: 多 CLI 真实配额对接与切换联动：
  - Kimi Code：通过 `~/.kimi-code/credentials/kimi-code.json` 鉴权并访问官方 `/usages` API 实时获取 5h/7d 剩余百分比与重置时间。
  - OpenAI Codex：自动扫描 `~/.codex/sessions/**/*.jsonl` 最新会话，解析 `token_count` 官方 `rate_limits` 提取 5h/7d 真实限额。
  - Claude Code：通过本地快照及会话记录提取活跃模型与上下文用量。
  - OpenCode：本地未安装时提供离线/未配置状态优雅展示。
  - 顶栏单行横排联动：左侧切换会话任务时，右上角顶栏即时动态联动显示当前选定 CLI 的真实额度与模型。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 打包为 Windows 便携版单文件可执行程序（`.exe`）。

## 3. 阻塞与风险
- 暂无阻塞。原生模块、会话进程池与真实配额抓取均已调通并经过本地验证。

## 4. 最近验证
- **2026-09-22**：
  - 验证 Kimi Code 官方 API 鉴权拉取：返回 `5h: 100% (1h 35m)`、`7d: 11% (Resets Wed 21:05)`，状态正常。
  - 验证 OpenAI Codex 本地会话解析：成功解析最新会话并提取 `gpt-5.6-luna` (Plus)，`5h: 1% (2h 55m)`、`7d: 69% (Resets Mon 20:15)`。
  - 验证 Claude Code 本地快照解析：提取当前配置模型 `deepseek-flash` 及状态。
  - 验证前端顶栏单行纯文字渲染与会话切换联动，支持手动单项即时刷新。
  - 执行 `npx tsc --noEmit` 与 `npm run build` 均 0 报错通过。
