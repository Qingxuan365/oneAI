# OneAI 开发路线图与进度看板

## 1. 当前阶段
- **独立网络工具（进行中）**：2026-11-17 01:52 真实 WebView2 验收发现并修复初始 data URL 被拦截的白屏，改用固定应用协议；结果改为可读状态卡片，不再展示 JSON。Release 版实际检测、IPC、11 张卡片、网络失败、IPv6 超时、重复检测、按钮恢复和无横向溢出检查通过，配置脱敏两项 Rust 测试通过。Windows Computer Use 内核初始化故障仍阻塞原生保存／取消／关闭交互，不标记全部完成。详细证据与限制见 [验证记录](D:/GitHub/OneAI/tools/network-check/VALIDATION.md) ，使用见 [工具说明](D:/GitHub/OneAI/tools/network-check/README.md) 。
- **阶段**：Phase 27 - 多账号配置与全链路性能 / 启动体验优化；Phase 26 参照效果图重做顶栏与侧栏（第一至三步已完成）
- **状态**：启动空白框消除与窗口状态记忆（`window-state.ts`）、历史会话对 Codex `archived_sessions` / `.jsonl.zst` 及多账号目录支持、AI CLI 进程退出状态闭环、`QuotaService` 按需 `agy` 子进程调用与多账号配置热监听、Preload 键集合同步校验与生产 CSP 均已完成并通过自动回归与端到端检查；多账号真实浏览器登录流程、桌面实际观感与中文输入法仍待手工验收

## 2. 进度看板

### 已完成
- [x] 2026-11-19 09:34 任务状态分档判定：状态点静默 4 秒回到空闲（`IDLE_AFTER_MS`），未读标记与完成提示音仍等静默 10 秒（`DONE_NOTIFY_AFTER_MS`，期间恢复输出则继续等待）；轮询间隔 2 秒改 1 秒；同步 `docs/features*.md`。
- [x] 2026-11-19 09:22 任务状态简化：启动后默认「空闲」，仅在持续有输出时显示「运行中」，输出静默 10 秒回到空闲；启动 / 重启后 5 秒内的输出不计入运行中（`STARTUP_GRACE_MS`）；删除从未使用的 `waiting`（等待输入）状态及其文案、译文与检查项。
- [x] 2026-11-19 09:15 版本号升到 2.2.2 并生成安装包 `OneAI-Setup-2.2.2.exe`（85319058 字节），随 GitHub Release `v2.2.2` 发布；包含运行中转圈、任务完成提示音、休息提醒称呼与输出静默判断修复。
- [x] 2026-11-19 09:00 任务运行中状态圆点改为转圈；新增「设置 → 提醒 → 任务完成提示音」（默认关闭，可选仅后台任务响、可调音量，Web Audio 合成，任务由运行转空闲时响一声）；休息提醒中文文案恢复「主人，您已经工作 N 小时了…」（英文不带称呼，覆盖 11-14 改为通用文案的决定，应用户明确要求）。验证：`tsc`、`check:i18n`、`check:main`、`check:ui` 通过（`check:ui` 的运行中圆点断言改为转圈）；提示音实际听感待手工确认。
- [x] 2026-11-14 12:30 发布 GitHub Release `v1.0.1`（修复英文界面残留中文），附 `OneAI-Setup-1.0.1.exe`（85177083 字节，SHA-256 `409b4741…429a`）；版本号升到 1.0.1（`package.json` 与 `package-lock.json`）。`v1.0.0` 保留，发布说明里建议升级。
- [x] 2026-11-14 12:20 修复英文界面仍有中文：侧栏问候语把译文缓存在状态里，切换语言后不更新，现在状态只存原文、渲染时再翻译；全角括号与逗号拼接的提示（任务行、折叠栏、用量表账号名）改为按语言翻译；`index.html` 标题改为 `OneAI`；切换语言时主进程立即重新读取额度，避免提示停留在旧语言。
- [x] 2026-11-14 12:08 发布 GitHub Release `v1.0.0`（目标提交 `648b983`），附 `OneAI-Setup-1.0.0.exe`（85176995 字节，SHA-256 `0f3341be…cf0c`），发布说明为英文；README 的安装说明改为指向最新发布。
- [x] 2026-11-14 12:02 面向全球用户：新增英文界面与首次引导。`src/shared/i18n.ts` + `en.ts`（以中文原文为键的英文对照表）、渲染进程 `i18n.ts`（`t()` / `T()`）与主进程 `i18n.ts`；首次启动按系统语言预选并弹出语言选择，再显示欢迎引导（检测到的 CLI、默认文件夹、小提示），`设置 → 外观` 可随时切换且即时生效；新增 `npm run check:i18n`。
- [x] 2026-11-14 12:02 去掉写死的个人信息：全新安装不再预置 `d:\GitHub\OneAI` 下的示例任务，默认文件夹与各 CLI 默认配置目录取本机用户主目录；休息提醒文案改为通用的「您已经工作 N 小时了」；设置 → CLI 的已知清单取自主进程 `known-clis.json`。
- [x] 2026-11-14 12:02 自定义 CLI：`设置 → CLI` 新增页，显示已知 CLI 的检测状态与「重新检测」，可添加 / 编辑 / 删除自定义 CLI（名称 + 启动命令，经 PowerShell 启动）；已知 CLI 清单抽成 `src/main/known-clis.json`；删除时关闭并移除其任务。
- [x] 2026-11-14 12:02 设置 → 时间 新增「显示年月日」开关，可隐藏最大化时顶栏时钟里的年月日与星期。
- [x] 2026-11-14 12:02 README 重写：英文默认、加标语与徽章、Why、亮点、支持的 CLI 与功能对照表、安装与前置条件、隐私说明、参与贡献；详细功能迁入 `docs/features.md` 与 `docs/features.zh-CN.md`。
- [x] 2026-11-14 12:02 项目规则：commit 信息一律使用英文，新增多语言与「不写死本机信息」两条编码红线（`AGENTS.md`）。
- [x] 2026-11-14 12:02 开源许可证确定为 MIT：新增 `LICENSE`（版权人 qingxian），`package.json` 增加 `license` 字段，两份 README 末尾加许可证小节。
- [x] 2026-11-14 11:30 README 中英双语：`README.md` 改为英文（GitHub 默认展示），中文版移至 `README.zh-CN.md`，两份顶部互设语言切换链接，`AGENTS.md` 目录结构登记并要求两份同步更新。
- [x] 2026-11-14 10:03 本周用量面板：顶栏用量按钮 / `Ctrl+Shift+U` 打开弹窗，统计本机 Claude Code、Codex、Antigravity 会话记录（含账号配置目录）中本周各 CLI × 模型的请求数、会话数与输入 / 输出 / 缓存 Tokens，并显示近 26 周每日请求数的 GitHub 风格绿色方块图（`usage-stats.ts`、`UsageModal.tsx`、IPC `usage:stats`）。
- [x] 2026-11-14 10:47 文件预览面板新增代码缩略图（minimap）：右侧 canvas 按缩进与长度绘制每行色块，半透明滑块标出可见范围，点击 / 拖动 / 滚轮可滚动预览，目标行高亮，换主题自动重绘，内容无需滚动时不显示滑块；「设置 → 终端 → 文件预览」可开关（`previewMinimap`，默认开启，随「恢复默认设置」重置）。终端输出区的 minimap 按计划作为第二步，默认关闭，尚未开始。
- [x] 2026-11-14 10:47 新增 Kiro IDE 的 Kiro Dark、Kiro Light 两个主题（色值取自开源还原主题 `BioHazard786/kiro-theme-vscode`），终端配色同步。
- [x] 2026-11-14 10:35 用量面板新增 Pi：读取 `~/.pi/agent/sessions` 会话记录，每条助手回复自带 provider / model / usage，按 CLI → 模型展示（Pi 无多账号，归默认账号）；出错且 usage 全为 0 的回复不计入。
- [x] 2026-11-14 10:26 用量面板按账号统计：层级为 CLI → 账号 → 模型，Claude Code 与 Codex 按设置里的账号配置目录归属（默认目录为「默认账号」，同目录的账号以默认账号为准），只有默认账号的 CLI 不多显示账号一层；方块图悬停提示按「CLI（账号）」列出；Antigravity 无法区分账号，统一归默认账号（`UsageRow.accountId / accountName`、`UsageDay.by`、`UsageStats.accounts`）。
- [x] 2026-11-14 10:26 新增 4 个 IntelliJ IDEA 主题：IntelliJ Light、IDEA Light、IDEA Dark（新版界面）、IDEA 高对比度，色值取自 JetBrains `intellij-community` 的主题与配色文件，终端配色同步。
- [x] 2026-11-14 10:18 用量面板的模型表改为按 CLI 分组：每个 CLI 一个分组标题（请求数与 Tokens 小计），下面是该 CLI 用过的模型；Codex 自动审查子会话排在组末并标「子会话」（`UsageRow.subagent`）。
- [x] 2026-11-14 10:14 修复用量面板漏统计 Codex：Codex 把旧会话压缩成 `.jsonl.zst`（引入 `fzstd` 解压），桌面应用的会话在 `archived_sessions`（此前未扫描），`sessions` 里只剩自动审查（guardian）子会话；现在本机 Codex 显示 gpt-6.1-terra / gpt-6-astra / gpt-6.1-sol，自动审查标为「自动审查 (codex-auto-review)」。弹窗加宽到 `max-w-3xl`、方块放大，模型很多时内容区纵向滚动（已加检查）。
- [x] 2026-11-14 10:03 新增 8 个编辑器配色主题：Darcula、Sublime Material，以及 Sublime Text 内置的 Monokai、Mariana、Breakers、Solarized Dark、Solarized Light、Cobalt；设置页主题分为护眼与编辑器两组，终端配色同步。
- [x] 2026-11-14 10:03 休息提醒（语音与弹框共用）文案改为「主人您已经工作 N 小时了，该休息一下了。」，N 取自设置的提醒时长。
- [x] Phase 26 第三步：任务行第二行显示该任务会话里最近一条用户消息（Claude / Codex / Kimi），没有消息时显示「新会话 · 创建时间」，其他 CLI 保持单行。
- [x] Phase 26 第二步：侧栏按文件夹分组（多个文件夹的终端同时运行，不再因切换而结束），文件夹行带 Git 分支徽标，文件夹「+」弹出 CLI 菜单新建任务，新增「最近任务」区（由 Claude / Codex / Kimi 历史会话按文件夹归类），旧的按工作区存储的数据首次启动时合并迁移并保留。
- [x] Phase 27：多账号配置，支持 Codex、Claude Code、Kimi Code；设置新增「账号」页，新建任务可选账号，任务行与顶栏显示账号名，额度按账号读取。
- [x] Phase 26 第一步：顶栏新增 Tokens / Cost 与整机 CPU / Mem / Net，额度文案改为带标签的 `•` 分隔，侧栏顶部改为 Logo + 标语 + 版本号的品牌头部。
- [x] Phase 25：重排顶栏并修复元素重叠，音乐播放器移入侧栏，统一弹窗外壳与控件样式，设置分页，新增任务重命名、全局快捷键、应用内确认框和空状态快捷启动。
- [x] Phase 24：统一主题和状态表达，提高字号，补齐键盘操作与终端工具入口。
- [x] 完成多 CLI 工作台 UI 效果图设计与确认（含各大模型品牌 Logo、树状多任务分组与顶栏单行横排实时额度）。
- [x] 确立项目级规范文档 [AGENTS.md](D:/GitHub/OneAI/AGENTS.md) 。
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
- [x] Phase 20: 修复终端系统级划选复制与智能粘贴交互（对齐 Windows Terminal 黄金标准）：
  - **划选复制防误杀**：当终端有选中文本时，按下 `Ctrl+C` 拦截终端中断信号（SIGINT `\x03`），并将选中文本写入系统剪贴板并清空划选；无选中文本时放行 `Ctrl+C` 中断信号。
  - **鼠标右键智能分流**：终端有划选时右键为「复制」，无划选时右键为「粘贴」，彻底根除右键覆盖抹杀划选文本的倒置缺陷。
  - **标准终端快捷键补齐**：支持 `Ctrl+Shift+C` 与 `Ctrl+Insert`（复制），支持 `Shift+Insert`（传统终端粘贴）。
  - **主进程原生剪贴板通道**：Electron 主进程新增 `clipboard:write-text` 原生 IPC 接口与 Preload 封装，确保任何焦点状态下复制零丢包。
