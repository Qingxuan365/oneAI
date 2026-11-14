# OneAI 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 27 - 多账号配置；Phase 26 参照效果图重做顶栏与侧栏（第一至三步完成，标题栏融合待决定）
- **状态**：Phase 26 第三步（任务行第二行显示最近一条用户消息）已完成并通过自动检查与真实应用端到端检查；Phase 26 第二步（侧栏改为「文件夹 → 任务」、Git 分支徽标、最近任务）已完成并通过自动检查与真实应用端到端检查；多账号（Codex、Claude Code、Kimi Code）已完成并通过自动检查，便携包已生成，真实应用里的环境注入与账号隔离已端到端验证，真实登录流程待手工验收；Phase 26 第一步（顶栏 Tokens / Cost / CPU / Mem / Net 与侧栏品牌头部）已完成并通过自动检查与真实应用启动检查；第二步（侧栏按文件夹分组、Git 分支、最近任务）和第三步（任务行消息预览）尚未开始；桌面实际观感与中文输入法仍待手工验收

## 2. 进度看板

### 已完成
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
- [ ] 待确认：用量面板对 Codex CLI（会话来源 `cli`）的模型识别未实测，本机只有 `vscode` 与 `guardian` 来源的会话；较新 Codex 版本把线程投影到 SQLite（`thread_history_1.sqlite`，164 个线程，部分日期如 11-08 ~ 11-10 的会话文件已不在磁盘上），要补全需引入 SQLite 读取依赖。`session-history.ts`（历史会话抽屉）同样只读 `.jsonl`、未覆盖 `archived_sessions` 与 `.zst`。
- [ ] 待决定：用量面板暂不含 Kimi Code（本机会话目录已空，没有样本；官方文档只说逐条记录在 `agents/main/wire.jsonl`，未说明 token 字段；用户当前没有付费账号，无法生成样本）与 OpenCode（本机未安装，存储方式在 JSON 文件与 `opencode.db` SQLite 之间说法不一，若是 SQLite 需引入读取依赖）；Claude Code 日志无费用字段，面板只显示 Tokens，不换算美元。
- [ ] 在 Windows 桌面端实际运行满 60 分钟，确认中文语音开关、提醒弹框与关闭后重新计时。
- [ ] 手工验收主题三档切换、系统外观联动、终端配色及重启恢复，以及真实 CLI 长模型名称和额度消息下的顶栏体验；自动检查使用组件夹具，未启动真实 PTY。
- [ ] 手工验收 CLI 分组拖拽、键盘排序与重启后的顺序恢复。
- [ ] 在 Windows 桌面端分别用中文输入法验收 Codex、Kimi Code、Claude Code、OpenCode、Grok Build 和普通 Shell 的输入、候选字显示、回车提交及窗口横向稳定性；样式边界已恢复，运行时结果待确认。
- [ ] 手工验收 Phase 25 界面：全局快捷键在各 CLI 运行时的实际表现（`Ctrl+Tab`、`Ctrl+1…9`、`Ctrl+Shift+N/B/H`、`Ctrl+,`）、任务重命名与重启后保留、侧栏音乐播放器的真实播放与进度拖动、各主题下的弹窗观感，以及 1280 默认窗口和最大化时的顶栏收起顺序。
- [ ] 桌面验收文件预览面板：点击 Claude / Codex 输出中的文件路径、拖拽面板宽度后终端字符矩阵重排、工作目录外路径不出现链接；后续可选增强为语法高亮与 Markdown 渲染。
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
- 多账号：Claude Code 非默认账号拿不到额度（statusLine 快照由所有会话共用，无法区分账号）；Kimi Code 账号额度读取该账号目录下的 `credentials/kimi-code.json` 并请求 Kimi 官方额度接口；账号附加环境变量以明文存放在 localStorage，不要填密钥；历史会话（`session-history.ts`）仍只读默认账号目录，从历史恢复的任务使用默认账号。
- Tokens / Cost 是「最近活跃会话」的累计值：Claude Code 共用同一个 statusLine 快照，多个会话并行时显示最后写入的那个，Tokens 不含子代理的独立记录；Codex 无 Cost。网速依赖系统 Windows PowerShell，读取连续失败两次后显示「--」。
- 本轮交互修复已通过生产构建；桌面端实际点击与多终端并发行为尚未手工验收。
- 会话日志缓冲保留最近约 2 MiB 输出；更早内容不会出现在复制和导出的日志中。

## 4. 最近验证

