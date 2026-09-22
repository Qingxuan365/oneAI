import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { TerminalViewport } from './components/TerminalViewport';
import { NewTaskModal } from './components/NewTaskModal';
import { SettingsModal } from './components/SettingsModal';
import { CliGroup, TaskSession, QuotaData, AppSettings } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  terminalFontSize: 15,
  terminalLineHeight: 1.3,
  uiScale: 'comfortable',
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
};

function loadSavedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('onedesktop_settings');
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

// 初始化默认 CLI 分组（绑定各 AI CLI 的真实执行命令）
const INITIAL_GROUPS: CliGroup[] = [
  {
    id: 'kimi',
    name: 'Kimi Code',
    icon: 'kimi',
    defaultCommand: 'kimi',
    isExpanded: true,
    tasks: [
      {
        id: 'kimi-task-1',
        groupId: 'kimi',
        title: 'Task 1: Kimi CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneDesktop',
        createdAt: Date.now() - 1000 * 60 * 5,
      },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    icon: 'codex',
    defaultCommand: 'codex',
    isExpanded: true,
    tasks: [
      {
        id: 'codex-task-1',
        groupId: 'codex',
        title: 'Task 1: Codex CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneDesktop',
        createdAt: Date.now() - 1000 * 60 * 30,
      },
    ],
  },
  {
    id: 'claude',
    name: 'Claude Code',
    icon: 'claude',
    defaultCommand: 'claude',
    isExpanded: false,
    tasks: [
      {
        id: 'claude-task-1',
        groupId: 'claude',
        title: 'Task 1: Claude CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneDesktop',
        createdAt: Date.now() - 1000 * 60 * 15,
      },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    icon: 'opencode',
    defaultCommand: 'opencode',
    isExpanded: false,
    tasks: [
      {
        id: 'opencode-task-1',
        groupId: 'opencode',
        title: 'Task 1: OpenCode CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneDesktop',
        createdAt: Date.now() - 1000 * 60 * 1,
      },
    ],
  },
];

export const App: React.FC = () => {
  const [groups, setGroups] = useState<CliGroup[]>(INITIAL_GROUPS);
  const [activeTaskId, setActiveTaskId] = useState<string | null>('kimi-task-1');
  const [quotas, setQuotas] = useState<Record<string, QuotaData>>({});

  // 字体与外观设置状态（自动持久化到 localStorage）
  const [settings, setSettings] = useState<AppSettings>(loadSavedSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 弹窗状态
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [selectedGroupIdForNewTask, setSelectedGroupIdForNewTask] = useState<string | null>(null);

  // 动态应用全局 UI 界面缩放比例
  useEffect(() => {
    const scaleMap: Record<AppSettings['uiScale'], string> = {
      compact: '14.5px',      // 90%
      standard: '16px',       // 100%
      comfortable: '17.5px',  // 110% (推荐默认)
      large: '20px',          // 125%
    };
    document.documentElement.style.fontSize = scaleMap[settings.uiScale] || '17.5px';
    try {
      localStorage.setItem('onedesktop_settings', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // 全局快捷键缩放终端字体（Ctrl + / Ctrl - / Ctrl 0）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setSettings((prev) => ({
            ...prev,
            terminalFontSize: Math.min(24, prev.terminalFontSize + 1),
          }));
        } else if (e.key === '-') {
          e.preventDefault();
          setSettings((prev) => ({
            ...prev,
            terminalFontSize: Math.max(12, prev.terminalFontSize - 1),
          }));
        } else if (e.key === '0') {
          e.preventDefault();
          setSettings((prev) => ({
            ...prev,
            terminalFontSize: 15,
          }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 所有子任务扁平数组
  const allTasks = useMemo(() => {
    return groups.flatMap((g) => g.tasks);
  }, [groups]);

  // 当前激活的任务与对应的 CLI 组
  const activeTask = useMemo(() => {
    return allTasks.find((t) => t.id === activeTaskId) || null;
  }, [allTasks, activeTaskId]);

  const currentGroup = useMemo(() => {
    if (!activeTask) return null;
    return groups.find((g) => g.id === activeTask.groupId) || null;
  }, [groups, activeTask]);

  // 当前选中 CLI 对应的实时配额
  const currentQuota = useMemo(() => {
    if (!currentGroup) return null;
    return quotas[currentGroup.id] || null;
  }, [quotas, currentGroup]);

  // 初始化拉取各 CLI 真实配额与订阅后台推送
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getAllQuotas().then((all) => {
        if (all) setQuotas(all);
      });
      const unsub = window.electronAPI.onQuotaUpdate((updatedQuotas) => {
        if (updatedQuotas) setQuotas(updatedQuotas);
      });
      return () => unsub();
    } else {
      // 浏览器独立预览调试降级数据
      setQuotas({
        kimi: {
          cliId: 'kimi',
          cliName: 'Kimi Code',
          model: 'k3',
          planType: 'Kimi Coding',
          fiveHourPercent: 100,
          fiveHourResetsIn: '4h 12m',
          sevenDayPercent: 12,
          sevenDayResetsOn: 'Resets Wed',
          lastUpdated: Date.now(),
          status: 'normal',
        },
        codex: {
          cliId: 'codex',
          cliName: 'Codex',
          model: 'gpt-5.5',
          planType: 'Plus',
          fiveHourPercent: 1,
          fiveHourResetsIn: '2h 58m',
          sevenDayPercent: 69,
          sevenDayResetsOn: 'Resets Sun',
          lastUpdated: Date.now(),
          status: 'normal',
        },
        claude: {
          cliId: 'claude',
          cliName: 'Claude Code',
          model: 'claude-3.7-sonnet',
          planType: 'Pro',
          fiveHourPercent: 88,
          fiveHourResetsIn: '3h 30m',
          sevenDayPercent: 75,
          sevenDayResetsOn: 'Resets Fri',
          lastUpdated: Date.now(),
          status: 'normal',
        },
        opencode: {
          cliId: 'opencode',
          cliName: 'OpenCode',
          fiveHourPercent: 0,
          fiveHourResetsIn: '--',
          sevenDayPercent: 0,
          sevenDayResetsOn: '--',
          lastUpdated: Date.now(),
          status: 'offline',
          message: '未检测到本地配置',
        },
      });
    }
  }, []);

  // 为初始化任务在 Electron 主进程创建真实 CLI 终端 PTY
  useEffect(() => {
    if (window.electronAPI) {
      groups.forEach((group) => {
        group.tasks.forEach((task) => {
          window.electronAPI.createSession({
            id: task.id,
            command: group.defaultCommand,
            cwd: task.cwd,
          });
        });
      });
    }
  }, []);

  // 切换折叠/展开 CLI 分组
  const handleToggleGroup = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g))
    );
  };

  // 选中具体某个子任务
  const handleSelectTask = (taskId: string, groupId: string) => {
    setActiveTaskId(taskId);
    // 保证该分组处于展开状态
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isExpanded: true } : g))
    );
  };

  // 触发新建子任务弹窗
  const handleOpenNewTask = (groupId: string) => {
    setSelectedGroupIdForNewTask(groupId);
    setIsNewTaskOpen(true);
  };

  // 创建子任务
  const handleCreateTask = useCallback((groupId: string, title: string, command: string, cwd: string) => {
    const newTaskId = `${groupId}-task-${Date.now().toString(36)}`;
    const newTask: TaskSession = {
      id: newTaskId,
      groupId,
      title,
      status: 'running',
      cwd: cwd || 'd:\\GitHub\\OneDesktop',
      createdAt: Date.now(),
    };

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, isExpanded: true, tasks: [...g.tasks, newTask] }
          : g
      )
    );

    setActiveTaskId(newTaskId);

    // 调用 Electron 主进程启动真实 PTY
    if (window.electronAPI) {
      window.electronAPI.createSession({
        id: newTaskId,
        command: command || undefined,
        cwd: cwd || undefined,
      });
    }
  }, []);

  // 关闭具体子任务
  const handleCloseTask = useCallback((taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (window.electronAPI) {
      window.electronAPI.killSession(taskId);
    }

    setGroups((prev) => {
      const updated = prev.map((g) => ({
        ...g,
        tasks: g.tasks.filter((t) => t.id !== taskId),
      }));
      return updated;
    });

    if (activeTaskId === taskId) {
      // 自动切到相邻的下一个或前一个任务
      const remaining = allTasks.filter((t) => t.id !== taskId);
      setActiveTaskId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [activeTaskId, allTasks]);

  // 手动刷新当前选中 CLI 的真实配额
  const handleRefreshQuota = async () => {
    if (window.electronAPI) {
      const latest = await window.electronAPI.refreshQuota(currentGroup?.id);
      if (latest) setQuotas(latest);
    }
  };

  const currentGroupForModal = groups.find((g) => g.id === selectedGroupIdForNewTask) || null;

  return (
    <div className="flex h-screen w-screen bg-[#0e1117] text-[#e2e8f0] overflow-hidden">
      {/* 左侧：CLI 品牌 Logo + 多任务树状菜单 */}
      <Sidebar
        groups={groups}
        activeTaskId={activeTaskId}
        onSelectTask={handleSelectTask}
        onToggleGroup={handleToggleGroup}
        onNewTask={handleOpenNewTask}
        onCloseTask={handleCloseTask}
        onAddGroup={() => {
          // 预留添加自定义 CLI 分组
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 右侧：顶栏（单行横排纯文字额度） + 终端主视窗 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <Topbar
          currentGroup={currentGroup}
          activeTask={activeTask}
          quota={currentQuota}
          onRefreshQuota={handleRefreshQuota}
        />

        {/* 多实例保活终端容器（切换时不销毁，display: none 保活） */}
        <TerminalViewport
          tasks={allTasks}
          activeTaskId={activeTaskId}
          fontSize={settings.terminalFontSize}
          lineHeight={settings.terminalLineHeight}
          cursorStyle={settings.terminalCursorStyle}
          cursorBlink={settings.terminalCursorBlink}
        />
      </div>

      {/* 新建子任务弹窗 */}
      <NewTaskModal
        group={currentGroupForModal}
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        onCreate={handleCreateTask}
      />

      {/* 外观与字体大小设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        onResetDefault={() => setSettings(DEFAULT_SETTINGS)}
      />
    </div>
  );
};
export default App;
