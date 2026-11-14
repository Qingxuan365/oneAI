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
├── README.md                  # 项目说明与启动指引
├── package.json
├── tsconfig.json
├── vite.config.ts             # 渲染进程、主进程构建及 preload 复制
├── electron-builder.json      # Windows 打包配置：默认安装版（NSIS），便携版通过 build:portable 生成，产物输出到 release/
├── tailwind.config.js
├── postcss.config.js
├── index.html                 # 渲染进程 HTML 入口
├── public/                    # 静态资源（favicon 等）
├── resources/                 # 应用图标等打包资源
├── scripts/                   # 界面回归检查脚本 check-ui.mjs
├── src/
│   ├── main/                  # Electron 主进程代码
│   │   ├── index.ts           # 窗口创建、应用生命周期与 IPC 注册
│   │   ├── pty-manager.ts     # node-pty 进程池管理器；按任务账号注入 CODEX_HOME / CLAUDE_CONFIG_DIR / KIMI_CODE_HOME
│   │   ├── quota-service.ts   # 大模型配额、模型与推理等级、会话累计 Tokens / Cost 读取及配置热监听
│   │   ├── system-stats.ts    # 整机 CPU / 内存 / 网速采样（网速读物理网卡，常驻 PowerShell），每 2 秒推送给顶栏
│   │   ├── task-summary.ts    # 读取任务对应会话（Claude / Codex / Kimi 的本机会话文件）里最近一条用户消息，供侧栏任务行第二行
│   │   ├── usage-stats.ts     # 本周用量：流式解析 Claude Code / Codex / Antigravity 本机会话记录，按 CLI × 模型汇总请求数与 Tokens，并给出近 26 周每日请求数（按文件 mtime + 大小缓存解析结果）
│   │   ├── git-branch.ts      # 读取文件夹所在 Git 仓库的当前分支（只读 .git/HEAD，不执行 git）
│   │   ├── account-env.ts     # 多账号：各 CLI 的配置目录环境变量、路径校验与目录创建，只创建目录不读凭据
│   │   ├── account-login.ts   # 多账号：调用 CLI 自带状态命令判断登录状态（Kimi Code 只检查凭据文件是否存在）
│   │   ├── cli-detect.ts      # 按 PATH 检测各 CLI 是否已安装，决定「+」菜单里可新建的 CLI
│   │   ├── file-preview.ts    # 文件预览：路径解析与只读读取，限制在任务 cwd 内
│   │   └── session-history.ts # 读取 Claude / Codex / Kimi 本机历史会话及恢复命令
│   ├── preload/               # 预加载脚本
│   │   ├── index.cjs          # 运行时实际加载的 preload，由 vite.config.ts 复制到 dist-electron/preload/
│   │   └── index.ts           # 同一组接口的 TS 版本，不参与构建；修改接口时须与 index.cjs 同步
│   └── renderer/              # React 前端渲染进程
│       └── src/
│           ├── main.tsx
│           ├── App.tsx                   # 全局状态、工作区持久化与会话调度
│           ├── index.css                 # 语义颜色 token、各主题配色变量、通用控件类（icon-btn / btn-* / input / option）与顶栏容器查询断点
│           ├── themes.ts                 # 主题明暗基调与设置页主题选项（浅 / 深、护眼、编辑器三组）；新增主题须同步 index.css、index.html 首帧脚本的主题白名单与 TerminalViewport 终端配色
│           ├── taskSummary.ts            # 任务行第二行支持的 CLI 与「新会话 · 时间」的格式化
│           ├── clis.ts                   # 内置 CLI 定义（CliDef）、默认文件夹与首次启动的示例任务
│           ├── workspaceState.ts         # 文件夹树的状态：folderKey、排序、旧数据迁移、状态校验、最近任务归类与读写
│           ├── accounts.ts               # 多账号：支持的 CLI 与登录命令、环境变量文本解析、账号校验
│           ├── components/
│           │   ├── Sidebar.tsx           # 左侧品牌头部（Logo、标语、版本号）、文件夹树（Git 分支、任务）与最近任务
│           │   ├── Topbar.tsx            # 顶部导航栏（嵌入单行额度、系统资源与全局操作）
│           │   ├── InlineQuotaText.tsx   # 顶栏单行纯文字实时额度（Tokens / Cost、5h / 7d、模型）
│           │   ├── SystemStatsText.tsx   # 顶栏右侧单行纯文字 CPU / 内存 / 网速，订阅 `system:stats`
│           │   ├── TerminalViewport.tsx  # xterm.js 多实例保活容器；任务第一次被选中时才创建实例，WebGL 只保留最近显示的 8 个
│           │   ├── TerminalSearchBar.tsx # 终端关键字搜索栏
│           │   ├── NewTaskModal.tsx      # 新建 Task 弹窗（该 CLI 配置了账号时可选账号）
│           │   ├── FilePreviewPanel.tsx  # 终端右侧只读文件预览面板（Ctrl+单击终端路径打开，宽度可拖拽）
│           │   ├── HistoryModal.tsx      # 历史会话抽屉（顶栏右上角入口）：按日期分段，显示文件夹、分支与「已打开」
│           │   ├── UsageModal.tsx        # 本周用量弹窗（顶栏用量按钮 / Ctrl+Shift+U）：各模型用量表与近 26 周每日请求数方块图
│           │   ├── SettingsModal.tsx     # 分页设置：外观、时间、终端、账号、提醒、快捷键列表
│           │   ├── AccountsSettings.tsx  # 设置 → 账号：添加 / 编辑 / 删除账号、登录入口与登录状态
│           │   ├── Modal.tsx             # 所有弹窗共用的外壳（遮罩、标题栏、Esc 关闭、焦点归还）
│           │   ├── ConfirmDialog.tsx     # 应用内确认与通知弹窗，替代原生 confirm / alert
│           │   ├── MusicPlayer.tsx       # 侧栏底部迷你音乐播放器，无音乐文件时不显示
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
  status: 'starting' | 'running' | 'idle' | 'waiting' | 'stopped' | 'error';
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
5. **修改后交付**：
   - 每次修改项目文件并完成必要验证后，自动执行 `npm run build:win`，生成 Windows 安装版 `release/OneAI-Setup-<version>.exe`（不再默认生成便携版，需要时用 `npm run build:portable`）；核对产物的生成时间和大小，失败时明确报告。