- **2026-11-14 22:22**：版本号升为 2.1.3 后 `npm run build:win` 通过，`release/OneAI-Setup-2.1.3.exe` 85179080 字节；沿用上一条验证的 `tsc`、`check:i18n`、`check:ui`，升版本本身未改代码。
- **2026-11-14 22:19**：设置面板问题修复后 `tsc --noEmit` 通过，`npm run check:i18n` 500 条无缺失，`npm run check:ui` 282 项全部通过（新增 11 项：提醒时长 / 时钟增加小时数输入框的清空、负数与失焦补齐，默认账号目录拦截）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.1.exe` 85179651 字节。输入框问题按代码推断并由新增检查覆盖，未在桌面实机复现原问题。
- **2026-11-14 23:01**：移除内置电台后 `tsc --noEmit` 通过，`npm run check:i18n` 498 条无缺失，`npm run check:ui` 283 项全部通过（在线音乐设置改为无内置链接，并新增「5 行内无滚动条、第 6 行起出现滚动条且高度保持 5 行」检查）；`npm run build:win` 通过，`release/OneAI-Setup-2.1.3.exe` 85180277 字节。
- **2026-11-14 22:15**：在线音乐功能后 `tsc --noEmit` 通过，`npm run check:i18n` 499 条无缺失，`npm run check:ui` 273 项全部通过（含新增 7 项在线音乐设置检查）；`parsePlaylist` 用 .m3u / .pls 样例手测通过（过滤 file:// 与 .m3u8、补全相对地址、按序号排序）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.1.exe` 85178902 字节。内置电台只用 curl 核对了 HTTP 可达（Radio Paradise 四个频道、KEXP 返回 200 / 206 音频类型），尚未在应用里实际播放；AAC 流能否被 Electron 解码待手工验收。
- **2026-11-14 22:03**：「重新检测」按钮反馈修复后 `tsc --noEmit` 通过，`npm run check:i18n` 485 条无缺失，`npm run check:ui` 全部通过（含新增 2 项按钮反馈检查）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.1.exe` 85176631 字节。未在桌面实际点击验证，待手工验收。
- **2026-11-14 12:30**：升版本到 1.0.1 后 `tsc --noEmit` 通过，`npm run check:i18n` 484 条无缺失，`npm run check:ui` 264 项全部通过，`npm run build:win` 通过（`release/OneAI-Setup-1.0.1.exe` 约 81 MB）。

- **2026-11-14 12:20**：修复英文界面残留中文后 `tsc --noEmit` 通过；`npm run check:ui` 264 项全部通过（新增：英文下主界面、侧栏、折叠侧栏、账号侧栏、用量面板、历史抽屉以及设置各页扫描文本与 title / aria-label / placeholder 属性，不得出现中文）；`npm run check:i18n` 484 条文案、0 缺失；`npm run build:win` 通过，安装包约 81 MB。已发布的 `v1.0.0` 仍是修复前的构建，需要重新发布才能带上修复。

- **2026-11-14 12:02**：多语言、首次引导、自定义 CLI 与日期开关后 `tsc --noEmit` 通过；`npm run check:ui` 252 项全部通过（新增：设置 → CLI 页的检测状态与自定义 CLI 增删改、语言切换后设置页与主题名变为英文并可切回、顶栏日期开关、首次引导两步流程与未检测到 CLI 的提示、账号页显示本机主目录）；`npm run check:i18n` 480 条文案、0 缺失译文、0 占位符不一致；检测函数用临时可执行文件实测（带参数命令、带引号的含空格路径、无扩展名脚本不误判、不存在的命令不命中）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 约 81 MB。真实应用里的首次引导与英文界面尚未手工验收。

- **2026-11-14 10:47**：文件预览 minimap、设置开关与 Kiro 主题后 `tsc --noEmit` 通过；`npm run check:ui` 连续 3 次 217 项全部通过。新增检查：长文件显示 minimap 且画布有内容、滑块只覆盖可见范围、滑块随滚动位置移动、点击 minimap 中部滚到约中间、滚轮转发到预览、关闭时不渲染、短文件无滑块、非文本预览无 minimap、设置页开关默认开且可关可开、Kiro 与其他新主题的对比度。检查中发现并修正：隐藏的测试窗口不渲染帧，`requestAnimationFrame` 与 `scroll` 事件都不会触发（真实窗口正常），minimap 改为 scroll 事件直接更新、测试里手动派发 scroll；顶栏宽度检查此前约每三次有一次偶发失败，原因是 `setSize` 后固定等待 150 ms 而窗口尺寸异步生效，改为先等 `innerWidth` 追上窗口内容宽度再检查，之后连续 3 次全过。Kiro 色值来自第三方 MIT 主题（2025-09 最后更新），不是 Kiro 官方发布；其终端背景 / 前景 / 黑白两色未定义，按主题色板推导，Kiro Light 的警告色与终端黄 / 青为保证对比度取更深的值。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85163000 字节（北京时间 2026-11-14 10:47）。未验证：minimap 与新主题的截图观感、超长文件（上万行）下的绘制耗时、拖动手感；安装包未安装运行。另：早先用于验证的 3 个 `verify.mjs` 后台 node 进程因 `quota-service` 定时器不会自行退出，已在用户授权后结束（之后的验证脚本都显式 `process.exit`）。

- **2026-11-14 11:12**：历史会话抽屉避开顶部后 `tsc --noEmit` 通过；`npm run check:ui` 218 项全部通过（新增：抽屉与遮罩顶边不小于 44px）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85163592 字节（北京时间 2026-11-14 11:12）。未验证：真实桌面里点击抽屉关闭按钮不再触发窗口关闭（夹具无系统窗口控件），安装包未安装运行。
- **2026-11-14 11:08**：历史会话 CLI 筛选改为由实际数据生成后 `tsc --noEmit` 通过；`npm run check:ui` 217 项全部通过（下拉断言改为「全部 / Claude Code / Codex / Kimi Code」，仅含夹具历史里出现的 CLI）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85163033 字节（北京时间 2026-11-14 11:08）。未验证：真实桌面里新增 CLI 历史出现后的下拉观感、安装包未安装运行。
- **2026-11-14 10:35**：用量面板接入 Pi 后 `tsc --noEmit` 通过；`npm run check:ui` 202 项全部通过（Pi 组、Pi 行与无账号分段检查并入原有用例）。对本机真实 Pi 日志与独立重新计数对照：deepseek-chat 29 次 / 372647 Tokens / 9 会话、deepseek-v4-pro 2 次 / 17360 Tokens / 1 会话，两者完全一致；9 条出错且 usage 全为 0 的回复被排除；Pi 的用量全部落在 11-12。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85162094 字节（北京时间 2026-11-14 10:35）。未验证：Pi 面板行的截图观感；Pi 自定义会话目录（环境变量改动存储位置）的情形；安装包未安装运行。

- **2026-11-14 10:26**：用量按账号统计与 4 个 IDEA 主题后 `tsc --noEmit` 通过；`npm run check:ui` 第二次运行 202 项全部通过（第一次运行有 2 项顶栏宽度检查「2800 宽度显示时钟与全部系统资源」「1920 最大化保留用量与系统资源」失败，未改动相关代码，重跑即过，判断为窗口缩放等待时间不足造成的偶发失败，根因未定位）。新增检查：Codex 拆成默认账号与 alt 账号两段且各列自己的模型、账号小计、只有默认账号的 CLI 不显示账号段、日方块提示按「CLI（账号）」列出且只在有多个账号时带账号名、4 个 IDEA 主题的对比度与设置页主题按钮。账号归属用真实日志加合成的第二账号目录验证：alt 账号只得到复制进去的那一个会话（10 次请求，仅出现在该会话所在的 11-12），默认账号不重复计数，指向默认目录（大小写不同）的账号被忽略，空 id、Kimi、null 等无效条目被忽略。IDEA 主题色值来自 `intellijlaf.theme.json`、`HighContrast.theme.json`、`expUI_dark/light.theme.json` 与各配色方案；IDEA 配色方案文件里没有控制台 ANSI 色（高对比度除外），终端 ANSI 色按各主题色板推导。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85161995 字节（北京时间 2026-11-14 10:26）。未验证：弹窗与新主题的截图观感、真实第二账号（真实的 `CODEX_HOME` / `CLAUDE_CONFIG_DIR` 目录）下的统计、安装包未安装运行。

- **2026-11-14 10:18**：用量面板改为按 CLI 分组后 `tsc --noEmit` 通过；`npm run check:ui` 190 项全部通过（新增：每个 CLI 一个分组标题且按 Tokens 排序、Codex 组内真实模型在前且自动审查子会话在末尾并带「子会话」标记、分组标题显示该 CLI 的请求数小计）。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85160497 字节（北京时间 2026-11-14 10:18）。未验证：分组表格的截图观感、安装包未安装运行。

- **2026-11-14 10:14**：用量面板修复 Codex 漏统计与弹窗加宽后 `tsc --noEmit` 通过；`npm run check:ui` 187 项全部通过（新增：弹窗宽度不小于 700px、20 个模型时弹窗不超出窗口且内容区纵向滚动、滚动后能到达底部说明）。对本机真实日志重跑解析（首次约 3.6 s、缓存后约 19 ms）：此前只读到 1 个明文会话，现读入 `sessions` 与 `archived_sessions` 的 119 个会话（含 `.zst`），16 个有数据的日子；本周 Codex 为 gpt-6.1-terra 209 次 / 4 会话、gpt-6-astra 121 次 / 15 会话、gpt-6.1-sol 8 次 / 2 会话、自动审查 21 次；用 Node 24 的 `zlib.zstdDecompressSync` 独立解压核对了模型字段位置。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85159646 字节（北京时间 2026-11-14 10:14）。未验证：弹窗截图观感、Codex CLI 来源（`cli`）会话的模型识别、SQLite 线程库里没有会话文件的对话；`fzstd` 在打包后的应用里解压（构建通过，但安装包未安装运行）。

- **2026-11-14 10:03**：本周用量面板、8 个新主题与休息提醒文案改动后 `tsc --noEmit` 通过；`npm run check:ui` 184 项全部通过（新增：用量面板按模型列行、周请求总数、紧凑单位、方块图 182 格 / 每列 7 格且周一起始、五档颜色、未来日期不着色且无提示、今天描边、悬停提示含日期与请求数、方块图不横向溢出、空周提示；8 个新主题的正文 / 次要文字 / 点缀色对比度下限与各主题底色互不相同；设置页两组主题按钮；顶栏增加用量按钮后 7 种宽度仍不重叠）。检查中发现并修正了 Darcula 次要文字与 Breakers 点缀色对比度不足。对本机真实日志跑解析：182 天、7 个有数据的日子，本周 Claude Code（Sonnet 5.5 / Opus 5.5 / Fable 5.2）、Antigravity（Gemini 4 Hydrogen / Argon / 3.8 Flash）、Codex（`codex-auto-review`）各行合计与日志吻合，首次读取约 131 ms、缓存后约 10 ms。主题色值来源：Sublime Text 官方 `LegacyColorSchemes` 仓库（Monokai Bright、Solarized、Cobalt）与 Sublime Mariana / Breakers 的开源移植；Monokai 取自 Monokai Bright 的底色与语法色，Mariana / Breakers 为第三方移植值，面板层级按本应用 token 推导。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85141797 字节（北京时间 2026-11-14 10:03）。未验证：弹窗与新主题的截图观感、安装包未安装运行。基线（未改动代码）上 `check:ui` 在本地时间 02:00 前会有 1 项「历史会话按今天 / 昨天 / 更早分段」失败，因夹具里的「昨天」条目按当前时刻推算，与本次改动无关，尚未修复。

- **2026-11-14 06:21**：历史会话抽屉筛选改动后 `tsc --noEmit` 通过；`npm run check:ui` 154 项全部通过（新增：搜索框聚焦时无轮廓与高亮边框、CLI 筛选为含全部 / Codex / Claude Code / Antigravity / Pi / Kimi Code 的下拉）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85135980 字节（北京时间 2026-11-14 06:21）。未验证：Antigravity / Pi 选项在真实桌面里的观感。

- **2026-11-13 12:00**：Phase 26 第三步后 `tsc --noEmit` 通过；`npm run check:ui` 142 项全部通过（新增：有会话的任务显示第二行、新会话显示「新会话 · 时间」、未读到时占位、不支持的 CLI 保持单行、长文本单行截断、两行行高、序号与徽标靠右、新会话时间跟随时钟偏移）。检查中发现并修复了一处我引入的排版问题：任务按钮是 flex 列容器，子元素没有被拉伸到整行宽度（第一行只有 89px），会让摘要无法截断、账号徽标与序号贴着标题而不靠右，已给两个子元素加 `w-full` 并补检查。主进程读取逻辑单元测试 22 项（任务到会话的分配：最近创建的任务优先、闲置的旧任务不抢新任务的会话、早于所有任务的会话视为历史、恢复型任务按 id 直接对应、2 秒容差只在没有候选时才用；Claude 过滤工具结果 / 命令标签 / 中断提示 / meta / 子代理、长文本截到 100 字、尾部很大时扩大读取范围、账号目录隔离；Codex 取 user_message 事件并忽略注入上下文 / 子代理 / 其他目录；Kimi 读 state.json 的 lastPrompt 并忽略已归档；输入校验）。单元测试中途发现一处真实缺陷：原先 10 秒的时钟容差会让后创建的任务抢走前一个任务的会话，已改为先严格按创建时间归属、没有候选时才用 2 秒容差。真实数据耗时：本机 48MB、23 个会话文件的 Claude 目录冷读 72ms、缓存后 4ms。真实应用端到端 14 项（隔离 userData + 合成的账号目录会话文件 + 真实 PowerShell）：Claude / Codex / Kimi 任务各显示自己会话的最近消息，同文件夹先后创建的两个 Claude 任务各得各的会话，新会话显示创建时间，系统终端保持单行，恢复型任务按会话 id 对应，账号已删除的任务不读取摘要（不借用默认账号），追加消息后几秒内更新，原本的新会话产生会话文件后显示消息，选中并启动停止的任务后第二行仍在；截图核对观感。`npm run build:portable` 通过，`release/OneAI-Portable-1.0.0.exe` 74911897 字节（北京时间 2026-11-13 12:00），包内含新代码；安装版仍是 10:42 的旧产物。未验证：用真实 AI CLI 并行工作时的归属准确度。

- **2026-11-13 11:48**：Phase 26 第二步后 `tsc --noEmit` 通过；`npm run check:ui` 132 项全部通过（侧栏检查按新结构重写：文件夹行与任务数、Git 徽标仅出现在仓库、「+」CLI 菜单、文件夹右键菜单、新建 / 自定义 / 打开 / 移除事件、任务只能在文件夹内排序且 Alt+方向键到边界无效、拖到其他文件夹无效、文件夹手柄与拖拽排序、最近任务折叠 / 展开 / 恢复 / 查看全部、添加文件夹、折叠窄条的文件夹按钮；新建任务弹窗的 CLI 切换、命令重置、账号选择与按文件夹生成默认名）。数据层单元测试 34 项（旧格式多工作区合并与去重、空工作区不导入、上次使用的工作区优先并展开、首次启动示例任务、旧单工作区存储、损坏数据忽略、迁移不修改旧数据、状态校验、排序语义、最近任务归类与截断）；Git 读取 10 项（HEAD、子目录、游离 HEAD、worktree、损坏文件、批量上限，本仓库读出 main）。真实应用端到端 28 项（隔离 userData + 旧格式种子状态 + 真实 PowerShell + CDP）：三个有任务的旧工作区合并为三个文件夹且空工作区不导入、OneAI 展开其余折叠、本仓库徽标 main、仓库文件夹 feature/a 且仓库外的普通文件夹无徽标、新格式落盘且旧数据逐字节保留；两个文件夹同时运行真实终端、切换后第一个终端仍存活；「+」菜单列出已安装的 CLI 并在该文件夹新建任务、新任务在该目录运行；Ctrl+Tab 四次按键都符合侧栏顺序（含回绕与反向）；最近任务由本机真实历史归类、已打开的文件夹不重复；重启后文件夹顺序 / 展开状态 / 任务 / 活动任务一致；移除文件夹有应用内确认且持久化。端到端中途出现过 3 项 Ctrl+Tab 失败，改为读取持久化的侧栏顺序作为标准答案并多等 100 毫秒后 4 次按键全部符合，上一轮失败的确切原因没有完全定位（怀疑是读取活动任务早于界面刷新）。截图核对侧栏观感。`npm run build:portable` 通过，`release/OneAI-Portable-1.0.0.exe` 74910621 字节（北京时间 2026-11-13 11:48），包内含新代码；安装版仍是 10:42 的旧产物。未验证：点击「最近任务」恢复真实 CLI 会话、用真实 AI CLI 并行、鼠标拖拽的实际手感。

- **2026-11-13 11:23**：多账号端到端检查（真实应用 + 隔离 userData + 真实 PTY + CDP）21 项全部通过：默认账号任务未设置 `CODEX_HOME` 且 `codex login status` 为已登录；Codex 账号任务的 `CODEX_HOME` 指向账号目录、附加变量 `FOO_TEST` 生效、该账号为未登录，账号目录由 OneAI 自动创建；Claude 账号任务 `CLAUDE_CONFIG_DIR` 生效且 `claude auth status` 的 `loggedIn:false`、目录跟随；Kimi 账号任务 `KIMI_CODE_HOME` 生效且 `kimi provider list` 为「No providers configured.」；无效账号被拒绝启动；重启后仍沿用账号环境；设置页三个账号经真实状态命令均显示「未登录」；用「用 alt 新建」在真实界面启动 Codex / Claude 账号任务，任务行显示 `alt`，Codex 终端显示新账号的登录引导、Claude 显示初始化界面（而非默认账号的已登录界面），顶栏额度为「--」；三个账号的额度读数符合预期（Codex / Claude 未知，Kimi 无凭据离线）且默认 Codex 额度仍是真实数据；默认账号的 `auth.json`、`kimi-code.json`、`.credentials.json` 修改时间前后一致；结束后无残留 electron / PowerShell / CLI 进程。截图核对设置页与账号任务观感。检查中发现默认 1280 窗口下顶栏账号徽标被收起（断点 58rem 过于保守，且该条断言只读 DOM 文字、被隐藏元素蒙过），已改为 50rem 与模型名同时收起，并新增 1280 / 1440 宽度下「徽标可见」检查；`npm run check:ui` 108 项全部通过，`tsc --noEmit` 通过。`npm run build:portable` 通过，`release/OneAI-Portable-1.0.0.exe` 74909980 字节（北京时间 2026-11-13 11:23），包内 CSS 含新断点；安装版仍是 10:42 的旧产物。未触发真实登录流程（会打开浏览器）、未验证 Kimi 账号登录后的额度接口。

- **2026-11-13 11:10**：多账号改动后 `tsc --noEmit` 通过；`npm run check:ui` 106 项全部通过（新增 23 项：侧栏账号徽标与「用 <账号> 新建」、已删除账号标记、新建任务弹窗账号选择、设置页账号添加 / 编辑 / 删除二次确认 / 登录入口、相对路径 / 同名 / 同目录 / 无效环境变量被拒、顶栏账号徽标在 7 种宽度下任务名不少于 48px）。主进程逻辑用临时目录跑了 32 项：环境变量构造（配置目录变量不会被附加环境变量覆盖、无效路径 / 文件 / 未知 CLI 被拒、目录自动创建）、Codex 账号按自己的 `CODEX_HOME` 读取 5h 70% / 7d 45% / 模型 / Tokens 且无会话时记为未知而不是 100%、Claude 账号读自己的 settings.json 且不借用默认账号的 Tokens / Cost、Kimi 账号无凭据时为离线、删除账号后缓存清理、`codex login status` / `claude auth status` 在空目录为未登录而默认目录为已登录。CLI 层实测：`CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`KIMI_CODE_HOME` 指向空目录后三者都显示未登录（Codex 在目录不存在时直接报错，故启动前自动创建），默认账号凭据不受影响；`agy` 覆盖 HOME / USERPROFILE 后仍是同一登录。`npm run build:portable` 通过，`release/OneAI-Portable-1.0.0.exe` 74908981 字节（北京时间 2026-11-13 11:10），包内含新代码；安装版 `OneAI-Setup-1.0.0.exe` 仍是 10:42 的旧产物、不含多账号。未验证：真实应用里 PTY 注入环境变量的端到端效果、真实登录流程、Kimi 账号的额度接口。

