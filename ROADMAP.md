# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 1 - 需求设计与架构规划（已定稿，暂不启动代码开发）
- **状态**：就绪待命（Standby）

## 2. 进度看板

### 已完成
- [x] 完成多 CLI 工作台 UI 效果图设计与确认（左侧导航 + 右侧终端 + 顶栏单行横排实时额度）。
- [x] 确立项目级规范文档 [AGENTS.md](file:///d:/GitHub/OneDesktop/AGENTS.md) 。
- [x] 初始化本地 Git 仓库与 `.gitignore` 规则。
- [x] 完成实施方案规划与架构设计 [implementation_plan.md](file:///C:/Users/31317/.gemini/antigravity/brain/e1268a3a-17f8-419c-a5fd-ef3ba0c51fb0/implementation_plan.md) 。

### 待办
- [ ] 实现 Electron 主进程 `node-pty` 多进程池调度器（创建、写入、读取、调整大小、退出）。
- [ ] 实现大模型 5h / 7d 额度轮询服务与 IPC 广播。
- [ ] 编写 Preload 强类型安全通信通道。
- [ ] 实现前端顶部导航栏与右侧单行纯文字实时额度组件。
- [ ] 实现前端左侧 CLI 会话管理侧边栏（添加、切换、终止、状态灯）。
- [ ] 实现右侧基于 `@xterm/xterm` 的多实例保活终端视窗。
- [ ] 端到端运行与功能全量验证。

## 3. 阻塞与风险
- 暂无阻塞。
- 风险点：Windows 环境下 `node-pty` 原生 C++ 模块的编译与打包需确保与 Electron ABI 版本匹配。

## 4. 最近验证
- 暂未开始代码编译验证。
