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
- [x] Phase 16: 修复 Claude Code 切换模型动态生效与全量支持模型推理思考等级（Effort Level）徽标展示。
- [x] Phase 17: 全量拓展所有 CLI 的模型推理思考等级（Effort Level）感知体系与热监听：
  - **Kimi Code 思考等级动态提取**：自动从 `~/.kimi-code/config.toml` 中解析 `[thinking]` 块的全局 `effort`（当前主人的设置为 `high`）与各个 model 的 `default_effort`，在顶栏高亮显示为翡翠绿/琥珀金等级徽标。
  - **Grok CLI 推理等级动态提取**：优先从 `~/.grok/config.toml` 中解析用户真实配置的 `default_reasoning_effort`（当前主人的设置为 `xhigh`），在顶栏高亮显示为专属紫光徽标；降级从 `models_cache.json` 读取。
  - **Codex 思考等级动态提取**：自动从 `~/.codex/config.toml` 中解析 `model_reasoning_effort`（当前为 `high`），在顶栏高亮显示。
  - **Claude Code 思考等级动态提取**：自动从 `~/.claude/settings.json` 中解析 `effortLevel`（当前为 `medium`），在顶栏高亮显示。
  - **OpenCode 思考等级动态提取**：支持环境变量 `OPENCODE_EFFORT` 与 `~/.opencode/config.json` 动态解析。
  - **全链路文件热监听**：为所有 CLI 的配置文件（含 `~/.kimi-code/config.toml`、`~/.grok/config.toml`、`~/.codex/config.toml`、`~/.claude/settings.json` 等）注入实时变更监听，任何 CLI 在终端切模型或改等级秒级自动更新。
- [x] Phase 18: 全局重命名为 OneAI、顶栏实时农历/公历/星期动态时钟与 Grok Build 命名对齐：
  - 应用所有呈现位置及打包配置（`package.json`、`electron-builder.json`、`index.html`、窗口标题、侧边栏品牌字）全面改名为 **OneAI**。
  - 顶栏中间区域加入 `YYYY-MM-DD（农历）HH:mm:ss （星期）` 格式精准动态时钟，基于 Chromium 原生 `Intl` 中华日历，秒数持续跳动。
  - `Grok CLI` 正式更名为 `Grok Build`。
- [x] Phase 19: 终端增强：文件/图片拖拽自动转绝对路径与剪贴板图文粘贴支持：
  - **拖拽自动转绝对路径**：利用 Electron 31 原生 `webUtils.getPathForFile` 解析外部拖入的文件或图片绝对物理路径，对含空格路径自动增加双引号包裹，写入底层 PTY 会话。
  - **剪贴板文本粘贴**：支持 `Ctrl+V`、`Ctrl+Shift+V` 及鼠标右键点击直接将剪贴板文本写入终端。
  - **剪贴板图片资料自动转路径**：当剪贴板为截图或图片时，主进程自动将其写入 `%TEMP%/OneAI_Images/paste_<timestamp>.png`，并自动将生成的高清图片绝对路径填入终端，方便 Claude Code、Codex 等大模型多模态 CLI 直接读取分析。
  - **防拖拽逃逸保护**：全局监听并阻止外层 dragover/drop 默认行为，杜绝外部文件拖入导致 Electron 窗口意外刷新或跳转。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 后续多窗口分屏支持（Split Terminal View）。

## 3. 阻塞与风险
- 暂无阻塞。文件/图片拖拽转路径、文本粘贴与截图粘贴功能已就绪并验证通过。

## 4. 最近验证
- **2026-09-22**：
  - `npm run build` 成功通过（Exit code 0）。
  - 支持拖拽任意文件（包括 `.png`、`.jpg` 等图片）自动转 Windows 绝对物理路径。
  - 支持 `Ctrl+V` / 右键粘贴剪贴板文字及截图图片（自动生成临时路径供 AI CLI 直接读取）。









