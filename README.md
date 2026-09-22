# OneDesktop - 多 CLI AI 编程工作台

OneDesktop 是专为本地运行多个 AI 编程 CLI 工具（如 Codex、Kimi Code、OpenCode 等）打造的桌面集成工作台。

---

## 核心特性

1. **左侧大模型品牌 Logo 与树状多任务分组**：
   - 彻底告别传统文件夹图标，展示各大模型官方品牌矢量 Logo（Codex、Kimi Code、OpenCode 等）。
   - 支持一级 CLI 分组（带任务总数与折叠状态）与二级并发子任务列表（独立状态指示灯与关闭入口）。
   - 支持通过 `+ New Task` 快速基于该 CLI 环境配置拉起新的并发终端。

2. **右上方顶栏单行横排实时额度**：
   - 纯扁平单行横向纯文字排版（如 `5h Quota: 82% (2h 45m left) | 7d Quota: 65% (Resets Sun) ↻`）。
   - 严格遵循零弹窗、零悬浮窗、零遮挡原则，集成倒计时与极简刷新。

3. **高性能保活终端视窗（Keep-Alive Viewport）**：
   - 基于 `@xterm/xterm` 与 Windows ConPTY（`node-pty`）底层原生驱动。
   - 切换左侧会话与子任务时，DOM 采用保活显隐机制，进程持续运行，输出与上下文绝不中断丢失。
   - 自适应窗口缩放，自动重算字符矩阵行高列宽。

---

## 技术栈

- **桌面运行时**：Electron 31 + Node.js
- **系统伪终端底层**：`node-pty`（调用 Windows ConPTY API）
- **前端与终端引擎**：React 18 + TypeScript + Tailwind CSS + Lucide React + `@xterm/xterm`
- **构建管道**：Vite 5 + `vite-plugin-electron`

---

## 快速上手

### 1. 安装依赖
```bash
npm install
```

### 2. 启动开发工作台
```bash
npm run dev
```

### 3. 构建打包
```bash
npm run build
```
