import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { TaskSession } from '../types';

interface TerminalViewportProps {
  tasks: TaskSession[];
  activeTaskId: string | null;
  fontSize?: number;
  lineHeight?: number;
  cursorStyle?: 'bar' | 'block' | 'underline';
  cursorBlink?: boolean;
}

interface TerminalInstance {
  term: Terminal;
  fitAddon: FitAddon;
  webglAddon?: WebglAddon;
  container: HTMLDivElement;
  pendingData: string;
  flushTimer: NodeJS.Timeout | null;
  flush: () => void;
}

/**
 * 净化终端数据流中的伪光标泄露：
 * Windows ConPTY 在将后台渲染缓冲区切片推送到客户端时，常因 60Hz 定时器边界，
 * 在局部擦除或星空粒子重绘后（如 \x1b[9;1H）、输出目标输入行光标（\x1b[11;3H）之前，
 * 误插 \x1b[?25h（即刻显示光标）。这会导致光标在输入框各处高频横移乱跳。
 * 此处移除无字符紧随定位的光标开启指令，保持隐藏状态直至真正定位到用户输入行。
 */
export function sanitizeTerminalData(data: string): string {
  // 1. 过滤：\x1b[?25l<光标定位>\x1b[?25h -> 保持隐藏 \x1b[?25l<光标定位>
  let res = data.replace(/\x1b\[\?25l(\x1b\[\d+;\d+H)\x1b\[\?25h/g, '\x1b[?25l$1');

  // 2. 过滤 DECSET 2026 同步刷新结束前夕孤立泄露的光标开启指令
  res = res.replace(/(\x1b\[\d+;\d+H)\x1b\[\?25h(?=\s*\x1b\[0\s*q|\s*\x1b\[\?2026l)/g, '$1');

  return res;
}

export const TerminalViewport: React.FC<TerminalViewportProps> = ({
  tasks,
  activeTaskId,
  fontSize = 15,
  lineHeight = 1.3,
  cursorStyle = 'bar',
  cursorBlink = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TerminalInstance>>(new Map());

  // 动态更新所有已有终端的字体大小、行高与光标样式，实时触发自适应排版
  useEffect(() => {
    instancesRef.current.forEach((instance) => {
      let changed = false;
      if (fontSize && instance.term.options.fontSize !== fontSize) {
        instance.term.options.fontSize = fontSize;
        changed = true;
      }
      if (lineHeight && instance.term.options.lineHeight !== lineHeight) {
        instance.term.options.lineHeight = lineHeight;
        changed = true;
      }
      if (cursorStyle && instance.term.options.cursorStyle !== cursorStyle) {
        instance.term.options.cursorStyle = cursorStyle;
      }
      if (cursorBlink !== undefined && instance.term.options.cursorBlink !== cursorBlink) {
        instance.term.options.cursorBlink = cursorBlink;
      }
      if (changed) {
        try {
          instance.fitAddon.fit();
        } catch {}
      }
    });
  }, [fontSize, lineHeight, cursorStyle, cursorBlink]);

  // 为每个任务维护一个独立的 xterm 实例，切换时仅更改 display: none / block
  useEffect(() => {
    if (!containerRef.current) return;

    const currentTaskIds = new Set(tasks.map((t) => t.id));

    // 1. 清理已被关闭的任务终端
    instancesRef.current.forEach((instance, id) => {
      if (!currentTaskIds.has(id)) {
        try {
          if (instance.flushTimer) clearTimeout(instance.flushTimer);
          instance.webglAddon?.dispose();
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
        termContainer.className = 'w-full h-full overflow-hidden';
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
          fontFamily: 'Consolas, "Cascadia Code", "Fira Code", monospace',
          fontSize,
          lineHeight,
          cursorBlink,
          cursorStyle,
          cursorInactiveStyle: 'none',
          convertEol: false, // 现代 Windows ConPTY 已自带规范 CRLF，禁止强制 convertEol 以免缩进文本被多余 \r 错打在第 1 列
          allowTransparency: false,
          scrollback: 5000,
          windowsPty: {
            backend: 'conpty',
            buildNumber: 26200, // 声明真实 Win11 构建号，防止 xterm.js 误判旧系统而禁用 Reflow 及导致行折叠首字拖影
          },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(termContainer);

        // 挂载 GPU 硬件加速的 WebglAddon，由 GPU 显存缓冲接管整屏帧刷新，彻底根除 DOM 渲染器滚动时的文字残影与拖影
        let webglAddon: WebglAddon | undefined;
        try {
          webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => {
            webglAddon?.dispose();
          });
          term.loadAddon(webglAddon);
        } catch (e) {
          console.warn('[OneDesktop] WebglAddon failed to load, fallback to DOM renderer:', e);
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
            term.write(sanitizeTerminalData(buf));
          }
        });

        // 点击视窗任意位置自动聚焦
        termContainer.addEventListener('click', () => {
          term.focus();
        });

        const instance: TerminalInstance = {
          term,
          fitAddon,
          webglAddon,
          container: termContainer,
          pendingData: '',
          flushTimer: null,
          flush: () => {
            if (instance.flushTimer) {
              clearTimeout(instance.flushTimer);
              instance.flushTimer = null;
            }
            if (instance.pendingData) {
              const sanitized = sanitizeTerminalData(instance.pendingData);
              instance.pendingData = '';
              instance.term.write(sanitized);
            }
          },
        };

        instancesRef.current.set(task.id, instance);
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
            instance.term.refresh(0, instance.term.rows - 1);
            const { cols, rows } = instance.term;
            window.electronAPI?.resizeSession(id, cols, rows);

            // 检查如果界面为空，补齐拉取一次历史 buffer
            window.electronAPI?.getSessionBuffer(id).then((buf) => {
              if (buf && instance.term.buffer.active.length <= 1) {
                instance.term.write(sanitizeTerminalData(buf));
              }
            });
          } catch {
            // ignore
          }
        }, 50);
      }
    });
  }, [activeTaskId]);

  // 监听来自 Electron 主进程的 PTY stdout 数据流，通过微帧缓冲合并写入对应终端
  useEffect(() => {
    const unsubData = window.electronAPI?.onSessionData(({ id, data }) => {
      const instance = instancesRef.current.get(id);
      if (instance) {
        instance.pendingData += data;

        // 如果遇到未闭合的 DECSET 2026 同步刷新块，稍微延长等待闭合；否则 16ms 内原子写入
        const inSync =
          instance.pendingData.includes('\x1b[?2026h') && !instance.pendingData.includes('\x1b[?2026l');
        const delay = inSync ? 25 : 16;

        if (!instance.flushTimer) {
          instance.flushTimer = setTimeout(() => {
            instance.flush();
          }, delay);
        }
      }
    });

    return () => {
      unsubData?.();
      instancesRef.current.forEach((instance) => {
        if (instance.flushTimer) {
          clearTimeout(instance.flushTimer);
          instance.flushTimer = null;
        }
      });
    };
  }, []);

  // 监听视窗容器尺寸变化，自适应重算当前活动终端（增加防抖与行列变化比对，杜绝死循环抖动）
  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimer: NodeJS.Timeout | null = null;
    let lastCols = 0;
    let lastRows = 0;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (activeTaskId) {
          const instance = instancesRef.current.get(activeTaskId);
          if (instance) {
            try {
              instance.fitAddon.fit();
              const { cols, rows } = instance.term;
              if (cols !== lastCols || rows !== lastRows) {
                lastCols = cols;
                lastRows = rows;
                window.electronAPI?.resizeSession(activeTaskId, cols, rows);
              }
            } catch {
              // ignore
            }
          }
        }
      }, 100);
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
    };
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
        <div ref={containerRef} className="w-full h-full overflow-hidden" />
      )}
    </main>
  );
};