- [x] Phase 21: 终端高频实用交互功能全量落地（对标 Warp / Cursor 专业交互）：
  - **终端内容关键字搜索（`Ctrl+F`）**：集成官方 `@xterm/addon-search` 模块，打造右上角深色毛玻璃悬浮搜索框，支持实时高亮、双向匹配定位（`Enter` 下一个，`Shift+Enter` 上一个）、大小写匹配与正则表达式切换，`Esc` 退出并恢复终端焦点。
  - **超链接与网址可点击跳转（WebLinks）**：基于 `term.registerLinkProvider` 原生注册超链接提供器，精确识别 `http://` 与 `https://` 网址，点击直接调用系统默认浏览器安全打开（`shell.openExternal`）。
  - **会话一键清屏（`Ctrl+K`）与进程重启**：顶栏新增清屏（Eraser）与会话重启（RotateCcw）操作项；清屏可同步擦除主进程历史缓存；会话重启支持在保留原有工作目录与启动模板的前提下优雅重生 PTY。
  - **终端交互日志一键导出与复制**：顶栏新增导出菜单，自动过滤 ANSI 控制符，可复制或另存最近约 2 MiB 的会话纯文本，避免长时间高输出会话持续占用主进程内存。
- [x] Phase 22: 工作目录存在性校验兜底、OneAI 历史硬编码彻底对齐与 CLI 进程退出生命周期闭环：
  - **工作目录存在性校验与错误反馈**：在 `pty-manager.ts` 中校验工作目录；目录不存在或不是文件夹时拒绝创建 PTY，并在新建任务表单中显示具体错误。
  - **OneAI 名称与默认路径对齐**：将应用呈现名称和默认工作目录统一为 `OneAI` 与 `d:\GitHub\OneAI`。
  - **CLI 进程退出生命周期闭环（`onSessionExit`）**：在前端全局订阅终端退出事件，CLI 进程退出时自动将任务指示灯翻转为 `stopped` 红色徽标，并在终端内打印提示；点击重启时自动恢复为 `running` 绿灯，彻底消灭界面假活缺陷。
  - **顶栏排版窄屏保护**：顶栏面包屑任务标题增加自适应宽度限制与省略截断（`max-w-[140px] truncate`），杜绝长任务名挤压公农历时钟与大模型实时额度。
- [x] 全量 TypeScript 类型检查（`npx tsc --noEmit`）与 Vite 构建打包（`npm run build`）测试通过。