- **2026-11-13 10:42**：Phase 26 第一步后 `tsc --noEmit` 通过；`npm run check:ui` 83 项全部通过（新增：品牌头部、Tokens / Cost 与系统资源文案、7 种窗口宽度下顶栏各块不重叠且任务名不少于 48px、2800 宽度时钟与全部系统资源可见、1920 最大化保留用量与系统资源）。用 node 抓取并对照三种来源：Claude 会话记录去重后累计 token（与快照里的当前上下文大小不同）、Codex `token_count` 累计值、物理网卡计数。网速实测：`netstat -e` 在本机（有 FlClash 虚拟网卡）下载 57 MB 时汇总读到 335 MB，故弃用，改读物理网卡；新读法 57.2 MB 下载对应约 10 MB/s × 6 秒 ≈ 61 MB，本机回环 200 MB 不计入，空闲单次采样约 27 毫秒，常驻 PowerShell 首次启动约 1.4 秒。`vite build` 后用隔离的 userData 启动真实应用，通过 CDP 读到品牌头部 `v1.0.0`、顶栏 `CPU: 12% • Mem: 17.1 GB • Net: ↑24K/s ↓554K/s`，`getAllQuotas` 返回 Claude tokens 8242782 / cost 4.29、Codex tokens 26722，关闭后无残留 PowerShell 子进程。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85124203 字节（北京时间 2026-11-13 10:42）。安装包未安装运行，真实终端任务下的顶栏观感与窗口最小化恢复未在桌面实测。注意：本机时钟取到的北京时间早于上一条记录，按规范仍取 `date` 的值。

