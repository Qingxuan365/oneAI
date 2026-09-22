import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { TaskSession } from '../types';

interface TerminalViewportProps {
  tasks: TaskSession[];
  activeTaskId: string | null;
}

interface TerminalInstance {
  term: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
}

export const TerminalViewport: React.FC<TerminalViewportProps> = ({ tasks, activeTaskId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TerminalInstance>>(new Map());

  // 为每个任务维护一个独立的 xterm 实例，切换时仅更改 display: none / block
  useEffect(() => {
    if (!containerRef.current) return;

    const currentTaskIds = new Set(tasks.map((t) => t.id));

    // 1. 清理已被关闭的任务终端
    instancesRef.current.forEach((instance, id) => {
      if (!currentTaskIds.has(id)) {
        try {
          instance.term.dispose();
          instance.container.remove();
        } catch {
          // ignore
        }
        instancesRef.current.delete(id);
      }
    });

    // 2. 为新任务创建并挂载 xterm 容器
    tasks.forEach((task) => {
      if (!instancesRef.current.has(task.id)) {
        const termContainer = document.createElement('div');
        termContainer.id = `terminal-${task.id}`;
        termContainer.className = 'w-full h-full';
        termContainer.style.display = task.id === activeTaskId ? 'block' : 'none';
        containerRef.current?.appendChild(termContainer);

        const term = new Terminal({
          theme: {
            background: '#0d1117',
            foreground: '#c9d1d9',
            cursor: '#58a6ff',
            selectionBackground: '#1f6feb40',
            black: '#484f58',
            red: '#ff7b72',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#58a6ff',
            magenta: '#bc8cff',
            cyan: '#39c5cf',
            white: '#b1bac4',
            brightBlack: '#6e7681',
            brightRed: '#ffa198',
            brightGreen: '#56d364',
            brightYellow: '#e3b341',
            brightBlue: '#79c0ff',
            brightMagenta: '#d2a8ff',
            brightCyan: '#56d4dd',
            brightWhite: '#f0f6fc',
          },
          fontFamily: 'Consolas, "Fira Code", monospace, "Segoe UI Emoji"',
          fontSize: 13,
          lineHeight: 1.25,
          cursorBlink: true,
          cursorStyle: 'bar',
          convertEol: true,
          allowTransparency: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(termContainer);

        // 尝试加载 WebGL 加速
        try {
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => webglAddon.dispose());
          term.loadAddon(webglAddon);
        } catch {
          // WebGL 加速失败则降级为 Canvas
        }

        fitAddon.fit();

        // 绑定键盘输入并发送到 Electron 主进程
        term.onData((data) => {
          window.electronAPI?.writeSession(task.id, data);
        });

        // 监听终端尺寸变更并同步 PTY
        term.onResize(({ cols, rows }) => {
          window.electronAPI?.resizeSession(task.id, cols, rows);
        });

        // 立即拉取并回放主进程中的已有缓冲区
        window.electronAPI?.getSessionBuffer(task.id).then((buf) => {
          if (buf) {
            term.write(buf);
          }
        });

        // 点击视窗任意位置自动聚焦
        termContainer.addEventListener('click', () => {
          term.focus();
        });

        instancesRef.current.set(task.id, {
          term,
          fitAddon,
          container: termContainer,
        });
      }
    });
  }, [tasks]);

  // 当活动激活任务变化时，显示对应终端，隐藏其他终端，并自动 fit 和 focus
  useEffect(() => {
    instancesRef.current.forEach((instance, id) => {
      const isCurrent = id === activeTaskId;
      instance.container.style.display = isCurrent ? 'block' : 'none';

      if (isCurrent) {
        setTimeout(() => {
          try {
            instance.fitAddon.fit();
            instance.term.focus();
            const { cols, rows } = instance.term;
            window.electronAPI?.resizeSession(id, cols, rows);

            // 检查如果界面为空，补齐拉取一次历史 buffer
            window.electronAPI?.getSessionBuffer(id).then((buf) => {
              if (buf && instance.term.buffer.active.length <= 1) {
                instance.term.write(buf);
              }
            });
          } catch {
            // ignore
          }
        }, 50);
      }
    });
  }, [activeTaskId]);

  // 监听来自 Electron 主进程的 PTY stdout 数据流并写入对应终端
  useEffect(() => {
    const unsubData = window.electronAPI?.onSessionData(({ id, data }) => {
      const instance = instancesRef.current.get(id);
      if (instance) {
        instance.term.write(data);
      }
    });

    return () => {
      unsubData?.();
    };
  }, []);

  // 监听视窗容器尺寸变化，自适应重算当前活动终端
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (activeTaskId) {
        const instance = instancesRef.current.get(activeTaskId);
        if (instance) {
          try {
            instance.fitAddon.fit();
            const { cols, rows } = instance.term;
            window.electronAPI?.resizeSession(activeTaskId, cols, rows);
          } catch {
            // ignore
          }
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [activeTaskId]);

  return (
    <main className="flex-1 h-full w-full bg-[#0d1117] relative overflow-hidden">
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
          <p className="text-sm">暂无运行中的 CLI 任务</p>
          <p className="text-xs text-slate-600 mt-1">
            在左侧选择对应 CLI 并点击「新建任务」即可拉起终端会话
          </p>
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-full p-2" />
      )}
    </main>
  );
};