### 待办 / 后续增强
- [ ] 手工验收英文界面与首次引导：全新用户数据目录下启动，确认语言弹窗、欢迎页、空状态和各弹窗的英文排版（长文案是否撑破布局）；主进程文案（额度提示、启动错误）在切换语言后的刷新时机（额度提示最多延迟一个 30 秒轮询周期）。
- [ ] 待确认：英文译文由程序员自行撰写，发布前建议请英文母语者通读一遍。
- [ ] 桌面验收本周用量面板与新主题：弹窗与方块图在各主题下的实际观感与窗口宽度表现（自动检查只核对 DOM、对比度和颜色差异，没有截图查看）；Codex 的模型名在有真实主会话时是否正确（本机只有一个 `codex-auto-review` 子会话，`turn_context.model` 字段位置按该会话验证）；休息提醒语音的实际播报。
- [ ] 待确认：用量面板对 Codex CLI（会话来源 `cli`）的模型识别未实测，本机只有 `vscode` 与 `guardian` 来源的会话；较新 Codex 版本把线程投影到 SQLite（`thread_history_1.sqlite`，164 个线程，部分日期如 11-08 ~ 11-10 的会话文件已不在磁盘上），要补全需引入 SQLite 读取依赖。
- [ ] 待决定：用量面板暂不含 Kimi Code（本机会话目录已空，没有样本；官方文档只说逐条记录在 `agents/main/wire.jsonl`，未说明 token 字段；用户当前没有付费账号，无法生成样本）与 OpenCode（本机未安装，存储方式在 JSON 文件与 `opencode.db` SQLite 之间说法不一，若是 SQLite 需引入读取依赖）；Claude Code 日志无费用字段，面板只显示 Tokens，不换算美元。
- [ ] 在 Windows 桌面端实际运行满 60 分钟，确认中文语音开关、提醒弹框与关闭后重新计时。
- [ ] 手工验收主题三档切换、系统外观联动、终端配色及重启恢复，以及真实 CLI 长模型名称和额度消息下的顶栏体验；自动检查使用组件夹具，未启动真实 PTY。
- [ ] 手工验收 CLI 分组拖拽、键盘排序与重启后的顺序恢复。
- [ ] 在 Windows 桌面端分别用中文输入法验收 Codex、Kimi Code、Claude Code、OpenCode、Grok Build 和普通 Shell 的输入、候选字显示、回车提交及窗口横向稳定性；样式边界已恢复，运行时结果待确认。
- [ ] 手工验收 Phase 25 界面：全局快捷键在各 CLI 运行时的实际表现（`Ctrl+Tab`、`Ctrl+1…9`、`Ctrl+Shift+N/B/H`、`Ctrl+,`）、任务重命名与重启后保留、侧栏音乐播放器的真实播放与进度拖动、各主题下的弹窗观感，以及 1280 默认窗口和最大化时的顶栏收起顺序。
- [ ] 桌面验收文件预览面板：点击 Claude / Codex 输出中的文件路径、拖拽面板宽度后终端字符矩阵重排、工作目录外路径不出现链接；语法高亮已实现，后续可选增强为 Markdown 渲染（待安装新版 `OneAI-Setup-2.1.4.exe` 后实测 `check-ui.mjs` 与各语言文件的配色观感）。
- [ ] 桌面验收侧栏交互：一键新建在各 CLI 下的实际启动、真实 CLI 长时间思考（超过 10 秒无输出）时「待查看」是否误报、鼠标拖拽任务排序的手感、中键关闭、右键「在资源管理器中打开」，以及 `Ctrl+Shift+T` / `Ctrl+Shift+W` 在各 CLI 运行时是否被正确拦截。
- [ ] 后续多窗口分屏支持（Split Terminal View）。
- [ ] 桌面验收 Phase 26 第三步（便携版）：用真实 Claude / Codex / Kimi 并行工作时，第二行是否对应到正确的任务（同文件夹开多个同类任务时的归属）；「新会话 · 时间」与顶栏时钟一致；会话很长时的刷新延迟与 CPU 占用。
- [ ] 桌面验收 Phase 26 第二步（便携版）：用真实使用中的多个文件夹和 CLI 并行工作的手感；文件夹与任务的拖拽排序手感；折叠窄条里文件夹按钮的可用性；「最近任务」点击会话恢复真实 Claude / Codex / Kimi 会话（端到端检查有意没有触发，会启动真实 CLI）；旧版数据较多时迁移后的侧栏是否过长。
- [ ] 待决定：窗口标题栏与顶栏融合（隐藏原生标题栏 + `titleBarOverlay`，窗口按钮在右侧；需随主题更新按钮颜色，并让顶栏横跨侧栏，涉及 `App.tsx` 整体布局）。
- [ ] 桌面验收多账号（便携版）：设置 → 账号里点「登录」走完 Codex / Claude Code / Kimi Code 的真实登录流程（登录会打开浏览器，端到端检查有意没有触发）；两个账号同时登录并各开任务并行运行，确认互不影响；Kimi 账号登录后的额度接口读数；顶栏额度随切换任务变化的实际手感。
- [ ] Antigravity（`agy`）多账号：暂不支持。其 Google 登录保存在 Windows 凭据管理器、每个 Windows 用户只有一份；实测把 HOME / USERPROFILE 指向空目录后 `agy -p /usage` 的额度读数与默认账号完全一致，二进制里的 `AGY_ACCOUNT` 只用于沙箱命令选第三方账号。官方文档提供的另一条路是 `GEMINI_API_KEY`（需 `modelProvider: gemini`）或 `AGY_ADC_AUTH`，属于按量计费而非 Google 账号订阅，如需接入须先确认并实测。
- [ ] 桌面验收 Phase 26 第一步（安装版）：顶栏 Tokens / Cost / CPU / Mem / Net 的实际观感与跳动、各窗口宽度下的收起顺序、品牌头部在各主题下的观感、窗口最小化后网速恢复是否正常、关闭应用后无残留 PowerShell 子进程。
- [ ] 桌面验收 Pi 会话：滚轮滚动全屏视窗、拖拽选中复制、启动速度（自带 OpenConsole 首次启动可能较慢）与中文输入法；以及设置页关闭 / 开启音乐播放器后侧栏即时变化。
- [ ] 手工验收会话全关后重建、跨会话快捷键、关闭确认、目录错误提示、日志复制保存与应用重启恢复流程。

