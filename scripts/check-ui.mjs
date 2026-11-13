import fs from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../tailwind.config.js';
import { spawn } from 'node:child_process';
import electron from 'electron';

const dir = new URL('../.tmp/ui-polish/', import.meta.url);
await fs.mkdir(dir, { recursive: true });
await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { Sidebar } from './src/renderer/src/components/Sidebar';
    import { Topbar } from './src/renderer/src/components/Topbar';
    import { TerminalViewport, attachImeAnchor, IME_ANCHOR_FINDERS, getLogicalLine, matchToLinkRange } from './src/renderer/src/components/TerminalViewport';
    import { FilePreviewPanel } from './src/renderer/src/components/FilePreviewPanel';
    import { Terminal } from '@xterm/xterm';
    window.electronAPI = { onWindowMaximizedChange: callback => { window.setMaximized = callback; return () => {}; }, isWindowMaximized: async () => false };
    const root = createRoot(document.getElementById('root'));
    window.events = [];
    window.draw = (status = 'running') => {
      const task = { id: 'task', groupId: 'codex', title: 'Task 1: UI regression', status, cwd: 'D:/GitHub/OneAI', createdAt: 1 };
      const group = { id: 'codex', name: 'Codex', icon: 'codex', defaultCommand: 'codex', isExpanded: true, tasks: [task] };
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <Sidebar isCollapsed={false} groups={[group]} workspacePath={task.cwd} activeTaskId={task.id}
          onSwitchWorkspace={() => {}} onSelectTask={() => window.events.push('select')} onToggleGroup={() => window.events.push('toggle')}
          onReorderGroup={() => {}} onNewTask={() => {}} onCloseTask={() => window.events.push('close')} onRenameTask={(_id, title) => window.events.push('rename:' + title)} />
        <div className="flex-1 min-w-0"><Topbar isSidebarCollapsed={false} onToggleSidebar={() => {}} currentGroup={group} activeTask={task}
          quota={{ status: 'online', cliName: 'Codex', model: 'gpt-5-codex', effort: 'high', fiveHourPercent: 82, sevenDayPercent: 65, fiveHourResetsIn: '2h 45m', sevenDayResetsOn: 'Sun' }} onRefreshQuota={async () => {}} onOpenSearch={() => window.events.push('search')}
          onClearScreen={() => {}} onRestartSession={async () => {}} onExportLogs={async () => ({ success: true })} /></div>
      </div>));
    };
    window.draw();
    // Kimi 风格界面：输入框、底边框和状态栏；真实光标停在输入行最右端（line）或状态栏右下角（status）。
    // 记录 textarea 每次样式变化后的位置，供输入法定位回归检查使用。
    window.imeProbe = async (mode, kind = 'kimi') => {
      const host = document.body.appendChild(document.createElement('div'));
      host.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:600px';
      const term = new Terminal({ cols: 100, rows: 30 });
      term.open(host);
      attachImeAnchor(term, host, IME_ANCHOR_FINDERS[kind]);
      const cursor = mode === 'line' ? '\x1b[21;99H' : '\x1b[23;100H';
      const screenText = kind === 'pi'
        ? '\x1b[?25l\x1b[20;1H' + '─'.repeat(100) + '\x1b[21;1H 你好\x1b[7m \x1b[27m\x1b[22;1H' + '─'.repeat(100) + '\x1b[24;1H0.0%/64k  deepseek-chat' + cursor
        : '\x1b[?25l\x1b[20;1H╭' + '─'.repeat(98) + '╮\x1b[21;1H│ > 你好\x1b[21;100H│\x1b[22;1H╰' + '─'.repeat(98) + '╯\x1b[23;1H kimi-k2' + cursor;
      await new Promise(done => term.write(screenText, done));
      term.focus();
      await new Promise(r => setTimeout(r, 100));
      const cell = host.querySelector('.xterm-screen').clientWidth / term.cols;
      const seen = new Set();
      const read = () => seen.add(Math.round(term.textarea.getBoundingClientRect().left / cell) + ',' + Math.round(term.textarea.getBoundingClientRect().top / (host.querySelector('.xterm-screen').clientHeight / term.rows)));
      read();
      new MutationObserver(read).observe(term.textarea, { attributes: true, attributeFilter: ['style'] });
      window.imeProbeDone = () => { host.remove(); term.dispose(); return [...seen]; };
    };
    // 侧栏交互：a 为当前任务，b 为后台待查看任务
    window.drawSidebar = (isCollapsed = false) => {
      const tasks = ['a', 'b'].map(id => ({ id: 'side-' + id, groupId: 'codex', title: 'Side ' + id, status: 'idle', cwd: 'D:/GitHub/OneAI', createdAt: 1 }));
      const group = { id: 'codex', name: 'Codex', icon: 'codex', defaultCommand: 'codex', isExpanded: true, tasks };
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <Sidebar isCollapsed={isCollapsed} groups={[group]} workspacePath="D:/GitHub/OneAI" activeTaskId="side-a" unreadTaskIds={new Set(['side-a', 'side-b'])}
          onSwitchWorkspace={() => {}} onSelectTask={() => {}} onToggleGroup={() => {}} onReorderGroup={() => {}}
          onNewTask={(id) => window.events.push('quick:' + id)} onCustomNewTask={(id) => window.events.push('custom:' + id)}
          onCloseTask={(id) => window.events.push('close:' + id)} onRenameTask={() => {}}
          onReorderTask={(_g, source, target) => window.events.push('reorder:' + source + '>' + target)}
          onRestartTask={(id) => window.events.push('restart:' + id)} onOpenTaskDirectory={(id) => window.events.push('open:' + id)} />
      </div>));
    };
    window.termRef = React.createRef();
    window.drawTerm = (id, groupId = 'codex') => {
      const tasks = [{ id, groupId, title: id, status: 'running', cwd: 'D:/GitHub/OneAI', createdAt: 1 }];
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <button id="outside-button" type="button">outside</button>
        <TerminalViewport ref={window.termRef} theme="dark" tasks={tasks} activeTaskId={id} />
      </div>));
    };
    window.drawPreview = (line, openedAt) => {
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <FilePreviewPanel cwd="D:/x" filePath="a.ts" line={line} openedAt={openedAt} width={400} onResize={() => {}} onClose={() => {}} />
      </div>));
    };
    // 链接定位：返回 text 中 needle 对应的链接范围
    window.linkProbe = async (cols, text, needle, row) => {
      const host = document.body.appendChild(document.createElement('div'));
      host.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:600px';
      const term = new Terminal({ cols, rows: 10 });
      term.open(host);
      await new Promise(done => term.write(text, done));
      const logical = getLogicalLine(term, row);
      const range = logical && matchToLinkRange(logical, logical.text.indexOf(needle), needle.length, row);
      host.remove(); term.dispose();
      return range;
    };
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, outfile: new URL('fixture.js', dir).pathname.replace(/^\/(\w:)/, '$1'), platform: 'browser',
});
const css = await postcss([tailwind(config)]).process(await fs.readFile('src/renderer/src/index.css', 'utf8'), { from: 'src/renderer/src/index.css' });
await fs.writeFile(new URL('fixture.css', dir), css.css + await fs.readFile('node_modules/@xterm/xterm/css/xterm.css', 'utf8'));
await fs.writeFile(new URL('fixture.html', dir), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
await fs.writeFile(new URL('electron-check.cjs', dir), `
const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) console.error(message); });
  try {
    await win.loadFile(require('node:path').join(__dirname, 'fixture.html'));
    const result = await win.webContents.executeJavaScript(\`(async () => {
      const results = [];
      const check = (name, ok) => results.push({ name, ok });
      const byTitle = text => [...document.querySelectorAll('button')].find(b => b.title.includes(text));
      const task = () => document.querySelector('button[aria-current]');
      check('task title >= 13px', parseFloat(getComputedStyle(task()).fontSize) >= 13);
      check('greeting >= 12px', parseFloat(getComputedStyle(document.querySelector('[aria-live]')).fontSize) >= 12);
      check('search visible by default', byTitle('搜索关键词').getClientRects().length > 0);
      task().focus();
      await new Promise(r => setTimeout(r, 250));
      check('close visible when task focused', getComputedStyle(document.querySelector('button[aria-label="关闭 Task 1: UI regression"]')).opacity === '1');
      const colors = [];
      for (const theme of ['dark', 'light']) {
        document.documentElement.dataset.theme = theme;
        const panel = getComputedStyle(document.querySelector('header')).backgroundColor;
        colors.push(panel);
        check(theme + ' header/sidebar same panel', panel === getComputedStyle(document.querySelector('aside > div')).backgroundColor);
      }
      check('theme colors change', colors[0] !== colors[1]);
      for (const [status, label] of Object.entries({ starting: '启动中', running: '运行中', idle: '空闲', waiting: '等待输入', stopped: '已停止', error: '启动失败' })) {
        window.draw(status);
        check(status + ' Chinese label', document.querySelector('header').textContent.includes(label));
        check(status + ' accessible task button', task().tagName === 'BUTTON');
        check(status + ' restart disabled', [...document.querySelectorAll('header button')].find(b => b.title.includes('当前终端') || b.title.includes('正在启动')).disabled === (status === 'starting'));
        if (status === 'running') check('running dot static', getComputedStyle(task().querySelector('span')).animationName === 'none');
        if (status === 'starting') {
          const restart = byTitle('正在启动');
          check('starting restart visibly disabled', restart.disabled && Number(getComputedStyle(restart).opacity) < 1);
        }
        if (status === 'error') check('error colors match', getComputedStyle(task().querySelector('span')).backgroundColor === getComputedStyle(document.querySelector('header span.border')).color);
      }
      window.draw();
      task().focus();
      return results;
    })()\`);
    // DevTools 输入直接进入 Chromium，避免隐藏窗口无法获得 Windows 前台焦点。
    win.webContents.debugger.attach('1.3');
    const key = async (key, code, virtualKey, text) => {
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey, ...(text ? { text } : {}) });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
    };
    await key('Enter', 'Enter', 13, '\\r');
    await new Promise(r => setTimeout(r, 100));
    result.push({ name: 'Enter selects task', ok: await win.webContents.executeJavaScript("window.events.includes('select')") });
    await key('Tab', 'Tab', 9);
    result.push({ name: 'Tab reaches close button', ok: await win.webContents.executeJavaScript("document.activeElement.getAttribute('aria-label') === '关闭 Task 1: UI regression'") });
    await key(' ', 'Space', 32, ' ');
    result.push({ name: 'Space closes task', ok: await win.webContents.executeJavaScript("window.events.includes('close')") });
    await win.webContents.executeJavaScript("document.querySelector('button[aria-expanded]').focus()");
    await key('Enter', 'Enter', 13, '\\r');
    result.push({ name: 'Enter toggles group', ok: await win.webContents.executeJavaScript("window.events.includes('toggle')") });
    for (const width of [900, 1100, 1280, 1440, 1920]) {
      win.setSize(width, 900);
      await win.webContents.executeJavaScript('window.setMaximized(' + (width === 1920) + ')');
      await new Promise(r => setTimeout(r, 150));
      // 时钟在窄顶栏中会被收起；仍然可见的工具、时钟、额度必须依次排开且不超出顶栏
      result.push({ name: width + ' toolbar/clock/quota do not overlap', ok: await win.webContents.executeJavaScript(\`(() => {
        const header = document.querySelector('header').getBoundingClientRect();
        const rects = ['oneai-terminal-tools', 'oneai-topbar-clock', 'oneai-topbar-quota']
          .map(id => document.getElementById(id).getBoundingClientRect()).filter(rect => rect.width > 0);
        const quota = document.getElementById('oneai-topbar-quota');
        return rects.length >= 2 && rects.every((rect, i) => rect.left >= header.left && rect.right <= (rects[i + 1]?.left ?? header.right))
          && quota.scrollWidth <= quota.clientWidth;
      })()\`) });
    }
    result.push({ name: 'maximized topbar keeps clock and quota reset time', ok: await win.webContents.executeJavaScript(\`
      document.getElementById('oneai-topbar-clock').getClientRects().length > 0 && document.querySelector('.quota-detail').getClientRects().length > 0\`) });
    await win.webContents.executeJavaScript("window.draw(); document.querySelector('button[aria-current]').focus()");
    await key('F2', 'F2', 113);
    await win.webContents.debugger.sendCommand('Input.insertText', { text: '重命名后的任务' });
    await key('Enter', 'Enter', 13, '\\r');
    result.push({ name: 'F2 renames task', ok: await win.webContents.executeJavaScript("window.events.includes('rename:重命名后的任务')") });
    // 侧栏交互：待查看标记、右键菜单、中键关闭、键盘与拖拽排序、一键新建与自定义新建
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const tick = () => new Promise(r => setTimeout(r, 100));
      const row = id => document.querySelector('[data-task-id="side-' + id + '"]');
      const menuText = () => document.querySelector('[role="menu"]')?.textContent || '';
      const item = text => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes(text));
      const rightClick = el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 120 }));
      window.events = [];
      window.drawSidebar(); await tick();
      check('background task shows unread marker', row('b').textContent.includes('待查看'));
      check('active task shows no unread marker', !row('a').textContent.includes('待查看'));
      document.querySelector('button[aria-label="新建 Codex 任务"]').click();
      check('group plus button creates directly', window.events.includes('quick:codex'));
      rightClick(document.querySelector('[data-group-row] > div')); await tick();
      check('group menu offers quick and custom create', menuText().includes('新建任务') && menuText().includes('自定义命令与目录'));
      item('自定义').click(); await tick();
      check('group menu opens custom create', window.events.includes('custom:codex') && !document.querySelector('[role="menu"]'));
      rightClick(row('b')); await tick();
      check('task menu lists all actions', ['重命名', '重启终端', '复制工作目录', '在资源管理器中打开', '关闭任务'].every(t => menuText().includes(t)));
      item('重启终端').click(); await tick();
      check('task menu restarts the clicked task', window.events.includes('restart:side-b'));
      rightClick(row('b')); await tick();
      item('在资源管理器中打开').click(); await tick();
      check('task menu opens the task directory', window.events.includes('open:side-b'));
      row('b').dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      check('middle click closes the task', window.events.includes('close:side-b'));
      row('a').querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
      check('Alt+ArrowDown reorders the task', window.events.includes('reorder:side-a>side-b'));
      window.events = [];
      row('a').querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
      check('Alt+ArrowUp on the first task does nothing', window.events.length === 0);
      const dt = new DataTransfer();
      const drag = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      drag(row('b'), 'dragstart'); await tick();
      drag(row('a'), 'dragover'); await tick();
      drag(row('a'), 'drop'); await tick();
      check('dragging a task onto another reorders them', window.events.includes('reorder:side-b>side-a'));
      window.drawSidebar(true); await tick();
      const strip = id => document.querySelector('button[data-task-id="side-' + id + '"]');
      check('collapsed strip marks unread task', strip('b').getAttribute('aria-label').includes('待查看') && !strip('a').getAttribute('aria-label').includes('待查看'));
      check('collapsed strip unread differs from active', getComputedStyle(strip('b')).backgroundColor !== getComputedStyle(strip('a')).backgroundColor);
      return checks;
    })()\`));
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok });
      const tick = () => new Promise(r => setTimeout(r, 100));
      window.ptyWrites = [];
      Object.assign(window.electronAPI, {
        writeSession: async (id, text) => { window.ptyWrites.push({ id, text }); },
        resizeSession: async () => {}, getSessionBuffer: async () => '',
        onSessionData: () => () => {}, onSessionExit: () => () => {},
      });
      window.drawTerm('paste-a'); await tick();
      window.electronAPI.readPasteContent = async () => ({ content: '粘贴一次' });
      const pasteKey = new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true, bubbles: true, cancelable: true });
      [...document.querySelectorAll('.xterm-helper-textarea')].find(t => t.offsetParent).dispatchEvent(pasteKey); await tick();
      check('Ctrl+V blocks native paste so text is written once', pasteKey.defaultPrevented && window.ptyWrites.filter(w => w.text === '粘贴一次').length === 1);
      window.draw(); await tick();
      return checks;
    })()\`));
    // 模拟输入法组合输入：xterm 每次按键后都会把 textarea 写回真实光标，定位点必须始终留在输入框文字末尾（第 20 行第 8 列）。
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    for (const [kind, expected] of [['kimi', '8,20'], ['pi', '5,20']]) for (const mode of ['line', 'status']) {
      await win.webContents.executeJavaScript('window.imeProbe(' + JSON.stringify(mode) + ',' + JSON.stringify(kind) + ')');
      for (const text of ['n', 'ni', 'nih']) {
        await win.webContents.debugger.sendCommand('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
        await new Promise(r => setTimeout(r, 60));
      }
      const seen = await win.webContents.executeJavaScript('window.imeProbeDone()');
      result.push({ name: kind + ' IME anchor stays at input position, real cursor at ' + mode, ok: seen.length === 1 && seen[0] === expected });
    }
    // 终端搜索（高亮、计数、无效正则）与 Shift+Enter 换行
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok });
      const wait = (ms = 300) => new Promise(r => setTimeout(r, ms));
      window.ptyWrites = [];
      window.electronAPI.writeSession = async (id, text) => { window.ptyWrites.push({ id, text }); };
      window.electronAPI.getSessionBuffer = async () => 'hello world' + String.fromCharCode(13, 10) + 'hello again' + String.fromCharCode(13, 10);
      window.drawTerm('search-a'); await wait();
      const textarea = () => [...document.querySelectorAll('.xterm-helper-textarea')].find(t => t.offsetParent);
      const press = (init) => { const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); textarea().dispatchEvent(e); return e; };
      const shiftEnter = press({ key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true }); await wait(100);
      check('Shift+Enter sends ESC+CR instead of submitting', shiftEnter.defaultPrevented && window.ptyWrites.length === 1 && window.ptyWrites[0].text === String.fromCharCode(27, 13));
      press({ key: 'F', code: 'KeyF', keyCode: 70, ctrlKey: true, shiftKey: true }); await wait(100);
      const input = () => document.querySelector('input[aria-label="在终端中搜索"]');
      const type = (value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), value); input().dispatchEvent(new Event('input', { bubbles: true })); };
      const status = () => document.querySelector('[role="search"] [role="status"]')?.textContent || '';
      type('hello'); await wait();
      check('terminal search counts matches', /^[12]\\\\/2$/.test(status()));
      type('zzz'); await wait();
      check('terminal search reports no result', status() === '无结果');
      document.querySelector('button[aria-label="使用正则表达式"]').click(); await wait(100);
      type('('); await wait();
      check('terminal search tolerates invalid regex', status() === '正则无效');
      window.termRef.current.closeSearch(); await wait(100);
      let copied = null;
      window.electronAPI.writeClipboardText = async (text) => { copied = text; return true; };
      const exported = await window.termRef.current.exportActiveTerminalLog('copy');
      check('export copies rendered terminal text', exported.success && copied === 'hello world' + String.fromCharCode(10) + 'hello again');
      window.ptyWrites = [];
      window.drawTerm('plain-a', 'terminal'); await wait();
      const plainEnter = press({ key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true }); await wait(100);
      check('Shift+Enter is left alone in plain shell tasks', !window.ptyWrites.some(w => w.text === String.fromCharCode(27, 13)));
      const cjk = await window.linkProbe(100, '你好 https://example.com/a', 'https://example.com/a', 1);
      check('link range counts CJK as two columns', cjk && cjk.start.x === 6 && cjk.start.y === 1 && cjk.end.x === 26 && cjk.end.y === 1);
      const longUrl = 'https://example.com/' + 'a'.repeat(50);
      const wrapped = await window.linkProbe(40, 'see ' + longUrl, longUrl, 2);
      check('link range spans wrapped lines', wrapped && wrapped.start.x === 5 && wrapped.start.y === 1 && wrapped.end.x === 34 && wrapped.end.y === 2);
      window.ptyWrites = [];
      window.drawTerm('focus-a'); await wait();
      document.getElementById('outside-button').focus();
      return checks;
    })()\`));
    // 焦点在按钮上时直接打字：焦点交还终端，字符只写入一次
    await key('a', 'KeyA', 65, 'a');
    await new Promise(r => setTimeout(r, 200));
    result.push({ name: 'typing with focus on a button goes to the terminal once', ok: await win.webContents.executeJavaScript("document.activeElement.classList.contains('xterm-helper-textarea') && window.ptyWrites.filter(w => w.text === 'a').length === 1 && window.ptyWrites.length === 1") });
    await win.webContents.executeJavaScript("document.getElementById('outside-button').focus()");
    await key(' ', 'Space', 32, ' ');
    await new Promise(r => setTimeout(r, 100));
    result.push({ name: 'Space on a focused button stays on the button', ok: await win.webContents.executeJavaScript("document.activeElement.id === 'outside-button' && window.ptyWrites.length === 1") });
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok });
      const wait = (ms = 150) => new Promise(r => setTimeout(r, ms));
      let reads = 0;
      window.electronAPI.readPreviewFile = async () => { reads++; return { kind: 'text', path: 'a.ts', size: 13, content: ['one', 'two', 'three'].join(String.fromCharCode(10)) }; };
      window.drawPreview(2, 1); await wait();
      const highlighted = () => [...document.querySelectorAll('pre div')].find(d => d.className.includes('bg-accent'));
      check('preview highlights the clicked line', reads === 1 && highlighted()?.textContent === 'two');
      check('preview text is selectable', getComputedStyle(document.querySelector('pre')).userSelect === 'text');
      window.drawPreview(2, 2); await wait();
      check('preview re-reads the file when clicked again', reads === 2);
      document.querySelector('button[aria-label="重新读取文件"]').click(); await wait();
      check('preview refresh button re-reads the file', reads === 3 && highlighted()?.textContent === 'two');
      return checks;
    })()\`));
    console.log(JSON.stringify(result, null, 2));
    app.exit(result.every(r => r.ok) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
`);
const child = spawn(electron, [new URL('electron-check.cjs', dir).pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'inherit', windowsHide: true });
process.exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', code => resolve(code ?? 1));
});