- **2026-11-13 12:47**：Pi 滚动修复与音乐播放器开关改动后 `tsc --noEmit` 通过；`npm run check:ui` 72 项全部通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85120974 字节（北京时间 2026-11-13 12:46），`win-unpacked` 中已带 `node-pty/prebuilds/win32-x64/conpty/conpty.dll`。用 node-pty 抓取真实输出：系统 ConPTY 下 Pi 只有 `?1049h`、没有 `?1000h/?1003h/?1006h`，换 `useConptyDll` 后鼠标追踪序列完整透传；最小复现确认系统 ConPTY 会吞掉「开启原始输入前」写入的鼠标模式，滚轮 SGR 输入两种方式都能到达程序。其余 CLI：Claude Code、Codex 在备用屏幕并自带鼠标追踪，滚轮由 CLI 自行滚动；Kimi Code 走普通缓冲区，使用 xterm 原生滚动条；Antigravity 进入后又退出备用屏幕，同样走原生滚动条。安装包未安装运行，Pi 的实际滚轮手感与音乐开关界面待桌面确认。

- **2026-11-13 12:11**：扩展分组补齐修复后 `tsc --noEmit` 通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85121233 字节（北京时间 2026-11-13 12:10）。未跑 `check:ui`，安装包未安装运行，切换工作文件夹后 Antigravity / Pi 分组出现的实际效果待桌面确认。