## 3. 阻塞与风险
- 任务行第二行的任务与会话对应是启发式的（从历史恢复的任务按会话 id 精确对应，其余按创建时间归属）：同文件夹并发多个同类任务，或在 OneAI 之外手动开同文件夹的会话，可能对错；重启一个已停止的任务后它开的新会话也可能被归给同文件夹里更晚创建的任务。要做到精确需要在 CLI 的会话里带上任务标识（例如 Claude 的 statusLine 脚本读取环境变量），涉及修改外部配置，需先授权。
- 侧栏改版后，旧的按工作区存储的数据只迁移一次、之后不再更新；回退到旧版本会看到升级前的状态。「最近任务」只覆盖 Claude Code、Codex、Kimi Code 三个有可读历史会话的 CLI；Git 徽标只显示分支名，不显示改动状态；折叠文件夹里的任务不在侧栏渲染，但仍参与 Ctrl+Tab / Ctrl+数字。
- 默认 1280 宽窗口、舒适缩放且侧栏展开时，顶栏只保留模型与 5h / 7d；Tokens / Cost、CPU / Mem / Net、额度重置时间与时钟依次收起（悬停额度可见）。侧栏展开的 1920 最大化窗口显示用量与全部系统资源，但不显示时钟（时钟优先级最低，侧栏折叠或更宽屏幕才显示）；若更想保留时钟，调整 `index.css` 的 `topbar` 断点即可。
- 多账号：Claude Code 非默认账号拿不到额度（statusLine 快照由所有会话共用，无法区分账号）；Kimi Code 账号额度读取该账号目录下的 `credentials/kimi-code.json` 并请求 Kimi 官方额度接口；账号附加环境变量以明文存放在 localStorage，不要填密钥。
- Tokens / Cost 是「最近活跃会话」的累计值：Claude Code 共用同一个 statusLine 快照，多个会话并行时显示最后写入的那个，Tokens 不含子代理的独立记录；Codex 无 Cost。网速依赖系统 Windows PowerShell，连续读取失败两次后显示「--」并在冷却 60 秒后自动重试。
- 本轮交互修复已通过生产构建；桌面端实际点击与多终端并发行为尚未手工验收。
- 会话日志缓冲保留最近约 2 MiB 输出；更早内容不会出现在复制和导出的日志中。

## 4. 最近验证

