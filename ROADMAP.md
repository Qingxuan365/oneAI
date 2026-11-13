# OneAI 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 25 - 界面布局重整与操作效率
- **状态**：语音识别功能已移除；一键新建、后台任务「待查看」标记、任务右键菜单与拖拽排序已完成并通过自动检查；桌面实际操作和中文输入法仍待手工验收

## 2. 进度看板

### 已完成
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
- [ ] 在 Windows 桌面端实际运行满 60 分钟，确认中文语音开关、提醒弹框与关闭后重新计时。
- [ ] 手工验收主题三档切换、系统外观联动、终端配色及重启恢复，以及真实 CLI 长模型名称和额度消息下的顶栏体验；自动检查使用组件夹具，未启动真实 PTY。
- [ ] 手工验收 CLI 分组拖拽、键盘排序与重启后的顺序恢复。
- [ ] 在 Windows 桌面端分别用中文输入法验收 Codex、Kimi Code、Claude Code、OpenCode、Grok Build 和普通 Shell 的输入、候选字显示、回车提交及窗口横向稳定性；样式边界已恢复，运行时结果待确认。
- [ ] 手工验收 Phase 25 界面：全局快捷键在各 CLI 运行时的实际表现（`Ctrl+Tab`、`Ctrl+1…9`、`Ctrl+Shift+N/B/H`、`Ctrl+,`）、任务重命名与重启后保留、侧栏音乐播放器的真实播放与进度拖动、各主题下的弹窗观感，以及 1280 默认窗口和最大化时的顶栏收起顺序。
- [ ] 桌面验收文件预览面板：点击 Claude / Codex 输出中的文件路径、拖拽面板宽度后终端字符矩阵重排、工作目录外路径不出现链接；后续可选增强为语法高亮与 Markdown 渲染。
- [ ] 桌面验收侧栏交互：一键新建在各 CLI 下的实际启动、真实 CLI 长时间思考（超过 10 秒无输出）时「待查看」是否误报、鼠标拖拽任务排序的手感、中键关闭、右键「在资源管理器中打开」，以及 `Ctrl+Shift+T` / `Ctrl+Shift+W` 在各 CLI 运行时是否被正确拦截。
- [ ] 后续多窗口分屏支持（Split Terminal View）。
- [ ] 桌面验收 Pi 会话：滚轮滚动全屏视窗、拖拽选中复制、启动速度（自带 OpenConsole 首次启动可能较慢）与中文输入法；以及设置页关闭 / 开启音乐播放器后侧栏即时变化。
- [ ] 手工验收会话全关后重建、跨会话快捷键、关闭确认、目录错误提示、日志复制保存与应用重启恢复流程。

## 3. 阻塞与风险
- 默认 1280 宽窗口、舒适缩放且侧栏展开时，顶栏放不下全部信息，时钟与额度重置时间会被收起（悬停额度可见）；折叠侧栏、加宽窗口或改用标准缩放后显示完整。
- 本轮交互修复已通过生产构建；桌面端实际点击与多终端并发行为尚未手工验收。
- 会话日志缓冲保留最近约 2 MiB 输出；更早内容不会出现在复制和导出的日志中。

## 4. 最近验证

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

- **2026-11-12 16:13**：空闲状态改动后 `tsc --noEmit` 通过，`npm run check:ui` 无失败项；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576281511 字节。真实 CLI 下 10 秒阈值是否合适（如思考期间长时间无输出）未验证，待桌面验收。

