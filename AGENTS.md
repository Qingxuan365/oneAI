# OneDesktop 项目级工程规范

## 1. 项目定位与架构约定

OneDesktop 是专为本地多 AI 编程 CLI（如 Codex、Kimi Code、OpenCode）打造的桌面集成工作台。
核心技术选型：
- 运行时：Electron + Node.js
- 底层进程：`node-pty`（调用 Windows ConPTY API）
- 前端渲染：React 18 + TypeScript + Tailwind CSS + Lucide React
- 终端模拟：`@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl`
- 构建工具：Vite + electron-vite (或 vite-plugin-electron)

## 2. 目录结构规范

```text
d:/GitHub/OneDesktop/
├── .gitignore
├── AGENTS.md                  # 项目规范
├── ROADMAP.md                 # 进度与状态源
├── README.md                  # 项目说明与启动指引
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── electron.vite.config.ts    # 或 vite 主/渲染进程构建配置
├── src/
│   ├── main/                  # Electron 主进程代码
│   │   ├── index.ts           # 窗口创建与应用生命周期
│   │   ├── pty-manager.ts     # node-pty 进程池管理器
│   │   └── quota-service.ts   # 大模型配额轮询与推送服务
│   ├── preload/               # 预加载脚本
│   │   ├── index.ts           # contextBridge 暴露安全 IPC 接口
│   │   └── index.d.ts         # 类型声明
│   └── renderer/              # React 前端渲染进程
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── index.css
│       │   ├── components/
│       │   │   ├── Sidebar.tsx           # 左侧 CLI 会话列表
│       │   │   ├── Topbar.tsx            # 顶部导航栏（嵌入单行额度与全局操作）
│       │   │   ├── InlineQuotaText.tsx   # 右上角单行纯文字实时额度
│       │   │   ├── TerminalViewport.tsx  # xterm.js 多实例保持容器
│       │   │   └── NewSessionModal.tsx   # 新建/配置 CLI 弹窗
│       │   └── types/                    # 前端类型定义
```

## 3. 编码与设计红线

1. **终端进程隔离与保活**：
   - 切换左侧会话时严禁销毁终端 DOM 或中断底层 PTY，必须使用隐藏（`display: none`）保活机制。
   - 视窗切换显示后必须主动触发 `fitAddon.fit()` 重新计算终端字符矩阵。
2. **额度展示原则**：
   - 必须保持顶栏单行横排纯文字（Inline Text），严禁添加悬浮卡片、弹窗或遮挡视窗的浮层。
3. **平台兼容性**：
   - Windows 平台优先调用 Powershell / Cmd / Git Bash / WSL 作为底层 Shell，正确处理 Windows 换行符（CRLF）与 ConPTY 信号。
