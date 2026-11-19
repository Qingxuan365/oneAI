# OneAI 项目级工程规范

## 1. 项目定位与架构约定

OneAI 是专为本地多 AI 编程 CLI（如 Codex、Kimi Code、OpenCode）打造的桌面集成工作台。
核心技术选型：
- 运行时：Electron + Node.js
- 底层进程：`node-pty`（调用 Windows ConPTY API）
- 前端渲染：React 18 + TypeScript + Tailwind CSS + Lucide React
- 终端模拟：`@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl`
- 构建工具：Vite 5 + `vite-plugin-electron`，打包使用 electron-builder

## 2. 目录结构规范

```text
d:/GitHub/OneAI/
├── .gitignore
├── AGENTS.md                  # 项目规范
├── ROADMAP.md                 # 进度与状态源
├── README.md                  # 项目说明与启动指引（英文，GitHub 默认展示）
├── README.zh-CN.md            # README.md 的简体中文版；两份内容须同步更新
├── docs/                      # features.md / features.zh-CN.md：每项功能的详细行为（README 只放概览），两份须同步更新；另有 user-research-self-use.md
├── LICENSE                    # MIT 许可证
├── package.json
├── tsconfig.json
├── vite.config.ts             # 渲染进程、主进程构建、preload 与主题白名单同步校验、生产 CSP 注入
├── electron-builder.json      # Windows 打包配置：默认安装版（NSIS），便携版通过 build:portable 生成，产物输出到 release/
├── tailwind.config.js
├── postcss.config.js
├── index.html                 # 渲染进程 HTML 入口
├── public/                    # 静态资源（favicon 等）
├── resources/                 # 应用图标等打包资源
├── scripts/                   # 界面回归检查 check-ui.mjs；主进程与共享逻辑测试 check-main.mjs（npm run check:main）；多语言检查 check-i18n.mjs（npm run check:i18n）
├── src/
│   ├── main/                  # Electron 主进程代码
│   │   ├── index.ts           # 窗口创建、应用生命周期与 IPC 注册
│   │   ├── diagnostics.ts     # 卡顿诊断日志：主进程事件循环阻塞、慢 IPC、渲染进程无响应 / 崩溃，写入 userData/logs/oneai-diag.log
│   │   ├── fs-utils.ts        # 路径大小写归一化、目录包含判断、文件切片与 .zst 流式解压、LRU 容量上限 Map
│   │   ├── pty-manager.ts     # node-pty 进程池管理器；按任务账号注入 CODEX_HOME / CLAUDE_CONFIG_DIR / KIMI_CODE_HOME
│   │   ├── quota-service.ts   # 大模型配额、模型与推理等级、会话累计 Tokens / Cost 读取及配置热监听
│   │   ├── system-stats.ts    # 整机 CPU / 内存 / 网速采样（网速读物理网卡，常驻 PowerShell），每 2 秒推送给顶栏
│   │   ├── task-summary.ts    # 读取任务对应会话（Claude / Codex / Kimi 的本机会话文件）里最近一条用户消息，供侧栏任务行第二行
│   │   ├── model-format.ts    # Claude 模型 id 转显示名（无副作用，额度与用量共用）
│   │   ├── usage-stats.ts     # 本周用量：流式解析 Claude Code / Codex（含 archived_sessions 与 .jsonl.zst，用 fzstd 解压）/ Antigravity（优先紧凑版 transcript.jsonl）/ Pi 本机会话记录，按 CLI × 账号 × 模型汇总请求数与 Tokens，给出近 26 周每日请求数（按文件 mtime + 大小缓存解析结果并持久化到 userData）
│   │   ├── git-branch.ts      # 读取文件夹所在 Git 仓库的当前分支（只读 .git/HEAD，不执行 git）
│   │   ├── account-env.ts     # 多账号：各 CLI 的配置目录环境变量、路径校验与目录创建，只创建目录不读凭据
│   │   ├── account-login.ts   # 多账号：调用 CLI 自带状态命令判断登录状态（Kimi Code 只检查凭据文件是否存在）
│   │   ├── cli-detect.ts      # 按 PATH 检测已知 CLI（清单取自 known-clis.json）与用户自定义 CLI 是否已安装，决定「+」菜单里可新建的 CLI
│   │   ├── known-clis.json    # 已知 AI 编程 CLI 清单（id / 名称 / 命令），新增支持的 CLI 只改这里
│   │   ├── i18n.ts            # 主进程文案翻译（t()），语言由渲染进程通过 IPC 同步
│   │   ├── file-preview.ts    # 文件预览：异步路径解析与只读读取，限制在任务 cwd 内（及粘贴/拖入图片白名单）
│   │   ├── music-library.ts   # 音乐：扫描本地音乐目录、经 oneai-music:// 流式协议（及兼容读取）提供本地音频，并把在线音乐的 .m3u / .pls 歌单展开成曲目（只接受 http(s)）
│   │   ├── workspace-store.ts # 工作区状态落盘：启动同步读取，运行期异步串行原子写入，退出前兜底刷盘
│   │   ├── window-state.ts    # 窗口状态落盘：尺寸、位置（含多屏越界保护）、最大化状态与上次主题底色 / 标题栏覆盖层色值
│   │   └── session-history.ts # 读取 Claude / Codex（含 archived_sessions 与 .jsonl.zst）/ Kimi 本机及多账号目录历史会话与恢复命令（按文件签名缓存）
│   ├── preload/               # 预加载脚本（构建时由 vite.config.ts 自动校验两份接口键集合一致）
│   │   ├── index.cjs          # 运行时实际加载的 preload，由 vite.config.ts 复制到 dist-electron/preload/
│   │   └── index.ts           # 同一组接口的 TS 版本，不参与构建；修改接口时须与 index.cjs 同步
│   ├── shared/                # 主进程与渲染进程共用
│   │   ├── types.ts           # 跨进程共享数据结构与内置主题 ID 清单（THEME_IDS）单一事实源
│   │   ├── paths.ts           # folderKey、终端路径安全加引号与终端输出路径候选提取
│   │   ├── i18n.ts            # 语言类型、系统语言判断与 translate()
│   │   └── en.ts              # 英文对照表：键是代码里的中文原文，值是英文
│   └── renderer/              # React 前端渲染进程
│       └── src/
│           ├── main.tsx
│           ├── dropGuard.ts              # 拦截拖到终端以外区域的文件，避免窗口被导航到该文件
│           ├── App.tsx                   # 全局状态、工作区持久化与会话调度
│           ├── index.css                 # 语义颜色 token、各主题配色变量、通用控件类（icon-btn / btn-* / input / option）与顶栏容器查询断点
│           ├── themes.ts                 # 主题明暗基调与设置页主题选项（浅 / 深、护眼、编辑器三组）；新增主题须同步 shared/types.ts、index.css、index.html 与 TerminalViewport
│           ├── taskStatus.ts             # 任务存活态（starting / running / idle）判断
│           ├── taskSummary.ts            # 任务行第二行支持的 CLI 与「新会话 · 时间」的格式化
│           ├── clis.ts                   # 内置 CLI 定义（CliDef）与默认文件夹（本机用户主目录，由主进程提供）；全新安装不再预置示例任务
│           ├── i18n.ts                   # 渲染进程多语言：t() / T() / setLanguage，文案以中文原文为键
│           ├── customClis.ts             # 自定义 CLI：id 生成、转 CliDef、读取过滤与保存前校验
│           ├── musicStreams.ts           # 在线音乐：id 生成、读取过滤与添加前校验
│           ├── workspaceState.ts         # 文件夹树的状态：folderKey、排序、旧数据迁移、状态校验、最近任务归类与读写
│           ├── accounts.ts               # 多账号：支持的 CLI 与登录命令、环境变量文本解析、账号校验
│           ├── previewHighlight.ts       # 文件预览语法高亮：按扩展名或文件名调用 highlight.js 分词并保留跨行作用域，跳过压缩单行与 > 1 MB 文件
│           ├── components/
│           │   ├── Sidebar.tsx           # 左侧品牌头部（Logo、标语、版本号）、文件夹树（Git 分支、任务）与最近任务
│           │   ├── Topbar.tsx            # 顶部导航栏（嵌入单行额度、系统资源与全局操作）
│           │   ├── InlineQuotaText.tsx   # 顶栏单行纯文字实时额度（Tokens / Cost、5h / 7d、模型）
│           │   ├── SystemStatsText.tsx   # 顶栏右侧单行纯文字 CPU / 内存 / 网速，订阅 `system:stats`
│           │   ├── TerminalViewport.tsx  # xterm.js 多实例保活容器；任务第一次被选中时才创建实例，WebGL 只保留最近显示的 8 个
│           │   ├── TerminalSearchBar.tsx # 终端关键字搜索栏
│           │   ├── NewTaskModal.tsx      # 新建 Task 弹窗（该 CLI 配置了账号时可选账号）
│           │   ├── PreviewMinimap.tsx    # 文件预览右侧的代码缩略图（canvas 绘制，滑块可点击 / 拖动；由设置 previewMinimap 控制）
│           │   ├── FilePreviewPanel.tsx  # 终端右侧只读文件预览面板（Ctrl+单击终端路径打开，宽度可拖拽、持久化并支持双击重置）
│           │   ├── HistoryModal.tsx      # 历史会话抽屉（顶栏右上角入口）：按日期分段，显示文件夹、分支与「已打开」
│           │   ├── UsageModal.tsx        # 本周用量弹窗（顶栏用量按钮 / Ctrl+Shift+U）：按 CLI → 账号 → 模型分组的用量表与近 26 周每日请求数方块图
│           │   ├── SettingsModal.tsx     # 分页设置：外观、时间、终端、账号、CLI、提醒、快捷键列表
│           │   ├── AccountsSettings.tsx  # 设置 → 账号：添加 / 编辑 / 删除账号、登录入口与登录状态
│           │   ├── CliSettings.tsx       # 设置 → CLI：已知 CLI 的检测状态（清单取自主进程）、重新检测、添加 / 编辑 / 删除自定义 CLI
│           │   ├── OnboardingModal.tsx   # 首次启动引导：选择界面语言，再显示检测到的 CLI、默认文件夹与小提示；完成后不再弹出
│           │   ├── Modal.tsx             # 所有弹窗共用的外壳（遮罩、标题栏、Esc 关闭、Tab 焦点陷阱、焦点归还）
│           │   ├── ConfirmDialog.tsx     # 应用内确认与通知弹窗，替代原生 confirm / alert
│           │   ├── MusicPlayer.tsx       # 侧栏底部迷你音乐播放器（本地目录 + 在线音乐），没有任何曲目时不显示
│           │   ├── MusicStreamsSettings.tsx # 设置 → 提醒：添加 / 删除在线音乐（列表最多显示 5 行，超出滚动）
│           │   ├── BrandIcon.tsx         # 各 CLI 品牌徽标
│           │   └── AppLogo.tsx           # 应用 Logo
│           └── types/index.ts            # 前端类型与 window.electronAPI 声明
```

