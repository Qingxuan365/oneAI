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
- [x] Phase 14: 集成系统原生终端菜单并打包为 Windows 原生 `.exe` 应用：
  - **集成系统原生终端（PowerShell）菜单**：内置「系统终端」常驻分组与多会话派生，配有专属极客微光 `>_` 面板徽标，直启 PowerShell 交互终端。
  - **生成多尺寸 Windows 原生图标**：生成 256x256 高清 `resources/icon.ico` 与 `resources/icon.png`。
  - **配置 `electron-builder` 打包工程**：配置 `asarUnpack` 保障 `node-pty` 原生模块免编译运行。
  - **成功编译输出双格式 Windows 可执行文件**：
    - 免安装单文件便携版：`release/OneDesktop-Portable-1.0.0.exe`（74.4 MB）
    - 标准安装向导安装包：`release/OneDesktop-Setup-1.0.0.exe`（74.6 MB）
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 后续多窗口分屏支持（Split Terminal View）。

## 3. 阻塞与风险
- 暂无阻塞。`.exe` 应用已编译打包完成，可直接分发运行。

## 4. 最近验证
- **2026-09-22**：
  - 执行 `electron-builder`，生成便携版与安装包双格式可执行程序并核验文件完整性。
  - 验证系统终端菜单与 PowerShell 会话拉起逻辑。
  - 执行 `npx tsc --noEmit` 与 `npm run build` 均 0 报错通过。






