# OneDesktop 开发路线图与进度看板

## 1. 当前阶段
- **阶段**：Phase 1 - 基础脚手架与编译管道搭建
- **状态**：计划已出具，等待主人明确审批后启动开发

## 2. 进度看板

### 已完成
- [x] 完成多 CLI 工作台 UI 效果图设计与确认（含各大模型品牌 Logo、树状多任务分组与顶栏单行横排实时额度）。
- [x] 确立项目级规范文档 [AGENTS.md](file:///d:/GitHub/OneDesktop/AGENTS.md) 。
- [x] 初始化本地 Git 仓库与 `.gitignore` 规则。
- [x] 出具完整开发实施计划 [implementation_plan.md](file:///C:/Users/31317/.gemini/antigravity/brain/e1268a3a-17f8-419c-a5fd-ef3ba0c51fb0/implementation_plan.md) 。

### 待办（按实施计划推进）
- [ ] Phase 1: 搭建 Electron + Vite + React 18 + Tailwind CSS 基础工程与构建管道。
- [ ] Phase 2: 实现 Electron 主进程 `node-pty`（Windows ConPTY）多进程池与配额轮询服务。
- [ ] Phase 3: 构建前端大模型品牌 Logo 资产库与会话数据模型。
- [ ] Phase 4: 研发左侧 CLI 多任务树状菜单、顶栏单行额度与右侧多实例保活终端视窗。
- [ ] Phase 5: 端到端功能联调与并发多任务验证。

## 3. 阻塞与风险
- 暂无阻塞。
- 风险点：Windows 环境下 `node-pty` 原生 C++ 模块的编译与打包需确保与 Electron ABI 版本匹配。

## 4. 最近验证
- 暂未开始代码编译验证。
