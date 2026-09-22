# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 8 - Codex 终端星空动画光标跳动顽疾彻底根治
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
- [x] Phase 8: 彻底根治 Codex 终端星空粒子动画引发的光标横移跳动顽疾：
  - 数据流伪光标过滤（`sanitizeTerminalData`）：精确剔除 Windows ConPTY 切片中在粒子擦除点位（如 `\x1b[9;1H`）无字符即误插的 `\x1b[?25h`，保持隐藏直至真实用户输入行（`\x1b[11;3H`）。
  - 微帧缓冲调度器：通过 16ms 时间窗口（对应 60Hz 帧率）原子化合并 ConPTY 拆包流，规避 DECSET 2026 同步更新断裂。
  - 光标样式现代化与自定义：默认换用与 VS Code 一致的细竖线光标（`bar`）并支持呼吸闪烁，在「⚙️ 设置」弹窗中提供竖线、方块、下划线自由切换与持久化存储。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 打包为 Windows 便携版单文件可执行程序（`.exe`）。

## 3. 阻塞与风险
- 暂无阻塞。Codex 星空动画光标跳动已降为 0 次，终端交互丝滑稳定，构建测试全量通过。

## 4. 最近验证
- **2026-09-22**：
  - 通过真实 PTY 抓包数据模拟回放验证：原终端在星空刷新时出现 2 次/帧的误跳动，新缓冲与过滤逻辑将异常跳动降为 0 次。
  - 验证用户键盘输入、Backspace 退格与长句输出：光标跟随输入正常位移，无任何延迟与残影。
  - 验证「⚙️ 设置」弹窗中光标样式（竖线/方块/下划线）与闪烁开关热切换及 `localStorage` 持久化。
  - 执行 `npx tsc --noEmit` 与 `npm run build` 均 0 报错通过。