## 3. 核心数据模型约定

```typescript
// CLI 定义：图标与默认命令；任务通过 groupId 关联到它，侧栏不再按 CLI 分组
interface CliDef {
  id: string;             // 如 "codex", "kimi", "opencode"
  name: string;           // 显示名称 "Codex", "Kimi Code"
  icon: string;           // 对应大模型品牌 Logo（"codex" | "kimi" | "opencode" | "claude" 等）
  defaultCommand: string; // 启动命令模版
}

// 侧栏里的工作文件夹；任务按 cwd 归属到文件夹，比较路径一律用 folderKey（忽略大小写与正反斜杠）
interface FolderEntry {
  path: string;           // 首次出现时的原始路径
  isExpanded: boolean;    // 展开/折叠
}

// 具体任务终端会话模型
interface TaskSession {
  id: string;             // 任务唯一标识（对应底层 ptyId）
  groupId: string;        // 所属 CLI 的 id（对应 CliDef.id）
  title: string;          // 任务标题，如 "Task 1: Auth Refactor"
  status: 'starting' | 'running' | 'idle' | 'stopped' | 'error';
  cwd: string;            // 工作目录
  command?: string;       // 任务自定义启动命令
  accountId?: string;     // 使用的账号配置 id，缺省为该 CLI 的默认账号
  createdAt: number;
}

// 多账号配置（AppSettings.accounts，目前支持 codex / claude / kimi）
interface Account {
  id: string;
  cliId: 'codex' | 'claude' | 'kimi';
  name: string;
  configDir: string;      // 独立配置目录（凭据与会话记录都在其中），启动时注入 CODEX_HOME / CLAUDE_CONFIG_DIR / KIMI_CODE_HOME
  env?: string;           // 附加环境变量，每行 KEY=VALUE
}
```