- **2026-11-19 09:34**：任务状态分档阈值改动：`npx tsc --noEmit`、`npm run check:main`（6/6）、`npm run check:i18n`（0 缺失）通过，`npm run build:win` 生成 `release/OneAI-Setup-2.2.2.exe`（85324274 字节）。未验证：真实 CLI 长时间思考时状态点来回跳动与提示音是否误报（需桌面实测）。
- **2026-11-18 20:54**：版本 `2.2.1` 打包核对：`npx tsc --noEmit` 通过、`npm run check:main` 6/6 通过，`npm run build:win` 生成 `release/OneAI-Setup-2.2.1.exe`（85,322,423 字节）；启动白块、引导重复弹出与看门狗日志尚待实机确认。
- **2026-11-18 20:09**：版本 `2.2.0` GitHub Release 发布核对：提交 `164ad5c` 已推送至 `origin/main`；GitHub Release `v2.2.0`（Latest，远端标签 `v2.2.0` 指向 `164ad5c`）线上附件 `OneAI-Setup-2.2.0.exe` 85320418 字节、SHA-256 `03895ba0…21cb` 与本地一致，`gh release view v2.2.0` 确认 `asset: OneAI-Setup-2.2.0.exe` 存在。未验证：重新安装运行 `OneAI-Setup-2.2.0.exe` 后在真实桌面窗口里的实际交互观感。
- **2026-11-18 19:57**：全系统 16 项审查优化、逐行复查修复与版本 `2.2.0` 打包验证后，`npx tsc --noEmit`（含 `noUnusedLocals: true` 与 `preload/index.ts` `satisfies Required<ElectronTerminalAPI>` 签名强校验）通过；`npm run check:i18n` 通过（547 条使用、562 条译文，0 缺失、0 占位符不一致、0 动态中文表达式、0 未使用）；`npm run check:main` 6 大组单元测试全部通过（`PtyOutputBatcher` 单调 `seq` / `discard` 与代理对保护、`PtyManager` 快照 / 秒退退出码 / 重启最新账号注入 / 引号命令 `&` 包装 / `#` 注释换行隔离 / `pi` 与 `pwsh` 与 `wsl` 分支、`parseTomlStrings` 注释与节隔离、`music-library` `realpath` 防符号链接越界与远程歌单 SSRF 拦截及 1 MB 流式截断、`task-summary` 恢复历史 Codex 归档与 Kimi 旧会话匹配、`file-preview` 白名单 + LRU Map + 兼容 `Read(...)` / Markdown / Next.js 路由的终端路径提取）；`npm run check:ui` **394 项**全部通过（新增全部 24 个主题 WCAG 对比度与面板色校验、`Modal` 忽略 `tabIndex=-1` 的 `Tab` / `Shift+Tab` 焦点陷阱、`NewTaskModal` 预选账号、预览面板双击重置与窄窗口终端最小宽度保护、`TerminalViewport` 快照 `seq` 去重、秒退退出横幅补打与二次恢复退出横幅保留）；`vite.config.ts` 构建期 `preload` 键同步与 `index.html` 24 主题白名单同步校验通过；`npm run build:win` 通过，`release/OneAI-Setup-2.2.0.exe` 85320418 字节、SHA-256 `03895ba0…21cb`（北京时间 2026-11-18 19:57:00）。未验证：重新安装运行 `OneAI-Setup-2.2.0.exe` 后在真实桌面窗口里的实际交互观感。
- **2026-11-18 15:30**：版本 `2.1.6` 构建与 GitHub Release 发布核对：`npx tsc --noEmit`、`npm run check:i18n`（542 条 0 缺失）、`npm run check:ui`（377 项全部通过）与 `npm run build:win` 全部通过；提交 `9a4dc18` 已推送至 `origin/main`，GitHub Release `v2.1.6`（Latest，远端标签 `v2.1.6` 指向 `9a4dc18`）线上附件 `OneAI-Setup-2.1.6.exe` 大小 `85312334` 字节、SHA-256 `33549651…0dfa` 与本地完全一致。未验证：重新安装运行 `OneAI-Setup-2.1.6.exe` 后的真实桌面交互观感。
- **2026-11-18 13:17**：启动空白框修复与全项深度优化后 `npx tsc --noEmit` 通过；`npm run check:i18n` 532 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 373 项全部通过（新增 3 项覆盖历史会话多账号标签展示、`accountId:id` 打开态标记与恢复时透传 `accountId`）；专项 Electron 单元与生产产物端到端脚本 7 大组全部通过（`preload` 49 个接口键三处完全一致；`window-state.ts` 主副屏保留、副屏拔除回退、顶栏越界纠正与最小尺寸裁剪；`session-history.ts` 对 Codex `archived_sessions` / `.jsonl.zst` 流式首块解压、guardian 子会话过滤、Claude / Codex / Kimi 多账号目录扫描、重复默认目录去重与安全删除；`pty-manager.ts` AI CLI 退出自动结束会话并回传退出码 `7`、系统终端 `powershell.exe` 保持 `-NoExit` 存活；`quota-service.ts` 非 `agy` 活动任务时 `0` 次 `agy` 子进程调用、切至 `agy` 按需拉取、多账号 `config.toml` 热监听 1 秒内更新模型及 `stopPolling` 释放全部 watcher；真实 `dist-electron/main/index.js` + `dist/index.html` 二阶段冷热启动验证 `show: false` 至首帧 DOM 就绪后显示、生产 CSP 0 违规、懒加载弹窗正常挂载、`1360×840` 尺寸与浅色 `#ffffff` 底色落盘及二次启动恢复）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.5.exe` 85308770 字节（北京时间 2026-11-18 13:16:55）。未验证：重新安装运行 `OneAI-Setup-2.1.5.exe` 后在双显示器拔插场景与真实 Claude / Codex `/exit` 交互下的桌面观感。
- **2026-11-18 11:19**：性能优化回归缺陷修复后 `npx tsc --noEmit` 通过；`npm run check:i18n` 532 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 370 项全部通过；专项 Electron 端到端回归脚本 18 项断言全部通过（`oneai-music://` 协议 `206 Partial Content` / `416` 分段响应头、本地音频有限时长与 `0:03` 显示、进度条拖动跳转、Web Audio `AnalyserNode` 频谱非零与流取消后 Windows 文件句柄立即释放；懒加载弹窗首屏前不挂载、打开关闭后再开保留设置选项卡与历史会话搜索词；`SystemStatsText` / `InlineQuotaText` / `TerminalViewport` 切换语言同步即时重绘；侧边栏微移双击重置 `320px` 及调宽至 `410px` 后折叠严格恢复 `48px`；停止前末条任务摘要立即捕获且收敛后不再重扫；用量落盘缓存 `v2` 动态跟随配置文件默认模型变更）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.5.exe` 85305348 字节（北京时间 2026-11-18 11:18:48）。未验证：重新安装运行 `OneAI-Setup-2.1.5.exe` 后在真实桌面环境播放本地大体积无损音频的听感与拖拽手感。
- **2026-11-18 10:35**：全链路性能优化后 `npx tsc --noEmit` 通过；`npm run check:i18n` 532 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 370 项全部通过；基准与等价性脚本 6 组全部通过（CLI 检测由 5172 次同步 `statSync` / 180.3 ms 降至异步 6.4 ms 且结果一致；用量统计首次冷扫降至 3443 ms、重启命中落盘缓存降至 30 ms 且行与方块数据一致；历史会话命中文件签名缓存由 30.4 ms 降至 4.24 ms；776 KB / 19045 行 TS 语法高亮直接遍历 `_emitter` 树 137.1 ms、解析阶段 0 临时 DOM 节点；5 文件夹 Codex 摘要合并扫描 2.2 ms、异步 Git 分支 0.9 ms；状态持久化对 `running/idle` 瞬态变化 0 次写盘、5 次连续编辑防抖合并为 1 次）；`vite build` 首屏主包由 999849 字节降至 768191 字节（`-23.2%`）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.5.exe` 85305637 字节（北京时间 2026-11-18 10:35）。未验证：重新安装运行 `OneAI-Setup-2.1.5.exe` 后播放大体积本地 FLAC 经 `oneai-music://` 流式协议的实际听感与频谱观感。
- **2026-11-17 20:23**：GitHub Release `v2.1.5` 安装包替换为含 issue #4 修复的 `release/OneAI-Setup-2.1.5.exe`（`gh release upload --clobber`）：线上附件 86082230 字节，SHA-256 `8c9a0cec…88c1` 与本地一致，Release 仍为 Latest；标签 `v2.1.5` 未移动，仍指向修复前的 `9954b66`。
- **2026-11-17 20:16**：issue #4 输入去重修复后 `npx tsc --noEmit` 通过；去重逻辑独立脚本 8 个场景全部通过（右键粘贴双路径含 / 不含括号粘贴、语音上屏双事件只发送一次；间隔超过 300 ms 的重复粘贴、方向键连按、单字连打、回车连按、不同文本均不受影响）；在已安装的 OneAI v2.1.5 中用 Computer Use 于 PowerShell 任务实测：右键粘贴与 Ctrl+V 各只上屏一次，相隔约 1 秒的两次右键粘贴各出现一次，键盘输入正常；用户实测快捷键语音输入不再重复。
- **2026-11-16 20:23**：本周用量弹窗 CLI 大类添加折叠按钮后，`npx tsc --noEmit` 通过；`npm run check:i18n` 532 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 370 项全部通过（新增 5 项验证 CLI 大类默认展开并带折叠按钮、点击折叠按钮或大类行可收起 / 展开其下的账号与模型列表、收起时保留小计及其他大类状态）；Electron 离屏截图实测展开与折叠状态视觉对齐；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 86082035 字节（2026-11-16 20:22:50）。未验证：重新安装运行 `OneAI-Setup-2.1.4.exe` 后在真实桌面窗口里的实际交互观感。
- **2026-11-16 20:12**：折叠侧栏文件夹与 CLI 任务按钮改为等距垂直间距后，`npx tsc --noEmit` 通过；`npm run check:i18n` 530 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 365 项全部通过（新增断言验证折叠侧栏相邻文件夹与任务按钮的垂直间距均一致且不小于 3px）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 86081459 字节（2026-11-16 20:12:03）。未验证：重新安装运行 `OneAI-Setup-2.1.4.exe` 后在真实桌面应用折叠侧栏的视觉观感。
- **2026-11-16 20:06**：本周用量弹窗每日使用频次方块图改为占满整行后，`npx tsc --noEmit` 通过；`npm run check:i18n` 530 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 364 项全部通过（新增断言验证中英文下方块图占满整行且无横向溢出、方块为正方形且大于原 14px 尺寸、周几标签与对应行中心垂直对齐）；并在 Electron 离屏截图实测中文与英文布局观感；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 86081373 字节（2026-11-16 20:05:52）。未验证：重新安装运行 `OneAI-Setup-2.1.4.exe` 后在真实桌面窗口里的观感。
- **2026-11-16 19:49**：折叠侧栏 CLI 任务按钮改为与文件夹图标模块一致的正方形（`h-9 w-9`）后，`npx tsc --noEmit` 通过；`npm run check:i18n` 530 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 361 项全部通过（新增断言验证折叠侧栏任务按钮宽高相等、与 `[data-folder-strip]` 尺寸一致且内容不横向溢出）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 86081214 字节（2026-11-16 19:49:36）。未验证：重新安装运行 `OneAI-Setup-2.1.4.exe` 后在真实界面中的视觉观感及两位数任务序号在折叠窄条中的实际排版。
- **2026-11-16 19:37**：左侧菜单区 UI 与交互全面优化后，`npx tsc --noEmit` 通过；`npm run check:i18n` 530 条文案 0 缺失、0 占位符不一致；`npm run check:ui` 360 项全部通过（新增 16 项覆盖双行原位重命名行高、非激活任务关闭按钮空间释放、菜单方向键导航与再次点击切换关闭、全部折叠/展开、清理已停止任务、最近任务收起/展开与加入工作区、侧栏调宽与双击重置、折叠窄条状态点/图标/右键/中键/展开入口及音乐播放器音量持久化与滑块释放失焦）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 86081275 字节（2026-11-16 19:37:18）。未验证：重新安装运行 `OneAI-Setup-2.1.4.exe` 后在真实桌面应用内拖拽调宽、跨文件夹拖拽光标与点击不同任务后立即按 `F2` 的手感。
- **2026-11-16 19:04**：修复文件预览超过 10 万字符即跳过语法高亮的问题（`check-ui.mjs` 为 108.9 KB / 107,411 字符）后，`npx tsc --noEmit` 通过；`npm run check:i18n` 519 条无缺失；`npm run check:ui` 344 项全部通过（覆盖 >100 KB 多行 CRLF 代码高亮、>50 KB 压缩单行跳过高亮、>1 MB 跳过高亮、主题切换同步换色）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 86079254 字节。未验证：重新安装运行 `OneAI-Setup-2.1.4.exe` 后于真实界面打开 `check-ui.mjs` 及 CSS / Markdown / Dockerfile 等文件的视觉观感。
- **2026-11-16 06:52**：「回到顶部」按钮加悬停效果后 `tsc --noEmit` 通过；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 85184349 字节，构建产物 CSS 含 hover 样式。未验证：真实界面里悬停的观感。
- **2026-11-16 06:48**：Claude Code 全屏模式（备用屏）回到顶部后 `tsc --noEmit` 通过；`npm run check:i18n` 0 缺失；`npm run check:ui` 336 项全部通过（新增 4 项：非 Claude 的备用屏不显示、Claude 普通屏不显示、Claude 备用屏显示、点击后向 CLI 发送 Ctrl+Home）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 85185022 字节。未验证：真实 Claude Code 全屏模式下 Ctrl+Home（`ESC[1;5H`）是否被识别并跳到对话开头、按钮在真实界面中的位置观感。
- **2026-11-16 06:34**：版本 2.1.4 构建与发布核对：`npm run build:win` 通过，`release/OneAI-Setup-2.1.4.exe` 85184672 字节，SHA-256 `7eaf654b…d6ee`；GitHub Release `v2.1.4` 线上附件大小 85184672 字节、digest 与本地一致，状态为 Latest；远端标签 `v2.1.4` 指向 `bb73b4d`。安装包未安装运行。
- **2026-11-16 06:31**：缺口修复与 4 个新护眼主题后 `tsc --noEmit` 通过；`npm run check:i18n` 0 缺失；`npm run check:ui` 332 项全部通过（新增：单击打开链接开关、4 个新主题的对比度与侧栏 / 顶栏面板色、主题名中英文）；独立脚本验证主进程：拖入图片预览规则 5 项通过（拖入前拒绝、拖入后放行、未拖入的图片和非图片仍拒绝）、会话缓冲裁剪 3 项通过（超过 2 MiB 后从行首开始、保留最新输出）；新主题色板另用脚本按检查门槛算过对比度（UI 色与终端 16 色）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.3.exe` 85184162 字节。未验证：新主题在真实界面里的观感、单击打开链接的误触情况、侧栏 30 个以上任务时 content-visibility 的实际滚动表现、拖入含空格路径的图片后点击预览（带引号路径识别只做了代码实现，无自动检查）。
- **2026-11-16 06:07**：粘贴提示后 `tsc --noEmit` 通过；`npm run check:i18n` 0 缺失；`npm run check:ui` 322 项全部通过（新增 3 项：粘贴后提示「已粘贴」、截图提示「已粘贴图片路径」、剪贴板为空提示）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.3.exe` 85182788 字节。检查中发现：主进程读取成功但无内容时若继续回退浏览器剪贴板接口，权限等待会让提示永远不出现，已改为直接提示「剪贴板为空」。未验证：真实剪贴板下各提示的观感、剪贴板读取被拒时的「粘贴失败」。
- **2026-11-16 06:02**：平滑滚动、回到顶部与粘贴截图预览后 `tsc --noEmit` 通过；`npm run check:i18n` 0 缺失；`npm run check:ui` 319 项全部通过（新增：平滑滚动开关默认关且可开、内容超一屏显示回到顶部、点击后回到顶部并出现回到底部）；主进程预览路径规则用独立脚本 6 项通过（粘贴目录里的图片可预览，其中的非图片、其他目录外文件被拒绝，工作目录内文件正常）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.3.exe` 85183304 字节。未验证：平滑滚动在真实滚轮下的手感（`scrollToBottom` 是否也走缓动未确认）、真实粘贴截图后点击路径的预览。
- **2026-11-16 05:57**：终端区第二轮交互修复后 `tsc --noEmit` 通过；`npm run check:i18n` 0 缺失；`npm run check:ui` 315 项全部通过（新增 7 项：上翻显示「回到底部」、期间有新输出时变为新输出提示、点击回到底部并隐藏、按住 / 松开 Ctrl 的容器标记、无终端实例时仍重启进程）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.3.exe` 85182721 字节。未验证：复制提示与手型光标的实际观感（复制提示无自动检查）、真实 CLI 输出下「回到底部」的新输出判断。