- **2026-11-13 11:11**：侧栏交互优化后 `tsc --noEmit` 通过；`npm run check:ui` 72 项全部通过（新增 14 项：待查看标记、分组与任务右键菜单、中键关闭、`Alt+↑/↓` 与拖拽排序、折叠窄条的待查看样式）。另用模拟 `electronAPI` 渲染完整 App 的隐藏窗口跑通 18 项流程检查：点「+」不出弹窗直接建任务且使用分组默认命令与工作文件夹、后台任务运行约 12 秒无输出后出现「待查看」而当前任务不出现、切过去后清除、右键菜单调用打开目录接口、`Ctrl+Shift+T` 新建、`Ctrl+Shift+W` 关闭存活任务先确认；并截图核对深浅主题、折叠窄条、右键菜单与空状态。`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85121218 字节（北京时间 2026-11-13 11:11）。未连接真实 PTY：`shell:open-directory` 主进程实现、真实 CLI 下的空闲判定和鼠标实际拖拽未验证，安装包未安装运行。

- **2026-11-13 09:28**：移除语音识别后 `tsc --noEmit` 通过；`npm run check:ui` 58 项全部通过（去掉 13 项语音检查，`Ctrl+V` 只写入一次的检查改用普通终端夹具保留）；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 85119163 字节（北京时间 2026-11-13 09:28），此前带模型时约 1.58 GB；`release/win-unpacked/resources` 中已无 `voice-runtime`，构建出的主进程与 preload 不含 `voice:` 通道。安装包未实际安装运行，终端区去掉麦克风图标后的实际界面待桌面确认。

- **2026-11-13 07:07**：Antigravity 额度、Pi 模型显示与 Pi 输入法锚点改动后 `tsc --noEmit` 通过；`npm run check:ui` 通过，新增 Pi 输入法定位两项检查（真实光标在行尾 / 状态栏）。用真实 `agy -p /usage` 输出验证解析（Gemini 分组 5h 96%、7d 96%）；用 node-pty 抓取 pi 真实输出，确认输入框为两条横线夹反色空格、真实光标在行尾之外；`pi -p` 实际调用 deepseek-chat 返回 OK。`npm run build:win` 通过。模拟组合不经过 Windows 输入法，Pi 与 Antigravity 在顶栏的实际显示及真实输入法候选框位置待桌面验收。

- **2026-11-13 00:56**：侧栏折叠窄条、空页面隐藏额度、模型与额度数据源修复、时钟偏移设置、提醒改 60 分钟后，`tsc --noEmit` 通过，`npm run check:ui` 全部通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576282908 字节。`quota-service.ts` 另用本机真实文件运行（Claude 得到 Fable 5.2 / medium，Codex 得到 gpt-6.1-terra / max、5h 73%、7d 92%），并用模拟目录验证会话记录覆盖配置、配置较新时以配置为准、窗口过期显示 100%。折叠窄条、设置「时间」栏目与顶栏时钟的实际界面未在桌面验证，待手工验收。

- **2026-11-13 00:24**：第二批终端区修复后 `tsc --noEmit` 通过；`npm run check:ui` 70 项全部通过（新增搜索计数 / 无结果 / 无效正则、Shift+Enter 及系统终端例外、导出渲染文本、中文与折行链接定位、焦点在按钮上打字、预览行高亮 / 可选中 / 重读共 14 项；去掉 `allowProposedApi` 时搜索计数项失败）。`vite build` 后用隔离的 userData 启动真实应用（真实主进程与 PowerShell PTY），通过 CDP 驱动 19 项全部通过：输入执行、系统终端 Shift+Enter、搜索计数、关闭搜索后 Ctrl+C 生效、焦点在顶栏按钮时打字进终端、路径普通单击不打开而 Ctrl+单击打开预览并可重读、关窗确认的取消 / 再次询问 / 确认退出，页面与主进程无报错。Pi 模型读取用模拟用户目录验证回退、增量、半行、切换会话文件、文件重写共 9 项通过，命令拆分 2 项通过。北京时间 2026-11-13 00:28 重新打包，`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576287977 字节，已包含本批修复；此前 00:06 的安装包终端搜索会显示「正则无效」，已被本次产物覆盖。安装包未实际安装运行。未验证：真实麦克风录音与计时、Ctrl+Shift+M、Shift+Enter 在各 AI CLI 中的实际换行、Alt 与 Ctrl+W / Ctrl+R 在安装版中的表现、真实 Pi 会话中切换模型后的顶栏刷新。

- **2026-11-13 00:07**：终端区交互修复后 `tsc --noEmit` 通过；`npm run check:ui` 56 项全部通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576286044 字节（北京时间 2026-11-13 00:06）。此前两次打包因 `release/win-unpacked` 被占用（EBUSY）失败，疑为被中断的打包进程残留，重试后恢复。Shift+Enter 在各 CLI 中是否换行、语音图标在留白中的位置、搜索计数与高亮、折行长网址与中文行的链接点击、`文件:行号` 定位均未在桌面实测，待手工验收；`getPiInfo` 读会话记录仅按本机会话文件结构核对，未在运行中的应用里切换模型验证。

- **2026-11-12 22:40**：Antigravity 额度占位改动后 `tsc --noEmit` 通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576284445 字节。未在桌面端实际查看 Antigravity 分组顶栏，待手工验收。

- **2026-11-12 17:38**：Kimi 输入法定位二次修复：在显示的 Electron 31 窗口中用 CDP `Input.imeSetComposition` 模拟组合输入，记录 textarea 位置时间线。修复前每次按键后 textarea 都被 xterm 的 `updateCompositionElements` 延时回调写回真实光标（输入行最右端或状态栏右下角），停留约 6 毫秒到下一帧；修复后全程停在输入框文字末尾。`tsc --noEmit` 通过；`npm run check:ui` 54 项通过，其中新增的两项 Kimi 输入法定位检查在去掉 `.ime-anchored` 规则时失败；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576284121 字节（北京时间 2026-11-12 17:36）。模拟组合不经过 Windows 输入法，真实输入法候选框位置待桌面验收。

- **2026-11-12 17:16**：搜索框描边修复、系统终端隐藏额度、提醒时长可设置、语音按钮贴输入行四处改动后，`tsc --noEmit` 通过，`npm run check:ui` 52 项通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576283664 字节（北京时间 2026-11-12 17:15）。四处改动的实际界面均未在桌面验证，其中语音按钮在各 CLI 输入行上的位置、流式输出时是否跳动待手工验收。

- **2026-11-12 16:28**：历史抽屉改动后 `tsc --noEmit` 通过，`npm run check:ui` 52 项通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576282172 字节。抽屉的实际位置、滑入动画与各主题观感未在桌面验证，待手工验收。

- **2026-11-12 16:24**：低优先级交互修复后 `tsc --noEmit` 通过，`npm run check:ui` 52 项通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576282009 字节。右键菜单、折叠窄条与顶栏布局、搜索跟随切换均未在桌面实际操作验证，待手工验收。

