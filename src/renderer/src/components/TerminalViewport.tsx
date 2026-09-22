import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { TaskSession } from '../types';
import { TerminalSearchBar } from './TerminalSearchBar';

export interface TerminalViewportRef {
  openSearch: () => void;
  closeSearch: () => void;
  clearActiveTerminal: () => void;
  restartActiveTerminal: () => Promise<void>;
  exportActiveTerminalLog: (mode: 'copy' | 'save') => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
}

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
  searchAddon: SearchAddon;
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
  let res = data.replace(/\x1b\[\?25l(\x1b\[\d+;\d+H)\x1b\[\?25h/g, '\x1b[?25l$1');
  res = res.replace(/(\x1b\[\d+;\d+H)\x1b\[\?25h(?=\s*\x1b\[0\s*q|\s*\x1b\[\?2026l)/g, '$1');
  return res;
}

export const TerminalViewport = forwardRef<TerminalViewportRef, TerminalViewportProps>(({
  tasks,
  activeTaskId,
  fontSize = 15,
  lineHeight = 1.3,
  cursorStyle = 'bar',
  cursorBlink = true,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TerminalInstance>>(new Map());

  // 搜索栏状态
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const getActiveSearchAddon = () => {
    if (!activeTaskId) return null;
    return instancesRef.current.get(activeTaskId)?.searchAddon || null;
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    const searchAddon = getActiveSearchAddon();
    if (searchAddon) {
      if (query.trim()) {
        searchAddon.findNext(query, { caseSensitive: matchCase, regex: useRegex, incremental: true });
      } else {
        searchAddon.clearDecorations();
      }
    }
  };

  const handleFindNext = () => {
    const searchAddon = getActiveSearchAddon();
    if (searchAddon && searchQuery.trim()) {
      searchAddon.findNext(searchQuery, { caseSensitive: matchCase, regex: useRegex });
    }
  };

  const handleFindPrevious = () => {
    const searchAddon = getActiveSearchAddon();
    if (searchAddon && searchQuery.trim()) {
      searchAddon.findPrevious(searchQuery, { caseSensitive: matchCase, regex: useRegex });
    }
  };

  const handleCloseSearch = () => {
    const searchAddon = getActiveSearchAddon();
    searchAddon?.clearDecorations();
    setIsSearchOpen(false);
    if (activeTaskId) {
      instancesRef.current.get(activeTaskId)?.term.focus();
    }
  };

  // 清理当前活动终端屏幕与主进程缓冲区
  const clearActiveTerminal = () => {
    if (!activeTaskId) return;
    const instance = instancesRef.current.get(activeTaskId);
    if (instance) {
      instance.term.clear();
      window.electronAPI?.clearSessionBuffer?.(activeTaskId);
      instance.term.write('\r\n\x1b[90m[OneAI] 屏幕与会话历史已清空\x1b[0m\r\n');
      instance.term.focus();
    }
  };

  // 重启当前活动 CLI 进程
  const restartActiveTerminal = async () => {
    if (!activeTaskId) return;
    const instance = instancesRef.current.get(activeTaskId);
    if (instance) {
      instance.term.clear();
      instance.term.write('\r\n\x1b[33m[OneAI] 正在重启 CLI 会话进程...\x1b[0m\r\n');
      await window.electronAPI?.restartSession?.(activeTaskId);
      instance.term.focus();
    }
  };

  // 导出或复制当前会话全量文本
  const exportActiveTerminalLog = async (mode: 'copy' | 'save') => {
    if (!activeTaskId) return { success: false, error: '无活动会话' };
    const raw = (await window.electronAPI?.getSessionBuffer(activeTaskId)) || '';
    // 去除 ANSI 控制序列，保留纯净文本
    const plainText = raw.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

    if (mode === 'copy') {
      try {
        if (window.electronAPI?.writeClipboardText) {
          await window.electronAPI.writeClipboardText(plainText);
        } else {
          await navigator.clipboard.writeText(plainText);
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    } else {
      const activeTask = tasks.find((t) => t.id === activeTaskId);
      const safeTitle = (activeTask?.title || 'session').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
      const defaultName = `${safeTitle}-log-${Date.now()}.md`;
      const res = await window.electronAPI?.saveLogFile?.(defaultName, plainText);
      return res || { success: false, error: '保存失败' };
    }
  };

  // 暴露给外层 Topbar 控制
  useImperativeHandle(ref, () => ({
    openSearch: () => setIsSearchOpen(true),
    closeSearch: handleCloseSearch,
    clearActiveTerminal,
    restartActiveTerminal,
    exportActiveTerminalLog,
  }));

  // 全局阻止默认拖拽行为，防止外部文件拖入非目标区域导致 Electron 窗口刷新/跳转
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent, false);
    window.addEventListener('drop', prevent, false);
    return () => {
      window.removeEventListener('dragover', prevent, false);
      window.removeEventListener('drop', prevent, false);
    };
  }, []);

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
          instance.searchAddon?.dispose();
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
          convertEol: false,
          allowTransparency: false,
          scrollback: 5000,
          windowsPty: {
            backend: 'conpty',
            buildNumber: 26200,
          },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        // 挂载官方搜索插件
        const searchAddon = new SearchAddon();
        term.loadAddon(searchAddon);

        term.open(termContainer);

        // 挂载 GPU 硬件加速 WebglAddon
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

        // 注册超链接识别（支持 http://、https:// 等网页地址，点击拉起系统默认浏览器）
        term.registerLinkProvider({
          provideLinks(bufferLineNumber, callback) {
            try {
              const line = term.buffer.active.getLine(bufferLineNumber - 1);
              if (!line) {
                callback(undefined);
                return;
              }
              const text = line.translateToString(true);
              const urlRegex = /(https?:\/\/[^\s<>"'`]+)/g;
              const links: any[] = [];
              let match: RegExpExecArray | null;
              while ((match = urlRegex.exec(text)) !== null) {
                const url = match[0];
                const startX = match.index + 1;
                const endX = startX + url.length;
                links.push({
                  text: url,
                  range: {
                    start: { x: startX, y: bufferLineNumber },
                    end: { x: endX, y: bufferLineNumber },
                  },
                  activate: (_e: MouseEvent, text: string) => {
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(text);
                    } else {
                      window.open(text, '_blank');
                    }
                  },
                });
              }
              callback(links.length > 0 ? links : undefined);
            } catch {
              callback(undefined);
            }
          },
        });

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

        // 复制划选文本到系统剪贴板
        const handleCopy = async (): Promise<boolean> => {
          if (term.hasSelection()) {
            const selectedText = term.getSelection();
            if (selectedText) {
              try {
                if (window.electronAPI?.writeClipboardText) {
                  await window.electronAPI.writeClipboardText(selectedText);
                } else {
                  await navigator.clipboard.writeText(selectedText);
                }
              } catch {
                try {
                  await navigator.clipboard.writeText(selectedText);
                } catch {}
              }
              term.clearSelection();
              return true;
            }
          }
          return false;
        };

        const handlePaste = async () => {
          try {
            if (window.electronAPI?.readPasteContent) {
              const res = await window.electronAPI.readPasteContent();
              if (res && res.content) {
                window.electronAPI.writeSession(task.id, res.content);
                return;
              }
            }
          } catch {}

          // 回退到浏览器原生剪贴板 API
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              window.electronAPI?.writeSession(task.id, text);
            }
          } catch {}
        };

        // 右键交互（对齐 Windows Terminal 黄金标准）：
        // 1. 若当前有划选文本：右键执行复制并清除划选
        // 2. 若当前无划选文本：右键从剪贴板读取内容并粘贴进终端
        termContainer.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          if (term.hasSelection()) {
            await handleCopy();
          } else {
            await handlePaste();
          }
        });

        // 终端键盘事件拦截与快捷键增强
        term.attachCustomKeyEventHandler((e) => {
          if (e.type !== 'keydown') {
            return true;
          }

          // 1. 搜索快捷键 Ctrl+F
          if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
            setIsSearchOpen(true);
            return false;
          }

          // 2. 清屏快捷键 Ctrl+K
          if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
            clearActiveTerminal();
            return false;
          }

          // 3. 复制快捷键支持：
          // - Ctrl+C（无 Shift）：若有划选文本，执行复制并阻止向 PTY 发送 SIGINT 中断信号；若无划选，放行发送中断信号
          // - Ctrl+Shift+C 或 Ctrl+Insert：终端标准复制
          if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
            if (term.hasSelection()) {
              handleCopy();
              return false;
            }
            return true;
          }

          if (
            (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'Insert')
          ) {
            handleCopy();
            return false;
          }

          // 4. 粘贴快捷键支持：
          // - Ctrl+V / Ctrl+Shift+V
          // - Shift+Insert（传统终端粘贴）
          if (
            (e.ctrlKey && (e.key === 'v' || e.key === 'V')) ||
            (e.shiftKey && e.key === 'Insert')
          ) {
            handlePaste();
            return false;
          }

          return true;
        });

        // 拖拽文件/图片到终端自动转换为文件路径
        termContainer.addEventListener('dragenter', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        termContainer.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
          }
        });
        termContainer.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const files = e.dataTransfer?.files;
          if (files && files.length > 0) {
            const paths: string[] = [];
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              let p = '';
              try {
                p = window.electronAPI?.getPathForFile ? window.electronAPI.getPathForFile(file) : ((file as any).path || '');
              } catch {
                p = (file as any).path || '';
              }
              if (p) {
                paths.push(p.includes(' ') ? `"${p}"` : p);
              }
            }
            if (paths.length > 0) {
              window.electronAPI?.writeSession(task.id, paths.join(' '));
              term.focus();
            }
          }
        });

        const instance: TerminalInstance = {
          term,
          fitAddon,
          searchAddon,
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

  // 监听视窗容器尺寸变化，自适应重算当前活动终端
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
      {/* 终端内悬浮关键字搜索栏 */}
      <TerminalSearchBar
        isOpen={isSearchOpen}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onFindNext={handleFindNext}
        onFindPrevious={handleFindPrevious}
        onClose={handleCloseSearch}
        matchCase={matchCase}
        onToggleMatchCase={() => setMatchCase((v) => !v)}
        useRegex={useRegex}
        onToggleRegex={() => setUseRegex((v) => !v)}
      />

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
});

TerminalViewport.displayName = 'TerminalViewport';