## 5. 最近完成

- **2026-11-18 20:55** 为偶现整窗「未响应」加入诊断日志（`src/main/diagnostics.ts`）：记录主进程事件循环阻塞 ≥ 500 ms（附最近 20 次 IPC）、同步耗时 ≥ 100 ms 的 IPC、渲染进程无响应 / 恢复 / 崩溃，写入 `userData/logs/oneai-diag.log`（1 MB 轮转）；20:51 追加 worker 线程看门狗（主线程心跳停 3 秒即记录，彻底卡死也能留痕）与启动期后台任务（额度轮询、系统资源采样、截图清理）同步耗时记录，看门狗代码已用 node 单独验证能记录卡住与恢复；卡死根因待日志确认。
- **2026-11-18 20:42** 修复偶现重新弹出首次引导（语言、主题像被重置）：主进程加单实例锁，再次启动改为聚焦已有窗口，避免第二个实例拿不到 localStorage 数据库锁而读到空设置；退出前调用 `flushStorageData()` 主动刷盘（`src/main/index.ts`）；`tsc` 与 `check:main`（6/6）通过，已重新打包，待实机确认。
- **2026-11-18 20:39** 修复启动时左上角闪现白色矩形：上次关闭时为最大化的窗口改为直接按所在屏幕工作区尺寸创建，首帧即按最大化尺寸渲染，首次取消最大化时恢复保存的还原尺寸（`src/main/index.ts`）；`tsc --noEmit` 与 `npm run check:main`（6/6）通过，已重新打包 `release/OneAI-Setup-2.2.0.exe`，启动画面待实机确认。
- **2026-11-18 19:57** 完成全系统 16 项审查优化并升级至 `v2.2.0`（`package.json`、`package-lock.json`）：① 终端生命周期与进程清理（`pty-manager.ts`、`main/index.ts`、`App.tsx`、`TerminalViewport.tsx`）：新增 `terminal:get-snapshot` 返回带单调递增 `seq` 与存活 / 退出码的原子快照，消除挂载回放与实时输出竞态及秒退进程假运行状态，保留二次恢复退出提示并在重启 / 清屏时丢弃旧进程未发缓冲（`discard`）；Windows 下通过 `taskkill /T /F` 兜底终止整棵 PTY 子进程树并补齐 `before-quit` 清理；重启会话校验被删账号并注入最新账号配置，杜绝空配置回落默认 Shell；统一 Windows CLI 命令经 PowerShell 启动（兼容 `.cmd` / `.ps1` 垫片、引号路径 `&` 调用、`#` 注释换行隔离、`pwsh` 与 `wsl`）；② 安全与边界加固（`music-library.ts`、`file-preview.ts`、`main/index.ts`、`shared/paths.ts`）：本地音乐目录与曲目统一经 `realpath` 与大小写无关目录比对防符号链接越界，远程歌单增加 1 MB 流式体积上限并拦截指向本机回环 / 链路本地地址的 SSRF 重定向与条目；剪贴板粘贴保留纯空白文本、对复制的图片文件自动登记预览白名单并安全转义特殊字符路径；终端路径链接新增支持 `:line:col`、`(line,col)`、`Dockerfile` / `Makefile`、Next.js 路由段及 `Read(...)` / Markdown 括号包裹路径并排除 URL 干扰；③ 多语言、TOML 解析与数据一致性（`quota-service.ts`、`task-summary.ts`、`en.ts`、`check-i18n.mjs`）：拆分动态三元 `t()` 并补齐 `terminal` 额度语言联动，`check-i18n.mjs` 新增动态中文表达式与未使用译文拦截；重写注释与 `[section]` 感知的 `parseTomlStrings`；修复从历史恢复的 Codex（含 `archived_sessions` 与 `.jsonl.zst`）及 Kimi 任务因旧 `mtime` 丢失第二行摘要的问题；`Ctrl+Shift+T` / `Ctrl+Shift+N` 继承当前任务账号且重启重置空闲计时；④ 交互、性能、共享层与测试文档同步（`Modal.tsx`、`FilePreviewPanel.tsx`、`MusicPlayer.tsx`、`HistoryModal.tsx`、`system-stats.ts`、`session-history.ts`、`usage-stats.ts`、`shared/types.ts`、`vite.config.ts`、`tsconfig.json`、`check-main.mjs`、`check-ui.mjs`）：`Modal` 增加顶层弹窗与 `tabIndex >= 0` 感知的 `Tab` / `Shift+Tab` 焦点陷阱，预览面板宽度持久化、支持双击重置并在窄窗口保护终端宽度，播放器首帧让路、缓存已展开歌单且更新列表不中断在播曲目，网速采样增加 60 秒故障自愈冷却，各缓存统一加 LRU 上限，抽离跨进程共享类型与 `THEME_IDS` 并在构建期校验 `index.html` 白名单，开启 `noUnusedLocals: true` 清理死代码，新增 `npm run check:main` 并同步中英文文档。
- **2026-11-18 16:19** 补充贡献者 Gemini（Google）：提交规范新增由 Gemini（含 Antigravity / Gemini CLI）参与完成的提交末尾加 `Co-Authored-By: Gemini <200291788+gemini-code-assist@users.noreply.github.com>`（关联 Google 官方 GitHub 账号 `@gemini-code-assist`，显示名 `Gemini`），两份 README 贡献者小节同步列入 Gemini（Google），本次提交即按此署名并推送至 `origin/main`；仅文档改动，未执行构建。入口：[AGENTS.md](D:/GitHub/OneAI/AGENTS.md)、[README.md](D:/GitHub/OneAI/README.md)、[README.zh-CN.md](D:/GitHub/OneAI/README.zh-CN.md)。
- **2026-11-18 15:30** 发布 `v2.1.6`：版本号升至 `2.1.6`（`package.json`、`package-lock.json`），提交 `9a4dc18` 已推送到 `origin/main`，GitHub Release `v2.1.6`（目标 `9a4dc18`，Latest）已上传并校验 `OneAI-Setup-2.1.6.exe`（85312334 字节，SHA-256 `33549651…0dfa`）。包含启动体验与全链路性能优化、Antigravity 用量模型名抗污染修复（`usage-stats.ts` 缓存升至 `version: 3`）及「本周用量」弹窗 UI 全面升级（4 张概览指标卡、CLI Tokens 占比条、全列小计吸顶表、一键全部收起 / 展开与 26 周方块图实时联动明细）。
- **2026-11-18 13:17** 完成启动体验与 5 项全栈优化（保持已有正常功能不变）：① 消除启动空白框并持久化窗口状态（新增 `src/main/window-state.ts`、更新 `src/main/index.ts` 与 `App.tsx`）：`BrowserWindow` 启用 `show: false` 等待 `ready-to-show` 后再显示（带 3 秒超时兜底），持久化窗口尺寸、坐标（含多屏越界与顶栏防遮挡保护）、最大化状态及上次主题底色 / 顶栏覆盖层色值，并将常驻 PowerShell 系统资源采样、配额轮询与过期粘贴截图清理延后至窗口首帧显示后 800 ms 错峰启动；② 补齐历史会话与侧栏「最近任务」（`session-history.ts`、`HistoryModal.tsx`、`Sidebar.tsx`、`App.tsx`）：新增扫描 Codex `archived_sessions` 与 `.jsonl.zst` 流式首块解压，纳入多账号独立配置目录（同默认目录自动去重），展示所属账号并在点击恢复时自动绑定原 `accountId`；③ 修复 AI CLI 退出生命周期与自定义 CLI 参数启动（`pty-manager.ts`、`App.tsx`）：AI CLI 任务退出后同步结束外层包装进程并透传真实 `$LASTEXITCODE` 使侧栏准确翻转为 `stopped`，系统终端 `powershell.exe` 及未安装 CLI 兜底交互终端继续保留 `-NoExit`，同时补齐新建自定义 CLI 任务时的 `shell` 标记；④ 收敛 `QuotaService` 后台开销（`quota-service.ts`）：`agy -p /usage` 子进程改为仅在活动任务为 `agy` 或手动刷新时按 TTL 调用，新增多账号目录配置文件热监听并在停止轮询时释放全部 `FSWatcher`；⑤ 工程防漂移与安全加固（`vite.config.ts`、`preload/index.*`、`docs/features*.md`）：构建阶段自动校验 `preload/index.cjs` 与 `index.ts` 接口键一致，生产构建 `dist/index.html` 自动计算内联主题脚本 SHA-256 摘要并注入 CSP，同步修正中英文功能文档。
- **2026-11-18 11:19** 修复性能优化引入的 5 项回归与边界偏差：① `music-library.ts` 改为基于 `fs.createReadStream` 的标准 `200` / `206 Partial Content` / `416` 流式分段响应（返回 `Content-Length`、`Accept-Ranges`、`Content-Range` 与音频 MIME，流取消或中止时立即销毁句柄），恢复本地音频总时长展示与进度条拖动跳转；② `App.tsx` 为懒加载弹窗记录首次打开状态，首次打开前不加载分包、打开过一次后保持挂载交由 `isOpen` 控制显隐，保留「设置 -> 账号」登录返回后的选项卡位置与历史会话搜索筛选词；③ 将 `language` 透传至 `InlineQuotaText`、`SystemStatsText`、`TerminalViewport`、`FilePreviewPanel`，保证切换语言在全部 `React.memo` 子组件同步即时生效；④ `Sidebar.tsx` 与 `FilePreviewPanel.tsx` 在拖拽结束及折叠切换时同步还原内联 `style.width`，消除折叠态宽度残留风险；⑤ 任务转为停止态后补读最后一次消息摘要再收敛，终端未命中路径仅在当轮输出短时缓存并在异步拖放登记完成后重清缓存，`usage-stats.ts` 落盘缓存升级为 `version: 2` 保留空模型串以动态跟随默认模型配置变更。