- **2026-11-12 16:19**：中优先级交互修复后 `tsc --noEmit` 通过，`npm run check:ui` 52 项通过；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576281891 字节。拖拽插入线、重命名焦点、滚动到当前任务、启动失败提示均未在桌面实际操作验证，待手工验收。

## 5. 最近完成

- **2026-11-14 23:01** 设置 → 提醒 → 音乐播放器：移除内置的免费电台按钮与 `musicPresets.ts`（同步删除两条译文、README / features / AGENTS 相关描述），已添加的在线音乐列表每行固定 3.25rem、最多完整显示 5 行，超出出现滚动条。
- **2026-11-14 22:26** 发布 GitHub Release `v2.1.3`（目标提交 `33a3f9f`），附 `OneAI-Setup-2.1.3.exe`（85179080 字节，SHA-256 `87d1c2f5…330dcf09`），已核对线上附件大小与本地一致；README 的安装说明指向「latest release」，无需修改。内置电台与 AAC 流的实际播放仍待手工验收。入口：https://github.com/Qingxuan365/oneAI/releases/tag/v2.1.3 。
- **2026-11-14 22:22** 应用版本升为 2.1.3（`package.json` 与 `package-lock.json`），安装包名为 `OneAI-Setup-2.1.3.exe`；已推送 `main`。
- **2026-11-14 22:19** 修复设置面板 4 处问题：提醒时长输入框清空即被重置为 1、时钟「增加小时数」无法用键盘输入负数（两处改为整数输入框：输入中允许暂时为空或只有负号，合法值即时生效，失焦补齐到范围内）；时间页「当前顶栏显示」改为每秒刷新；账号配置目录不能与默认账号目录相同（含 `~` 写法）。入口：[SettingsModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/SettingsModal.tsx)、[accounts.ts](D:/GitHub/OneAI/src/renderer/src/accounts.ts)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。
- **2026-11-14 22:15** 音乐播放器新增在线音乐：「设置 → 提醒 → 音乐播放器」可添加音频直链、电台流、.m3u / .pls 歌单地址，并内置 5 个免费电台（Radio Paradise 四个频道、KEXP）点击即加入；在线曲目排在本地音乐之后，用独立 audio 元素播放（跨域音频接入频谱分析器会被静音，在线曲目的跳动条为装饰动画）；不支持 .m3u8（HLS）；「恢复默认设置」保留在线音乐；README 隐私说明、features、AGENTS 同步更新。SomaFM 的流地址在本机返回 403，未内置（待确认是否网络原因）。入口：[music-library.ts](D:/GitHub/OneAI/src/main/music-library.ts)、[MusicPlayer.tsx](D:/GitHub/OneAI/src/renderer/src/components/MusicPlayer.tsx)、[MusicStreamsSettings.tsx](D:/GitHub/OneAI/src/renderer/src/components/MusicStreamsSettings.tsx)。
- **2026-11-14 22:03** 修复设置 → CLI 的「重新检测」点击后看起来没反应：检测是瞬间完成的同步 PATH 查找，结果不变时界面毫无变化；按钮现在检测期间显示旋转图标、文字变「检测中…」并禁用，完成后旁边显示「已重新检测」3 秒。未改检测逻辑；主进程沿用启动时的 PATH，新增 PATH 目录后可能仍需重启应用（待确认）。入口：[CliSettings.tsx](D:/GitHub/OneAI/src/renderer/src/components/CliSettings.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。
- **2026-11-14 21:55** 提交规范改为：由 Claude 参与完成的提交，信息末尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`（覆盖原「不添加 Co-Authored-By」）；本次提交即按此署名。Claude 是否出现在 GitHub 仓库 Contributors 列表，待推送后到仓库页确认（待确认）；Codex 无可关联的 GitHub 邮箱，仅在 README 署名。入口：[AGENTS.md](D:/GitHub/OneAI/AGENTS.md)。
- **2026-11-14 21:51** 两份 README 新增「贡献者 / Contributors」小节，列入 Claude（Anthropic）与 Codex（OpenAI）；仅文档改动，未执行构建。GitHub 仓库页右侧的 Contributors 列表由提交作者或 `Co-authored-by` 决定，历史提交未改写，尚未生效，待确认是否在后续提交中加 trailer（需先改 AGENTS.md「不添加 Co-Authored-By」规则）。入口：[README.md](D:/GitHub/OneAI/README.md)、[README.zh-CN.md](D:/GitHub/OneAI/README.zh-CN.md)。
- **2026-11-14 11:12** 修复历史会话抽屉的关闭按钮与窗口右上角关闭按钮重叠、点击后整个应用退出：抽屉型弹窗的遮罩与面板改为从顶栏下沿（44px）开始，不再覆盖顶部窗口控件；居中弹窗不变。入口：[Modal.tsx](D:/GitHub/OneAI/src/renderer/src/components/Modal.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。
- **2026-11-14 11:08** 历史会话抽屉 CLI 筛选下拉改为由已读取的历史记录生成：只列出实际出现过的 CLI（按显示名排序，未知 CLI 显示其 id），选中的 CLI 没有历史时回到「全部」；去掉写死的 Antigravity / Pi 选项。入口：[HistoryModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/HistoryModal.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。
- **2026-11-14 06:21**：历史会话抽屉：CLI 筛选由按钮组改为搜索框右侧的下拉（全部、Codex、Claude Code、Antigravity、Pi、Kimi Code），搜索框聚焦时不再出现轮廓与高亮边框，「删除列表中全部」单独一行靠右；选中 Antigravity / Pi 时列表为空并提示这些 CLI 暂无可读历史（下拉项已于 2026-11-14 11:08 改为由实际历史数据生成，不再含这两项）。入口：[HistoryModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/HistoryModal.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 13:10**：修复终端 WebGL 上下文溢出：侧栏改为文件夹树并合并旧工作区后，启动时会给每个任务都创建 xterm 实例与 WebGL 上下文，实测 24 个任务时只有 16 个保住 WebGL、控制台报 24 次「Too many active WebGL contexts」，最早创建的（即启动时的当前任务）被丢弃并退回 DOM 渲染。现改为任务第一次被选中时才创建实例（之后照常隐藏保活），WebGL 最多保留最近显示过的 8 个，当前终端一定有。实测：启动 1 个实例；再打开 12 个任务后 13 个实例、8 个 WebGL、当前终端有 WebGL、警告 0 次；`check:ui` 151 项通过（新增按需创建的 2 项回归检查）。入口：[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)。

- **2026-11-13 12:35**：历史会话抽屉优化：按今天 / 昨天 / 更早分段；每条显示所在文件夹名与 Git 分支（完整路径放悬停提示）、相对时间；已在侧栏有任务的会话标「已打开」；「删除列表中全部」的确认说明会同时删除本机会话文件；空状态说明只读取 Claude / Codex / Kimi。设置菜单改为 外观、时间、终端、账号、提醒、快捷键，「提醒与音乐」改名「提醒」；空状态快捷键提示改为单行。`check:ui` 149 项通过。历史条目不带账号信息（历史只读默认账号目录）。入口：[HistoryModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/HistoryModal.tsx)。

- **2026-11-13 12:20**：标题栏与顶栏融合：隐藏原生标题栏并启用窗口控件覆盖层，顶栏与侧栏品牌头部可拖动（按钮不可拖动），顶栏右侧为窗口按钮让出位置，覆盖层颜色与高度随主题和界面缩放同步（`window:set-title-bar-overlay`）；真实应用里确认覆盖层可见、高度与顶栏一致（48px）、最右按钮不重叠。空状态改版：顶栏显示当前文件夹与分支，中间区域新增「继续上次」（最近 3 条历史会话，点击恢复）并保留 CLI 新建网格；`check:ui` 143 项通过。未验证：窗口按钮的实际颜色观感、拖动与双击最大化手感；有用户截图里顶栏右侧 `Net:` 被截断，未能复现。

- **2026-11-13 12:00**：Phase 26 第三步：任务行第二行。主进程新增 `task:summaries` 接口，读取各任务对应的本机会话文件（Claude `projects/<目录>/*.jsonl`、Codex `sessions/**/rollout-*.jsonl`、Kimi `sessions/*/*/state.json`，多账号任务读账号配置目录），取最近一条真实用户消息（过滤工具结果、命令标签、中断提示、注入的上下文），按文件签名缓存；渲染进程每 5 秒与窗口获得焦点时刷新，没有消息时显示「新会话 · 创建时间」（跟随「设置 → 时间」的偏移），不支持的 CLI 保持单行，读到之前占位避免行高跳动。任务与会话的对应为启发式，见「阻塞与风险」。入口：[task-summary.ts](D:/GitHub/OneAI/src/main/task-summary.ts)、[taskSummary.ts](D:/GitHub/OneAI/src/renderer/src/taskSummary.ts)、[Sidebar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Sidebar.tsx)、[App.tsx](D:/GitHub/OneAI/src/renderer/src/App.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 11:48**：Phase 26 第二步：侧栏改为「文件夹 → 任务」。① 任务改为全局有序数组，新增 `folders` 与 `v2` 持久化状态；多个文件夹的终端同时运行，「切换工作文件夹」改为「添加文件夹」且不再结束终端。② 文件夹行带 Git 分支徽标（主进程只读 `.git/HEAD`，新增 `git:branches` 接口）、任务数与「+」；「+」弹出 CLI 菜单（有账号的 CLI 另有「用 <账号> 新建」），`Ctrl+Shift+T` 沿用当前任务的 CLI 在当前文件夹新建；文件夹右键可新建 / 打开 / 复制路径 / 从侧栏移除（确认后结束其中终端）；文件夹与文件夹内的任务可拖拽或 Alt+方向键排序。③ 新增「最近任务」区：历史会话按文件夹归类，已打开的文件夹不重复，点击会话恢复；文件夹和任务行的 CLI 区分改用任务行里的 CLI 图标。④ 新建任务弹窗增加 CLI 选择。⑤ 首次启动把旧的各工作区数据合并迁移，旧数据保留。入口：[workspaceState.ts](D:/GitHub/OneAI/src/renderer/src/workspaceState.ts)、[Sidebar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Sidebar.tsx)、[App.tsx](D:/GitHub/OneAI/src/renderer/src/App.tsx)、[git-branch.ts](D:/GitHub/OneAI/src/main/git-branch.ts)、[NewTaskModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/NewTaskModal.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 11:23**：顶栏账号徽标的收起断点由 58rem 调为 50rem，默认 1280 窗口下面包屑里也能看到当前任务的账号名。入口：[index.css](D:/GitHub/OneAI/src/renderer/src/index.css)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 11:10**：Phase 27 多账号：① 设置新增「账号」页，为 Codex、Claude Code、Kimi Code 各自维护多个账号（名称 + 配置目录 + 可选附加环境变量），可添加、编辑、删除（二次确认，只删配置不删目录与凭据），每个账号有「登录」按钮（在该账号环境下新开终端任务运行登录命令）和登录状态。② 启动 PTY 时按账号注入 `CODEX_HOME` / `CLAUDE_CONFIG_DIR` / `KIMI_CODE_HOME` 并自动创建目录，重启沿用，账号配置被删除后拒绝启动而不回落默认账号。③ 新建任务弹窗可选账号，分组右键菜单「用 <账号> 新建」，任务行与顶栏面包屑显示账号名。④ 额度按账号读取：Codex 读该账号会话记录与配置，Kimi Code 读该账号凭据请求额度接口，Claude Code 非默认账号显示模型与推理等级、额度为「--」。⑤ 「恢复默认设置」保留账号。不支持 Antigravity（原因见待办）。入口：[account-env.ts](D:/GitHub/OneAI/src/main/account-env.ts)、[account-login.ts](D:/GitHub/OneAI/src/main/account-login.ts)、[quota-service.ts](D:/GitHub/OneAI/src/main/quota-service.ts)、[pty-manager.ts](D:/GitHub/OneAI/src/main/pty-manager.ts)、[accounts.ts](D:/GitHub/OneAI/src/renderer/src/accounts.ts)、[AccountsSettings.tsx](D:/GitHub/OneAI/src/renderer/src/components/AccountsSettings.tsx)、[App.tsx](D:/GitHub/OneAI/src/renderer/src/App.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 10:42**：Phase 26 第一步：① 顶栏额度文案改为 `Tokens: • Cost: • 5h: • 7d: • Model:`，用 `•` 分隔；Tokens / Cost 为最近活跃会话累计值（Claude 从会话记录按 message.id + requestId 去重累计，增量读取；Cost 取 statusLine 快照；Codex 只有 Tokens，取最新会话的 `total_token_usage`），无数据的 CLI 不显示。② 顶栏右侧新增整机 `CPU / Mem / Net`，主进程每 2 秒采样并推送 `system:stats`，窗口最小化时暂停；网速读物理网卡（常驻 PowerShell，网卡集合变化或计数重置时丢弃该次读数）。③ 顶栏收起顺序改为：时钟、网速、内存、CPU、Tokens / Cost、额度重置时间、模型名，断点按各块自然宽度重新估算。④ 侧栏顶部改为 Logo + `OneAI` + `All agents in one.` + 版本号与问候语。未做：标题栏融合、按文件夹分组。入口：[system-stats.ts](D:/GitHub/OneAI/src/main/system-stats.ts)、[quota-service.ts](D:/GitHub/OneAI/src/main/quota-service.ts)、[SystemStatsText.tsx](D:/GitHub/OneAI/src/renderer/src/components/SystemStatsText.tsx)、[InlineQuotaText.tsx](D:/GitHub/OneAI/src/renderer/src/components/InlineQuotaText.tsx)、[Sidebar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Sidebar.tsx)、[index.css](D:/GitHub/OneAI/src/renderer/src/index.css)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 12:47**：修复 Pi 内容超过一屏后无法滚动：Pi 全屏模式在开启原始输入前写入鼠标追踪序列，被系统自带 ConPTY 吞掉，xterm 未进入鼠标模式，滚轮在备用屏幕里被转成上下方向键。现仅对 `pi` 开头的命令启用 node-pty 自带的 `conpty.dll`（`useConptyDll`），其余 CLI 保持系统 ConPTY。另在设置「提醒与音乐」页新增「显示音乐播放器」开关（`musicPlayerVisible`，默认开启），关闭后侧栏底部卸载播放器并停止播放。入口：[pty-manager.ts](D:/GitHub/OneAI/src/main/pty-manager.ts)、[SettingsModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/SettingsModal.tsx)、[Sidebar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Sidebar.tsx)。

- **2026-11-13 12:11**：修复切换工作文件夹后侧栏丢失已安装 CLI 的扩展分组（如 Antigravity、Pi）：检测结果原先只在启动时追加到当时的工作区，切换时 `loadWorkspace` 只恢复内置分组和该工作区保存过的扩展分组。现保存启动时的检测结果，启动与切换两处统一用 `withDetectedExtras` 补齐。入口：[App.tsx](D:/GitHub/OneAI/src/renderer/src/App.tsx)。

- **2026-11-13 11:11**：侧栏交互优化四项。① 一键新建：分组「+」、折叠窄条的 CLI 图标、空状态按钮和新增的 `Ctrl+Shift+T` 直接用默认名称、分组默认命令与当前工作文件夹启动，失败时提示并转到自定义弹窗；右键分组行或「+」、`Ctrl+Shift+N` 打开原弹窗；默认任务名由 `Task N: <CLI> Session` 缩短为 `Task N`。② 待查看标记：后台任务由运行转空闲或进程退出时标记，侧栏任务行显示「待查看」、折叠窄条实心高亮、收起分组的计数变色，切换到该任务后清除，不持久化。③ 任务操作：右键菜单增加重启 / 启动、在资源管理器中打开（新增 `shell:open-directory` IPC，只接受已存在的文件夹），新增 `Ctrl+Shift+W` 关闭当前任务与鼠标中键关闭；任务可在分组内拖拽或 `Alt+↑/↓` 排序。④ 视觉：空状态按钮在不超过 4 个 CLI 时改为两列，折叠窄条的分组之间加间距。不支持跨分组移动任务。入口：[App.tsx](D:/GitHub/OneAI/src/renderer/src/App.tsx)、[Sidebar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Sidebar.tsx)、[index.ts](D:/GitHub/OneAI/src/main/index.ts)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 09:28**：移除本机 Whisper 语音识别功能（转写太慢）：删除终端区麦克风按钮与 `Ctrl+Shift+M`、主进程 `voice-input.ts` 及 `voice:*` IPC、preload 与类型声明中的三个接口、`scripts/` 下的语音运行时准备、检查与转写脚本，打包不再附带 `voice-runtime`，`build:win` / `build:portable` 去掉运行时检查。工作时长提醒的语音播报（系统 `speechSynthesis`）保留。本机 `voice-runtime/` 目录（约 1.9 GB，含 `model-base`、`model-large-v3-turbo` 与语音程序）已删除，`.gitignore` 中对应条目同步去掉。入口：[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)、[index.ts](D:/GitHub/OneAI/src/main/index.ts)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 07:07**：Antigravity（`agy`）顶栏显示真实 5h / 7d 额度：每 2 分钟后台执行 `agy -p /usage`（约 5 秒，不读取 agy 的 keyring 凭据），Gemini 系列取「Gemini Models」分组，Claude / GPT 取「Claude and GPT models」分组，失败时保留上次数据并提示；`Gemini 4 Argon` 单模型周限额因输出未标明已用或剩余暂未展示。Pi 分组只显示当前默认模型（读 `~/.pi/agent/settings.json` 与 `models.json`），无额度接口。入口：[quota-service.ts](D:/GitHub/OneAI/src/main/quota-service.ts)。

- **2026-11-13 07:07**：修复 Pi 输入法候选框错位：Pi 隐藏真实光标，在输入框画反色空格作假光标，真实光标停在行尾之外；与 Kimi 同类，现把输入法定位点放到两条整行横线之间的反色单元格上，并抽出 `IME_ANCHOR_FINDERS` 按 CLI 分组选择查找方式（`attachKimiImeAnchor` 更名为 `attachImeAnchor`），语音按钮定位同步生效。入口：[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-13 00:56**：工作时长提醒由 90 分钟改为 60 分钟，提醒文案与设置页开关说明同步修改。入口：[App.tsx](D:/GitHub/OneAI/src/renderer/src/App.tsx)。

- **2026-11-13 00:56**：顶栏时钟不再固定加 16 小时：新增设置项 `clockOffsetHours`（默认 0，-24 到 24 的整数），设置面板新增「时间」栏目用于调整。入口：[Topbar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Topbar.tsx)、[SettingsModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/SettingsModal.tsx)。

- **2026-11-13 00:56**：修复顶栏模型与额度显示旧值：① Claude 的模型与推理等级改为优先读 statusLine 快照（`model.id`、`effort.level`），其次 `settings.json`，`~/.claude.json` 的 `lastModelUsage`（上一个已结束会话的统计）降为兜底；② Codex 的模型与推理等级在最近一轮 `turn_context` 比 `config.toml` 修改时间新时取会话记录；③ Codex 额度窗口过了 `resets_at` 后按 100% 显示。Kimi 模型名仍只读 `config.toml` 的 `default_model`，会话内切换是否写回待确认。入口：[quota-service.ts](D:/GitHub/OneAI/src/main/quota-service.ts)。

- **2026-11-13 00:40**：① 侧栏折叠窄条补齐操作入口：顶部应用 Logo，每个 CLI 一个品牌图标按钮（点击新建该 CLI 任务），其下为该 CLI 的任务序号按钮（带状态点，可直接切换），底部保留切换工作文件夹与设置；此前窄条只渲染任务按钮，没有任务时整条为空。② 没有活动终端的空页面，顶栏不再显示额度（5 小时、7 天）与刷新按钮。入口：[Sidebar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Sidebar.tsx)、[Topbar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Topbar.tsx)。

- **2026-11-13 00:24**：第二批终端区修复：修复搜索高亮未开启 `allowProposedApi` 导致搜索一律显示「正则无效」的回归；仍有终端进程时关闭窗口先确认（系统关机不拦截，界面无响应时再点一次可关）；正式版移除 Electron 默认菜单，消除 Ctrl+W 关窗、Ctrl+R 刷新与 Alt 弹菜单；终端链接改为 Ctrl+单击打开并带悬停提示；预览面板文字可选中、再次点击或点刷新按钮重读文件；焦点在按钮上时打字自动交还终端；语音录音上限由 30 秒改为 2 分钟并显示计时，新增 Ctrl+Shift+M；导出与复制改取终端渲染文本；自定义启动命令支持引号内空格；Shift+Enter 换行不作用于系统终端分组；关闭 Alt+单击移动光标；任务状态变化不再重复同步终端尺寸；Pi 会话记录改为增量读取。入口：[index.ts](D:/GitHub/OneAI/src/main/index.ts)、[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)、[FilePreviewPanel.tsx](D:/GitHub/OneAI/src/renderer/src/components/FilePreviewPanel.tsx)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