文件夹与任务约定：任务是一个全局有序数组（数组顺序即侧栏顺序，也是 Ctrl+Tab / Ctrl+数字 的顺序），与 `folders`（有序）、`activeTaskId`、`lastFolder`、`extraClis` 一起作为 `v2` 状态持久化；任务只能在所属文件夹内调整顺序、不能跨文件夹；多个文件夹的终端同时运行，切换任务或文件夹不得结束终端；旧的按工作区存储的数据只在首次启动时迁移，之后原样保留、不再更新、不得删除。

自定义 CLI 约定：`AppSettings.customClis`（`{ id: 'custom-xxxx', name, command }`）由用户在「设置 → CLI」维护，运行时转成 `CliDef`（`custom: true`，通用终端图标），启动时整条命令交给 PowerShell 解析（`createSession` 的 `shell` 选项）；检测与内置 CLI 一样按 `PATH` 进行，命令不存在时隐藏；删除时必须关闭并移除其任务；额度、任务摘要、历史会话、用量统计和多账号不对自定义 CLI 提供；「恢复默认设置」不清除自定义 CLI、账号、语言和首次引导状态。

在线音乐约定：`AppSettings.musicStreams`（`{ id, name, url }`）由用户在「设置 → 提醒 → 音乐播放器」添加，支持音频直链、电台流和 `.m3u` / `.pls` 歌单（主进程 `music:resolve-stream` 展开，只接受 http(s)，不支持 `.m3u8`）；不内置任何电台或默认链接，添加前不得发起任何网络请求；在线曲目走独立的 audio 元素（跨域音频接入分析器会被静音），不做频谱；「恢复默认设置」不清除。