- **2026-11-18 10:35** 全链路性能优化（保持已有功能不变）：① 终端热路径（`TerminalViewport.tsx`、`file-preview.ts`、`pty-manager.ts`）：复用 `getNullCell()` 消除每帧上万次 `CellData` 分配，IME 定位仅在可见聚焦时按帧合并并缓存屏幕宽高，链接识别共享逻辑行并增加路径解析缓存，主进程预览改为异步且批量共用一次 `realpath`，后台隐藏会话 PTY 合并窗口放宽至 120 ms，修正多帧同步输出 `lastIndexOf` 判断；② 状态与重渲染隔离（`App.tsx`、`workspaceState.ts`、`workspace-store.ts`、`Sidebar.tsx`、`Topbar.tsx`、`SystemStatsText.tsx`、`MusicPlayer.tsx`）：忽略瞬态状态写盘并加 250 ms 防抖与主进程异步原子落盘，侧栏与预览面板拖拽调宽过程直接更新 DOM 宽度，核心组件包裹 `React.memo` 并稳定回调，顶栏时钟独立组件化并缓存农历格式化器，隐藏播放器暂停 60 fps 频谱动画；③ 启动与后台 I/O（`cli-detect.ts`、`music-library.ts`、`usage-stats.ts`、`task-summary.ts`、`quota-service.ts`、`session-history.ts`、`git-branch.ts`、`AccountsSettings.tsx`）：CLI 检测改为异步 `PATH` 目录集合匹配，本地音乐新增 `oneai-music://` 流式协议，用量统计 `readLines` 游标化、优先读紧凑 `transcript.jsonl`、6 并发池并将缓存落盘至 `userData`，任务摘要按 `(cliId, home)` 去重扫描且跳过已有摘要的已停止任务，窗口最小化暂停配额/历史轮询并移除对用户主目录的 `fs.watch`，历史会话增加文件签名缓存，Git 分支异步化，账号登录检测加 60 秒缓存与 2 并发上限；④ 首屏分包与包体瘦身（`App.tsx`、`previewHighlight.ts`、`FilePreviewPanel.tsx`、`PreviewMinimap.tsx`、`electron-builder.json`）：弹窗与代码预览改为 `React.lazy` 按需加载，语法高亮直接遍历 `_emitter` 树并对 >400 行文件启用 `content-visibility: auto`，Minimap 按像素步长采样，安装包排除未引用的 `app-icon.jpg`。
- **2026-11-17 20:16** 修复 issue #4：微信输入法下右键粘贴、快捷键语音上屏文字重复两遍（`TerminalViewport.tsx`）。同一段文本会经两条路径（`compositionend` 与 `insertText`、`term.paste` 与原生 paste 事件）各进入 xterm 一次，`onData` 改为 300 ms 内完全相同的多字符文本只发送一次；单字符与方向键等转义序列不参与去重，括号粘贴除外。
- **2026-11-17 02:46** 修复输入法组合文字显示在 CLI 输入框后面（`TerminalViewport.tsx`）：未单独适配的 CLI 统一使用 `findDrawnCursorAnchor`，真实光标隐藏时定位到 CLI 绘制的反色光标；实测 Claude Code / Kimi / Pi 隐藏光标并绘制反色光标，Codex / Antigravity 使用真实光标保持默认。
- **2026-11-16 20:23** 本周用量弹窗每个 CLI 大类前添加折叠按钮（`UsageModal.tsx`）：在品牌图标与 CLI 名称前加入带旋转动画的 `ChevronRight` 折叠按钮（点击按钮或大类行均可切换，保持 `aria-expanded` 与整行小计显示），收起时同步隐藏该 CLI 下的账号分段与模型列表；同步 `en.ts`、`docs/features*.md` 与 `check-ui.mjs`。
- **2026-11-16 20:12** 统一折叠侧栏文件夹与 CLI 任务按钮的垂直间距（`Sidebar.tsx`）：列表容器由 `gap-0.5` 改为 `gap-1`（与折叠底部操作栏保持一致），移除文件夹按钮的 `[&:not(:first-child)]:mt-2`，消除文件夹与任务按钮之间间距参差不齐的问题；`check-ui.mjs` 新增相邻按钮等距断言。
- **2026-11-16 20:06** 本周用量弹窗「每日使用频次」方块图改为占满整行（`UsageModal.tsx`）：改用 `grid-rows-subgrid` + `auto repeat(N, minmax(0, 1fr))` 铺满容器宽度，方块通过 `aspect-square w-full` 自适应为等宽等高正方形，周几标签与各行居中对齐、末列月份右对齐防止横向溢出，外层增加 `p-px` 避免今日边框被裁剪；`check-ui.mjs` 补充中英文全宽占满与对齐断言。
- **2026-11-16 19:49** 折叠侧栏任务按钮改为与文件夹图标模块一致的 `h-9 w-9` 正方形（`Sidebar.tsx`），并在两位数序号时收窄图标与数字间距（`gap-0.5`）避免拥挤；`check-ui.mjs` 补充宽高一致与不溢出断言。
- **2026-11-16 19:37** 左侧菜单区与播放器交互全面优化：① 侧栏支持右边缘拖拽调宽（240--480px，持久化，双击恢复默认）与「当前任务」一键全部折叠/展开；② 任务行非激活且未悬停/聚焦时释放关闭按钮 28px 空间，双行任务原位重命名保持行高不跳动；③ 菜单改为实测尺寸精准防溢出、支持方向键/`Home`/`End`/`Esc` 导航与再次点击「+」切换关闭，多账号 CLI 自动分组分隔；④ 文件夹右键新增「清理已停止任务」，折叠文件夹显示运行/失败小圆点，空状态内联「添加文件夹」按钮；⑤ 「最近任务」支持整体折叠、修复 4px 竖线错位并支持文件夹右键（加入工作区/打开/复制路径），分节标题吸顶；⑥ 折叠窄条保留待查看任务状态点并补齐 CLI 图标、右键菜单、中键关闭与展开按钮；⑦ 修复点击不同任务时 50ms 定时器抢走 `[data-keep-focus]` 焦点的问题；⑧ 音乐播放器音量持久化、直播电台显示「直播」、跑马灯仅在播放时滚动且悬停暂停，滑块操作后交还终端焦点。同步 `en.ts`、`docs/features*.md` 与 `check-ui.mjs`。
- **2026-11-16 19:04** 修复文件预览大文件无语法高亮并扩展语法规则：`previewHighlight.ts` 上限由 100,000 字符提高到 1 MB（与 `file-preview.ts` 预览上限一致），改为仅跳过 > 50,000 字符且平均行长超过 2,000 字符的压缩单行文件；统一 CRLF / CR 换行归一化以保证高亮行号对齐，纯文本 token 不再多余包裹 `<span>`，补全 `dockerfile`、`makefile`、`scss`、`less`、`kotlin`、`swift`、`lua`、`diff`、`graphql` 等语言映射并在 `index.css` 补充 CSS / Shell / Markdown 的 `.hljs-*` 语义配色；同步 `docs/features*.md` 与 `check-ui.mjs`。
- 2026-11-16 06:52 终端「回到顶部」按钮（普通屏与 Claude 备用屏两个）悬停时边框与图标变强调色、底色变深，便于确认指针已落在按钮上。
- 2026-11-16 06:48 终端回到顶部覆盖 Claude Code 全屏模式：它画在备用屏里、自己管理滚动，xterm 无回滚区，原按钮不显示；现在 Claude 任务处于备用屏时，终端右上角显示「回到顶部」，点击向 PTY 发送 Ctrl+Home（`ESC[1;5H`，依据官方 fullscreen 文档）。其他 CLI 的备用屏暂不处理；`docs/features*.md` 同步。
- 2026-11-16 06:34 发布 2.1.4：`package.json` / `package-lock.json` 升到 2.1.4，提交 `68f0701`（终端交互、4 个护眼主题等）与 `bb73b4d`（版本号）已推送到 `origin/main`，GitHub Release `v2.1.4`（目标 `bb73b4d`）附 `OneAI-Setup-2.1.4.exe`；提交里一并带入了此前未提交的额度重置文案改动（`quota-service.ts`）。
- 2026-11-16 06:31 新增 4 个护眼主题：薰衣草、雾灰（浅色），森夜、墨夜（深色），含终端配色，设置页护眼组共 8 个（上浅下深）；同步 `index.css`、`index.html` 首帧白名单、`themes.ts`、`types`、`TerminalViewport.tsx`、`en.ts` 与文档。
- 2026-11-16 06:31 终端区缺口：「设置 → 终端 → 单击打开链接」开关（默认关）；拖入的图片本次运行内可在预览面板打开，带引号的绝对路径也识别为链接；会话缓冲超限裁剪后从行首开始，避免回放时开头乱码；侧栏单个文件夹任务超过 30 个时对屏幕外任务行启用 content-visibility。
- 2026-11-16 06:07 终端粘贴反馈：粘贴后短暂提示「已粘贴」，截图提示「已粘贴图片路径」，剪贴板为空或读取失败时提示「剪贴板为空」「粘贴失败」，与「已复制」共用终端底部提示（`TerminalViewport.tsx`）；`docs/features*.md` 同步。
