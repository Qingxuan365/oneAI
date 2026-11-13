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
│   │   ├── pty-manager.ts     # node-pty 进程池管理器
│   │   ├── quota-service.ts   # 大模型配额、模型与推理等级读取及配置热监听
│   │   ├── cli-detect.ts      # 按 PATH 检测各 CLI 是否已安装，决定侧栏分组显示
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
│           ├── themes.ts                 # 主题明暗基调与设置页主题选项
│           ├── components/
│           │   ├── Sidebar.tsx           # 左侧 CLI 分组与任务列表
│           │   ├── Topbar.tsx            # 顶部导航栏（嵌入单行额度与全局操作）
│           │   ├── InlineQuotaText.tsx   # 右上角单行纯文字实时额度
│           │   ├── TerminalViewport.tsx  # xterm.js 多实例保活容器
│           │   ├── TerminalSearchBar.tsx # 终端关键字搜索栏
│           │   ├── NewTaskModal.tsx      # 新建 Task 弹窗
│           │   ├── FilePreviewPanel.tsx  # 终端右侧只读文件预览面板（Ctrl+单击终端路径打开，宽度可拖拽）
│           │   ├── HistoryModal.tsx      # 历史会话列表（顶栏右上角入口）
│           │   ├── SettingsModal.tsx     # 分页设置：外观、终端、提醒与音乐、时间、快捷键列表
│           │   ├── Modal.tsx             # 所有弹窗共用的外壳（遮罩、标题栏、Esc 关闭、焦点归还）
│           │   ├── ConfirmDialog.tsx     # 应用内确认与通知弹窗，替代原生 confirm / alert
│           │   ├── MusicPlayer.tsx       # 侧栏底部迷你音乐播放器，无音乐文件时不显示
│           │   ├── BrandIcon.tsx         # 各 CLI 品牌徽标
│           │   └── AppLogo.tsx           # 应用 Logo
│           └── types/index.ts            # 前端类型与 window.electronAPI 声明
```

## 3. 核心数据模型约定

```typescript
// CLI 分组模型
interface CliGroup {
  id: string;             // 如 "codex", "kimi", "opencode"
  name: string;           // 显示名称 "Codex", "Kimi Code"
  icon: string;           // 对应大模型品牌 Logo（"codex" | "kimi" | "opencode" | "claude" 等）
  defaultCommand: string; // 启动命令模版
  isExpanded: boolean;    // 分组展开/折叠状态
  tasks: TaskSession[];   // 该 CLI 下并发运行的子任务列表
}

// 具体任务终端会话模型
interface TaskSession {
  id: string;             // 任务唯一标识（对应底层 ptyId）
  groupId: string;        // 所属 CLI 分组
  title: string;          // 任务标题，如 "Task 1: Auth Refactor"
  status: 'starting' | 'running' | 'idle' | 'waiting' | 'stopped' | 'error';
  cwd: string;            // 工作目录
  command?: string;       // 任务自定义启动命令
  createdAt: number;
}
```

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
   - 顶栏新增内容前先确认各宽度下不重叠，次要信息通过 `index.css` 的 `topbar` 容器查询收起。
5. **修改后交付**：
   - 每次修改项目文件并完成必要验证后，自动执行 `npm run build:win`，生成 Windows 安装版 `release/OneAI-Setup-<version>.exe`（不再默认生成便携版，需要时用 `npm run build:portable`）；核对产物的生成时间和大小，失败时明确报告。