多语言约定：`AppSettings.language`（`zh-CN` | `en`）与 `onboardingDone` 决定界面语言和首次引导；首次启动按系统语言预选；全新安装不预置任务与文件夹。

多账号约定：账号只是「配置目录 + 环境变量」，OneAI 不复制、不读取登录凭据；额度、模型等按账号 id 单独缓存；账号配置被删除后其任务拒绝启动，不得回落到默认账号；Antigravity（`agy`）的登录在系统凭据库、无法按目录隔离，不纳入多账号。

## 4. 编码与设计红线

1. **终端进程隔离与保活**：
   - 切换左侧会话时严禁销毁终端 DOM 或中断底层 PTY，必须使用隐藏（`display: none`）保活机制。
   - 视窗切换显示后必须主动触发 `fitAddon.fit()` 重新计算终端字符矩阵。
2. **额度展示原则**：
   - 必须保持顶栏单行横排纯文字（Inline Text），严禁添加悬浮卡片、弹窗或遮挡视窗的浮层。
3. **平台兼容性**：
   - Windows 平台优先调用 Powershell / Cmd / Git Bash / WSL 作为底层 Shell，正确处理 Windows 换行符（CRLF）与 ConPTY 信号。
4. **界面一致性**：
   - 新弹窗统一使用 `Modal.tsx` 外壳，确认与通知使用 `ConfirmDialog.tsx`，不调用原生 `window.confirm` / `window.alert`。
   - 全局快捷键在 `App.tsx` 捕获阶段统一处理，只使用 `Ctrl+Tab`、`Ctrl+数字`、`Ctrl+Shift+字母`、`Ctrl+,` 这类终端程序不用的组合，不占用 `Ctrl+字母`；新增后同步更新设置页的快捷键列表。
   - 顶栏新增内容前先确认各宽度下不重叠，次要信息通过 `index.css` 的 `topbar` 容器查询收起；断点按各块自然宽度估算，改动后须在 `npm run check:ui` 的宽度检查中确认无重叠且任务名不被挤没。
5. **多语言**：
   - 所有会显示给用户的文案必须经过 `t()`（渲染进程见 `i18n.ts`，主进程见 `main/i18n.ts`），代码里写中文原文，并在 `src/shared/en.ts` 登记英文译文；模块级常量先用 `T()` 登记原文、渲染时再 `t()`，需要随语言变化的对象属性用 getter。占位符写成 `{name}`，中英文必须一致。
   - 新增或修改文案后执行 `npm run check:i18n`，必须无缺失译文；不使用「已被某语言占用」的拼接句式，整句翻译。
   - 切换语言必须即时生效，无需重启；日期、星期等不得写死中文格式。
6. **不写死本机信息**：
   - 路径、CLI 清单、语言等一律取自本机：默认文件夹与各 CLI 默认配置目录取用户主目录（主进程 IPC），CLI 是否可用按 `PATH` 检测，界面语言按系统语言预选；示例文案不得出现个人用户名、固定盘符路径或个人称呼。
   - 新增支持的 CLI 只改 `src/main/known-clis.json`，不在界面里再写一份清单。
7. **修改后交付**：
   - 每次修改项目文件并完成必要验证后，自动执行 `npm run build:win`，生成 Windows 安装版 `release/OneAI-Setup-<version>.exe`（不再默认生成便携版，需要时用 `npm run build:portable`）；核对产物的生成时间和大小，失败时明确报告。

## 5. Git 提交规范

- 本项目面向全球用户并已开源，**commit 信息一律使用英文**；此规则覆盖全局规则里「Commit 信息使用中文」的默认约定，其余提交规则（仅在明确要求时才 `add` / `commit` / `push`、提交前更新文档并完成必要验证）不变。
- 前缀沿用 `init:`、`feat:`、`fix:`、`refactor:`、`docs:`、`chore:`；描述写清改了什么、原因和影响，禁止使用 "fix bug"、"update code"、"tweaks" 等泛化表述；由 Claude 参与完成的提交，信息末尾加一行 `Co-Authored-By: Claude <noreply@anthropic.com>`；由 Gemini（含 Antigravity / Gemini CLI）参与完成的提交，信息末尾加一行 `Co-Authored-By: Gemini <200291788+gemini-code-assist@users.noreply.github.com>`，让二者计入 GitHub 贡献者；此规则覆盖全局规则里「不添加 `Co-Authored-By`」，其他署名不添加。
- 示例：`feat: add custom CLI support in Settings so any command can be launched as a task`。
- 本规则生效前的历史提交保持原样，不改写历史。
