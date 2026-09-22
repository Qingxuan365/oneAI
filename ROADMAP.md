# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 9 - 全面升级各大模型官方品牌专属矢量徽标完成
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
- [x] Phase 9: 全面升级各大模型官方品牌专属矢量徽标：
  - 彻底替换原有随意的通用简陋图标（如无辨识度的四角星、不规则形状等）。
  - **Moonshot Kimi Code**：官方电光蓝胶囊点（`#1783FF`）与标志性 K 几何字形。
  - **OpenAI Codex**：官方六瓣连环螺旋徽标（官方品牌绿 `#10A37F`）。
  - **Anthropic Claude Code**：官方原版暖赤陶多角星芒徽标（`#D97757`）。
  - **OpenCode**：`opencode.ai` 官方像素方块 Terminal 徽标（天蓝 `#38BDF8` 核心 + 白灰几何块）。
  - 联动更新：侧边栏分组列表、顶栏会话面包屑、新建任务弹窗全链路统一对齐。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 打包为 Windows 便携版单文件可执行程序（`.exe`）。

## 3. 阻塞与风险
- 暂无阻塞。官方矢量徽标渲染清晰，各模型视觉区分度鲜明，构建测试通过。

## 4. 最近验证
- **2026-09-22**：
  - 对比各大模型官方 Brand Guidelines 与权威矢量资产（LobeHub Icons & opencode.ai favicon.svg），精准提取并对齐官方 SVG 路径与专属品牌色。
  - 验证侧边栏（Sidebar）、顶栏（Topbar）与新建任务弹窗（NewTaskModal）中各徽标在 16px/18px 尺寸下的矢量锐利度与色彩表现。
  - 执行 `npx tsc --noEmit` 与 `npm run build` 均 0 报错通过。


