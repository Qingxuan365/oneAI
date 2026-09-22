# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 14 - 集成系统原生终端菜单并完成 Windows 双格式 `.exe` 应用打包
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
- [x] Phase 10: 生成专属 Terminal 风格应用图标（应用于应用 Favicon、窗口标题栏及 AppLogo）。
- [x] Phase 11: 深度集成 xAI Grok CLI 工作台支持。
- [x] Phase 12: 侧边栏各模型官方专属正版矢量徽标恢复与 Grok 正版官方徽标对齐。
- [x] Phase 13: 彻底根除右侧终端视窗滚动文字残影与左侧边缘拖影（WebGL 加速 + Win11 ConPTY 构建号 26200 对齐）。
- [x] Phase 14: 集成系统原生终端菜单并打包为 Windows 原生 `.exe` 应用。
- [x] Phase 15: 彻底消除所有 CLI 模型硬编码，实现全量动态感知与实时监听。
- [x] Phase 16: 修复 Claude Code 切换模型动态生效与全量支持模型推理思考等级（Effort Level）徽标展示：
  - **修复 Claude Code 切换模型优先级 Bug**：将 `~/.claude.json` 最近活跃项目使用记录（`lastModelUsage`）与 `settings.json` 的 `model`（及 `ANTHROPIC_DEFAULT_${model}_MODEL` 别名映射）提升为最高优先级，彻底解决此前被固定环境变量 `ANTHROPIC_MODEL: deepseek-flash` 劫持覆盖的问题；当用户切换为 opus 时，自动解析呈现为当前真实使用的 `deepseek-v4-pro`。
  - **全量支持模型推理思考等级（Effort Level）感知与展示**：
    - 动态解析 Claude Code 的 `effortLevel`（如 `medium`、`high` 等）。
    - 动态解析 Codex 的 `model_reasoning_effort`（如 `medium`、`high` 等）。
    - 动态解析 Grok CLI 的 `reasoning_effort`（如 `high`、`xhigh` 等）。
  - **顶栏单行微标高亮设计**：在顶栏模型徽章内增加紧凑精致的等级徽标，按等级提供专属微光色彩（`low`: 蓝光，`medium`: 翡翠绿，`high`: 琥珀金，`xhigh`/`max`: 紫光），实时感知终端变动。
  - **重新构建与打包**：成功编译输出最新带完整 Effort 徽标支持的 Windows 可执行文件：`release/OneDesktop-Portable-1.0.0.exe`（74.4 MB）与 `release/OneDesktop-Setup-1.0.0.exe`（74.6 MB）。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 后续多窗口分屏支持（Split Terminal View）。

## 3. 阻塞与风险
- 暂无阻塞。已完整修复模型切换联动与推理思考等级展示，已编译生成最新 Windows 可执行文件。

## 4. 最近验证
- **2026-09-22**：
  - 针对主人当前真实运行的 Claude Code 执行解析，精准提取出 `{ model: 'deepseek-v4-pro', effort: 'medium' }`，与终端提示完全一致。
  - 执行 `npm run build` 和 `npx electron-builder --win` 成功打包生成最新版便携式与安装向导 `.exe`（生成时间：11:33）。