- **2026-11-12 16:09**：上述四处修复后 `tsc --noEmit` 通过，`npm run check:ui` 无失败项；`npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576280850 字节。多行粘贴、新快捷键和键盘切换已停止任务的实际表现未在真实 PTY 中验证，待桌面验收。

- **2026-11-12 15:54**：侧栏加宽与顶栏适配通过 52 项 `npm run check:ui`；隐藏 Electron 夹具验证四种界面缩放与 900、1100、1280、1440、1920 像素窗口的 20 种组合，侧栏宽度分别为 290、320、350、400 CSS 像素，额度均为 100% 时顶栏工具、额度及历史按钮未重叠。夹具未连接真实 PTY，桌面实际效果待手工验收。

- **2026-11-12 04:59**：空状态引导显示条件修复后 `npm run build:win` 通过，`release/OneAI-Setup-1.0.0.exe` 1576280505 字节（北京时间 2026-11-12 04:58:31）。桌面端「任务只在隐藏分组时显示引导」的实际效果待手工验收。

- **2026-11-12 04:29**：合成中文技术语音（Huihui，约 12 秒）文件转写：`base` 输出「幫」「够检 Relectron」「爆错」，`large-v3-turbo` 全句正确，模型加载 3.3 秒、推理 8.2 秒，`beam_size` 1 与 5 耗时相近；麦克风模式录 5 秒后 0.4 秒返回，确认预加载生效。剪贴板探针在真实剪贴板上分别验证文件（含空格路径）、位图、文本三种来源均返回预期结果。`npx tsc --noEmit` 通过，`npm run check:ui` 52 项通过，新增 `Ctrl+V` 不重复写入检查，去掉修复后该项失败。`npm run build:win` 改为默认生成安装版：`release/OneAI-Setup-1.0.0.exe` 1576280607 字节（北京时间 2026-11-12 04:41:30），`7z t` 校验安装包与内层 `app-64.7z` 均通过，确认包内含 `model-large-v3-turbo`、语音程序及新的主进程代码。打包日志中混入一条 makensis 0xC0000142 报错，判断来自先前中止的打包进程，本次产物不受影响；安装包未实际安装运行。真实人声与桌面端粘贴待手工验收。

- **2026-11-12 04:09**：透明图标：像素检查四角与外围 alpha 为 0、中心 alpha 为 255，分别叠在洋红和深蓝底色上目视核对圆角边缘无白边。`npm run build:win` 通过，`release/OneAI-Portable-1.0.0.exe` 267122102 字节（北京时间 2026-11-12 04:07:53）；安装版 `release/installer/OneAI.exe` 283894404 字节（北京时间 2026-11-12 04:08:55）。安装版未实际安装运行；桌面与任务栏中的图标显示待确认（Windows 可能缓存旧图标）。首次在 `release/` 下直接构建安装版时 `win-unpacked` 目录被占用（EBUSY），改用 `release/installer/` 输出。

- **2026-11-12 04:01**：移除 Antigravity / Gemini 检测并调整分组默认顺序后，`tsc --noEmit` 通过，`npm run check:ui` 无失败项；`npm run build:win` 通过，`release/OneAI-Portable-1.0.0.exe` 266888590 字节（北京时间 2026-11-12 04:01:17）。侧栏与启动页实际顺序、旧工作区顺序迁移未在运行时验证。

## 5. 最近完成

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

- **2026-11-13 00:07**：终端区交互修复：Shift+Enter 发送 ESC+CR 换行；没有输入框定位的 CLI，语音图标固定右下角，有定位的 CLI 图标放在终端右侧留白里并去掉背景；Pi 语音图标固定在输入框首行；链接识别按单元格列号定位并合并折行，中文行与长网址可正确点击；搜索增加高亮、匹配计数、「无结果」「正则无效」，关闭搜索时清选区；`文件:行号` 在预览面板定位并高亮该行；语音报错随任务切换清除、点击麦克风不抢焦点、空引导页不显示麦克风；清屏不再在终端写提示行；删除永不触发的缓冲补拉逻辑。入口：[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)、[TerminalSearchBar.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalSearchBar.tsx)、[FilePreviewPanel.tsx](D:/GitHub/OneAI/src/renderer/src/components/FilePreviewPanel.tsx)。

- **2026-11-13 00:07**：修复 Pi 右上角模型不随 `/model` 更新：Pi 切换模型只写会话记录，不改 `settings.json`；现优先读最近会话里最后一条 `model_change` / `thinking_level_change`，并监听会话目录即时刷新，多个 Pi 任务并存时取最近活跃的会话。入口：[quota-service.ts](D:/GitHub/OneAI/src/main/quota-service.ts)。

- **2026-11-12 22:40**：Antigravity（`agy`）分组顶栏显示当前模型与推理等级（读取 `~/.gemini/antigravity-cli/settings.json`），5h / 7d 显示「--」并提示「无额度接口」。其额度只能通过 `agy` 存在系统 keyring 中的 OAuth token 调用 Google 内部接口 `v1internal:fetchAvailableModels` 获取，响应结构与是否含 5h / 7d 窗口均未核实，暂不读取凭据；如需实现须先确认授权与接口形态。入口：[quota-service.ts](D:/GitHub/OneAI/src/main/quota-service.ts)。

- **2026-11-12 17:38**：修复 Kimi 输入法候选框在输入框下闪现后跳到右侧或右下角：17:22 的做法是改写 textarea 的内联 `left/top`，而 xterm 在重绘、光标移动和每次组合更新后的延时回调里都会把它写回真实光标，输入法在回写之后读到的是真实光标位置。现在定位点写入 `.xterm` 元素的 `--ime-left/--ime-top` 变量，由 `index.css` 的 `.xterm.ime-anchored` 规则以 `!important` 应用到 textarea 和组合视图，xterm 的内联回写不再生效，逐帧修正循环已删除；找不到 Kimi 输入框时移除该类，回到 xterm 默认行为。`check:ui` 新增真实光标停在行尾和状态栏两种情况的回归检查，夹具页面补上 UTF-8 声明。入口：[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)、[index.css](D:/GitHub/OneAI/src/renderer/src/index.css)、[check-ui.mjs](D:/GitHub/OneAI/scripts/check-ui.mjs)。

- **2026-11-12 17:16**：语音按钮由终端右下角的悬浮圆钮改为贴在 CLI 输入行最右侧：跟随光标所在行（Kimi 按输入框定位），边长取终端单行高度，录音与识别提示显示在按钮上方。入口：[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)。

- **2026-11-12 17:16**：工作时长提醒的间隔改为可设置：新增设置项 `workReminderHours`（默认 1，1 到 12 的整数），在「设置 → 提醒与音乐」中调整；从应用启动起算，改小到已经过去的时长时不补弹。入口：[App.tsx](D:/GitHub/OneAI/src/renderer/src/App.tsx)、[SettingsModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/SettingsModal.tsx)。

- **2026-11-12 17:16**：当前任务为系统终端时，顶栏不再显示 5h / 7d 额度，只保留 Shell 名称与状态。入口：[InlineQuotaText.tsx](D:/GitHub/OneAI/src/renderer/src/components/InlineQuotaText.tsx)。

- **2026-11-12 17:16**：修复终端搜索框聚焦后输入区多出一圈矩形描边：全局 `:focus-visible` 描边优先级高于 `focus:outline-none`，输入框改用 `!outline-none`，聚焦态由外层边框变色表示。入口：[TerminalSearchBar.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalSearchBar.tsx)。

- **2026-11-12 16:28**：历史会话由居中弹窗改为右侧抽屉：[Modal.tsx](D:/GitHub/OneAI/src/renderer/src/components/Modal.tsx) 新增 `variant="drawer"`（靠右、与窗口等高、从右侧滑入，遮罩点击与 Esc 关闭不变），[HistoryModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/HistoryModal.tsx) 采用该形态，宽度由 `max-w-2xl` 收窄为 `max-w-xl`。

- **2026-11-12 16:24**：处理 CLI 面板低优先级问题：① 新建任务默认名取已有「Task N」最大编号加一，不再重复；② 任务行右键菜单（重命名、复制工作目录、关闭任务）；③ 切换任务时清除旧终端搜索高亮，并在新终端按当前关键字重新搜索；④ 语音按钮缩小至 36px 并默认半透明，悬停或聚焦时恢复；⑤ 侧栏折叠后保留 48px 窄条，每个任务一个品牌图标带状态点，可直接切换。入口：[Sidebar.tsx](D:/GitHub/OneAI/src/renderer/src/components/Sidebar.tsx)、[NewTaskModal.tsx](D:/GitHub/OneAI/src/renderer/src/components/NewTaskModal.tsx)、[TerminalViewport.tsx](D:/GitHub/OneAI/src/renderer/src/components/TerminalViewport.tsx)。麦克风按钮仍悬浮在终端右下角，只是减弱了遮挡。
