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
    import { NewTaskModal } from './src/renderer/src/components/NewTaskModal';
    import { HistoryModal } from './src/renderer/src/components/HistoryModal';
    import { UsageModal } from './src/renderer/src/components/UsageModal';
    import { SettingsModal } from './src/renderer/src/components/SettingsModal';
    import { Terminal } from '@xterm/xterm';
    window.electronAPI = { onWindowMaximizedChange: callback => { window.setMaximized = callback; return () => {}; }, isWindowMaximized: async () => false,
      onSystemStats: callback => { window.pushStats = callback; return () => {}; },
      // 路径里带 logged 的账号视为已登录；账号相关桩不使用反斜杠，避免外层模板字符串转义
      checkAccountLogin: async account => ({ loggedIn: account.configDir.indexOf('logged') >= 0, detail: account.configDir.indexOf('logged') >= 0 ? 'me@example.com' : undefined }),
      selectWorkspaceDirectory: async () => 'C:/picked/dir',
      listSessionHistory: async () => { const h = (id, cliId, title, cwd, ago) => ({ id, cliId, title, cwd, updatedAt: Date.now() - ago, command: 'x' }); return [h('h1', 'codex', 'Today one', 'D:/GitHub/OneAI', 60000), h('h2', 'claude', 'Yesterday one', 'D:/plan', 86400000 + 3600000 * 2), h('h3', 'kimi', 'Old one', 'D:/old', 10 * 86400000)]; },
      getGitBranches: async (dirs) => Object.fromEntries(dirs.map((d) => [d, d === 'D:/GitHub/OneAI' ? 'main' : null])),
      getUsageStats: async () => window.usageFixture(window.usageEmpty),
      deleteSessionHistory: async () => ({ deleted: 0, failed: 0 }) };
    // 用量面板夹具：近 26 周的每日请求数（每 3 天一个非零值，最大 39），以及三个 CLI 的模型行
    window.usageEmpty = false;
    window.usageFixture = (empty) => {
      const pad = n => String(n).padStart(2, '0');
      const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const now = new Date();
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const start = new Date(monday);
      start.setDate(start.getDate() - 7 * 25);
      const days = [];
      for (let i = 0; i < 182; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const requests = empty ? 0 : (i % 3 === 0 ? i % 40 : 0);
        days.push({ date: key(d), requests, byCli: requests ? { claude: requests } : {} });
      }
      const rows = empty ? [] : [
        { cliId: 'claude', model: 'Sonnet 5.5', requests: 246, sessions: 3, input: 546, output: 560666, cacheRead: 104684416, cacheWrite: 1044518 },
        { cliId: 'codex', model: 'gpt-5.5', requests: 21, sessions: 1, input: 93118, output: 1569, cacheRead: 1235456, cacheWrite: 0 },
        { cliId: 'agy', model: 'Gemini 4 Hydrogen', requests: 103, sessions: 9, input: 1160400, output: 111017, cacheRead: 11419012, cacheWrite: 0 },
      ];
      return { generatedAt: Date.now(), weekStart: monday.getTime(), rows, days };
    };
    // 顶栏系统资源的最宽取值：CPU 100%、内存 31.9 GB、上行 999K/s、下行 99.9M/s
    window.fakeStats = { cpuPercent: 100, memUsedBytes: 31.9 * 1024 ** 3, memTotalBytes: 32 * 1024 ** 3, netUpBytesPerSec: 999 * 1024, netDownBytesPerSec: 99.9 * 1024 ** 2 };
    const root = createRoot(document.getElementById('root'));
    window.events = [];
    const CLIS = [
      { id: 'codex', name: 'Codex', icon: 'codex', defaultCommand: 'codex' },
      { id: 'claude', name: 'Claude Code', icon: 'claude', defaultCommand: 'claude' },
      { id: 'terminal', name: '系统终端', icon: 'terminal', defaultCommand: 'powershell.exe' },
    ];
    window.draw = (status = 'running', accountName) => {
      const task = { id: 'task', groupId: 'codex', title: 'Task 1: UI regression', status, cwd: 'D:/GitHub/OneAI', createdAt: 1 };
      const group = CLIS[0];
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <Sidebar isCollapsed={false} clis={CLIS} folders={[{ path: task.cwd, isExpanded: true }]} tasks={[task]} activeTaskId={task.id}
          onAddFolder={() => {}} onSelectTask={() => window.events.push('select')} onToggleFolder={() => window.events.push('toggle')}
          onReorderFolder={() => {}} onNewTask={() => {}} onCloseTask={() => window.events.push('close')} onRenameTask={(_id, title) => window.events.push('rename:' + title)} />
        <div className="flex-1 min-w-0"><Topbar isSidebarCollapsed={false} onToggleSidebar={() => {}} currentGroup={group} activeTask={task} accountName={accountName}
          quota={{ status: 'online', cliName: 'Codex', model: 'gpt-5-codex', effort: 'high', tokens: 866_000, costUsd: 0.24, fiveHourPercent: 82, sevenDayPercent: 65, fiveHourResetsIn: '2h 45m', sevenDayResetsOn: 'Sun' }} onRefreshQuota={async () => {}} onOpenSearch={() => window.events.push('search')}
          onClearScreen={() => {}} onRestartSession={async () => {}} onExportLogs={async () => ({ success: true })} onOpenHistory={() => {}} onOpenUsage={() => window.events.push('usage')} /></div>
      </div>));
      window.pushStats?.(window.fakeStats);
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
    // 侧栏交互：OneAI 文件夹里 a 为当前任务、b 为后台待查看任务；sports 里有一个 Claude 任务；empty 没有任务
    const keyOf = (p) => p.toLowerCase().split('/').join(String.fromCharCode(92));
    const mkTask = (id, groupId, cwd, extra = {}) => ({ id, groupId, title: id, status: 'idle', cwd, createdAt: 1, ...extra });
    window.drawSidebar = (isCollapsed = false, clockOffset = 0) => {
      const tasks = [mkTask('side-a', 'codex', 'D:/GitHub/OneAI', { title: 'Side a' }), mkTask('side-b', 'codex', 'D:/GitHub/OneAI', { title: 'Side b' }), mkTask('side-c', 'claude', 'D:/sports', { title: 'Side c' }), mkTask('side-d', 'claude', 'D:/sports', { title: 'Side d' }), mkTask('side-t', 'terminal', 'D:/sports', { title: 'Side t' })];
      const folders = [{ path: 'D:/GitHub/OneAI', isExpanded: true }, { path: 'D:/sports', isExpanded: true }, { path: 'D:/empty', isExpanded: true }];
      const entry = (id, cliId, title, ago) => ({ id, cliId, title, cwd: 'D:/plan', updatedAt: Date.now() - ago, command: cliId + ' resume ' + id });
      const recent = [{ key: keyOf('D:/plan'), path: 'D:/plan', updatedAt: Date.now() - 3600000, total: 7, entries: [entry('h1', 'codex', 'History one', 3600000), entry('h2', 'claude', 'History two', 7200000)] }];
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <Sidebar isCollapsed={isCollapsed} clis={CLIS} folders={folders} tasks={tasks} activeTaskId="side-a" unreadTaskIds={new Set(['side-a', 'side-b'])}
          gitBranches={{ [keyOf('D:/GitHub/OneAI')]: 'main', [keyOf('D:/sports')]: 'feature/x', [keyOf('D:/plan')]: 'dev' }} recentFolders={recent}
          clockOffsetHours={clockOffset} summaries={{ 'side-a': { text: 'Fix the login bug' }, 'side-b': { text: null }, 'side-c': { text: 'long '.repeat(40).trim() } }}
          onAddFolder={() => window.events.push('add-folder')} onSelectTask={(id) => window.events.push('select:' + id)}
          onToggleFolder={(p) => window.events.push('toggle:' + p)} onReorderFolder={(s, t) => window.events.push('reorder-folder:' + s + '>' + t)}
          onNewTask={(p, cli, acc) => window.events.push('quick:' + p + ':' + cli + (acc ? ':' + acc : ''))} onCustomNewTask={(p) => window.events.push('custom:' + p)}
          onCloseTask={(id) => window.events.push('close:' + id)} onRenameTask={() => {}}
          onReorderTask={(s, t) => window.events.push('reorder:' + s + '>' + t)}
          onRestartTask={(id) => window.events.push('restart:' + id)} onOpenFolder={(p) => window.events.push('open:' + p)} onRemoveFolder={(p) => window.events.push('remove:' + p)}
          onResumeHistory={(e) => window.events.push('resume:' + e.id)} onOpenHistory={() => window.events.push('history')} />
      </div>));
    };
    // 多账号：侧栏徽标与菜单、新建任务弹窗、设置页账号管理
    window.accountsFixture = [{ id: 'acc-alt', cliId: 'codex', name: 'alt', configDir: 'C:/Users/me/.codex-alt' }];
    window.drawAccountSidebar = () => {
      const tasks = [mkTask('acc-plain', 'codex', 'D:/GitHub/OneAI'), mkTask('acc-with', 'codex', 'D:/GitHub/OneAI', { accountId: 'acc-alt' }), mkTask('acc-gone', 'codex', 'D:/GitHub/OneAI', { accountId: 'acc-deleted' })];
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <Sidebar isCollapsed={false} clis={CLIS} folders={[{ path: 'D:/GitHub/OneAI', isExpanded: true }]} tasks={tasks} activeTaskId="acc-plain" accounts={window.accountsFixture}
          onAddFolder={() => {}} onSelectTask={() => {}} onToggleFolder={() => {}} onReorderFolder={() => {}}
          onNewTask={(p, cli, acc) => window.events.push('quick:' + p + ':' + cli + (acc ? ':' + acc : ''))} onCustomNewTask={() => {}} onCloseTask={() => {}} />
      </div>));
    };
    window.drawNewTask = (accounts) => {
      const existing = [mkTask('n1', 'codex', 'D:/GitHub/OneAI', { title: 'Task 4' }), mkTask('n2', 'codex', 'D:/other', { title: 'Task 9' })];
      flushSync(() => root.render(<div className="workbench-ui h-screen"><NewTaskModal isOpen onClose={() => {}} clis={CLIS} initialCliId="codex" folderPath="D:/GitHub/OneAI" tasks={existing} accounts={accounts}
        onCreate={async (cli, title, command, cwd, accountId) => { window.events.push('create:' + cli + ':' + (accountId || 'default') + ':' + title + ':' + command + ':' + cwd); return { success: true }; }} /></div>));
    };
    function SettingsHarness() {
      const [settings, setSettings] = React.useState({ theme: 'dark', voiceReminderEnabled: true, workReminderHours: 1, terminalFontSize: 15, terminalLineHeight: 1.3, uiScale: 'comfortable', terminalCursorStyle: 'bar', terminalCursorBlink: true, musicDirectory: '', musicPlayerVisible: true, clockOffsetHours: 0, accounts: [] });
      window.currentAccounts = () => settings.accounts;
      return <SettingsModal isOpen onClose={() => {}} settings={settings} onUpdateSettings={setSettings} onResetDefault={() => {}} onLoginAccount={(a) => window.events.push('login:' + a.name)} />;
    }
    window.drawSettings = () => flushSync(() => root.render(<div className="workbench-ui h-screen"><SettingsHarness /></div>));
    window.drawUsage = () => flushSync(() => root.render(<div className="workbench-ui h-screen"><UsageModal key={String(window.usageEmpty)} isOpen onClose={() => {}} accounts={[]} /></div>));
    window.drawHistory = (open) => flushSync(() => root.render(<div className="workbench-ui h-screen"><HistoryModal isOpen onClose={() => {}} onResume={(e) => window.events.push('resume:' + e.id)} openHistoryIds={new Set(open)} /></div>));
    window.drawTermMany = (count, active) => {
      const tasks = Array.from({ length: count }, (_, i) => ({ id: 'many-' + i, groupId: 'terminal', title: 'm' + i, status: 'running', cwd: 'D:/GitHub/OneAI', createdAt: 1 }));
      flushSync(() => root.render(<div className="workbench-ui flex h-screen"><TerminalViewport theme="dark" tasks={tasks} activeTaskId={'many-' + active} /></div>));
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
      const brand = document.querySelector('aside > div').textContent;
      check('sidebar brand header shows name, tagline and version', brand.includes('OneAI') && brand.includes('All agents in one.') && /v[0-9]+[.][0-9]+[.][0-9]+/.test(brand));
      check('search visible by default', byTitle('搜索关键词').getClientRects().length > 0);
      check('topbar and sidebar brand header are drag regions, their buttons are not', getComputedStyle(document.querySelector('header')).webkitAppRegion === 'drag' && getComputedStyle(document.querySelector('aside > div')).webkitAppRegion === 'drag' && getComputedStyle(byTitle('搜索关键词')).webkitAppRegion === 'no-drag');
      task().focus();
      await new Promise(r => setTimeout(r, 250));
      check('close visible when task focused', getComputedStyle(document.querySelector('button[aria-label="关闭 Task 1: UI regression"]')).opacity === '1');
      const colors = [];
      // 新增编辑器配色：正文、次要文字与点缀色在面板 / 画布上的对比度（WCAG 相对亮度）须达到下限
      const NEW_THEMES = ['darcula', 'material', 'monokai', 'mariana', 'breakers', 'solarized-dark', 'solarized-light', 'cobalt'];
      const rgbOf = name => getComputedStyle(document.documentElement).getPropertyValue('--color-' + name).trim().split(' ').map(Number);
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
      for (const theme of NEW_THEMES) {
        document.documentElement.dataset.theme = theme;
        const low = [['fg', 'canvas', 6], ['fg', 'panel', 5.5], ['fg-muted', 'canvas', 4.5], ['fg-subtle', 'panel', 4], ['fg-faint', 'panel', 3.5], ['accent', 'panel', 3.5], ['accent', 'canvas', 3.5], ['success', 'canvas', 3.5], ['danger', 'canvas', 3.5], ['warning', 'canvas', 3.5]]
          .filter(([fg, bg, min]) => ratio(rgbOf(fg), rgbOf(bg)) < min).map(([fg, bg, min]) => fg + ' on ' + bg + ' ' + ratio(rgbOf(fg), rgbOf(bg)).toFixed(2) + ' < ' + min);
        check(theme + ' text and accent colors keep enough contrast' + (low.length ? ' [' + low.join('; ') + ']' : ''), low.length === 0);
      }
      for (const theme of ['dark', ...NEW_THEMES, 'light']) {
        document.documentElement.dataset.theme = theme;
        const panel = getComputedStyle(document.querySelector('header')).backgroundColor;
        colors.push(panel);
        check(theme + ' header/sidebar same panel', panel === getComputedStyle(document.querySelector('aside > div')).backgroundColor);
      }
      check('theme colors change (dark, light, Darcula and Sublime Material all differ)', new Set(colors).size === colors.length);
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
    result.push({ name: 'Enter toggles folder', ok: await win.webContents.executeJavaScript("window.events.includes('toggle')") });
    // 顶栏带账号徽标时再扫一遍各宽度，确认徽标不会把任务名挤没
    await win.webContents.executeJavaScript("window.draw('running', '工作账号')");
    for (const width of [900, 1100, 1280, 1440, 1920, 2400, 2800]) {
      win.setSize(width, 900);
      await win.webContents.executeJavaScript('window.setMaximized(' + (width >= 1920) + ')');
      await new Promise(r => setTimeout(r, 150));
      // 工具、时钟、额度、系统资源、历史按钮中仍然可见的块必须依次排开且不超出顶栏；任务名至少保留 48px（最窄 900 的窗口除外）
      result.push({ name: width + ' topbar blocks do not overlap', ok: await win.webContents.executeJavaScript(\`(() => {
        const header = document.querySelector('header').getBoundingClientRect();
        const rects = ['oneai-terminal-tools', 'oneai-topbar-clock', 'oneai-topbar-quota', 'oneai-topbar-sys']
          .map(id => document.getElementById(id).getBoundingClientRect()).filter(rect => rect.width > 0);
        rects.push(document.querySelector('header button[aria-label="查看本周用量"]').getBoundingClientRect());
        rects.push(document.querySelector('header button[aria-label="查看历史会话"]').getBoundingClientRect());
        const quota = document.getElementById('oneai-topbar-quota');
        return rects.length >= 3 && rects.every((rect, i) => rect.left >= header.left && rect.right <= (rects[i + 1]?.left ?? header.right))
          && quota.scrollWidth <= quota.clientWidth;
      })()\`) });
      if (width === 1280 || width === 1440) result.push({ name: width + ' topbar still shows the account badge (visible, not just in the DOM)', ok: await win.webContents.executeJavaScript("document.querySelector('.topbar-account').getClientRects().length > 0") });
      if (width > 900) result.push({ name: width + ' task title keeps at least 48px', ok: await win.webContents.executeJavaScript("document.querySelector('header .truncate[title]').getBoundingClientRect().width >= 48") });
    }
    result.push({ name: 'topbar at 2800 shows clock, usage and all system stats', ok: await win.webContents.executeJavaScript(\`
      ['#oneai-topbar-clock', '.quota-usage', '.topbar-sys-cpu', '.topbar-sys-mem', '.topbar-sys-net'].every(sel => document.querySelector(sel).getClientRects().length > 0)\`) });
    win.setSize(1920, 900);
    await win.webContents.executeJavaScript('window.setMaximized(true)');
    await new Promise(r => setTimeout(r, 150));
    result.push({ name: 'maximized 1920 topbar keeps usage, system stats and reset time', ok: await win.webContents.executeJavaScript(\`
      ['#oneai-topbar-sys', '.quota-usage', '.quota-detail', '.topbar-account'].every(sel => document.querySelector(sel).getClientRects().length > 0)\`) });
    result.push({ name: 'topbar usage and system text content', ok: await win.webContents.executeJavaScript(\`(() => {
      const quota = document.getElementById('oneai-topbar-quota').textContent;
      const sys = document.getElementById('oneai-topbar-sys').textContent;
      return quota.includes('Tokens: 866k') && quota.includes('Cost: $0.24') && quota.includes('5h: 82%') && quota.includes('Model: gpt-5-codex')
        && sys.includes('CPU: 100%') && sys.includes('Mem: 31.9 GB') && sys.includes('↑999K/s') && sys.includes('↓99.9M/s');
    })()\`) });
    await win.webContents.executeJavaScript("window.draw(); document.querySelector('button[aria-current]').focus()");
    await key('F2', 'F2', 113);
    await win.webContents.debugger.sendCommand('Input.insertText', { text: '重命名后的任务' });
    await key('Enter', 'Enter', 13, '\\r');
    result.push({ name: 'F2 renames task', ok: await win.webContents.executeJavaScript("window.events.includes('rename:重命名后的任务')") });
    // 侧栏交互：文件夹树、Git 分支、「+」CLI 菜单、右键菜单、中键关闭、键盘与拖拽排序（任务只能在文件夹内、文件夹整体排序）、最近任务
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const tick = () => new Promise(r => setTimeout(r, 100));
      const row = id => document.querySelector('[data-task-id="side-' + id + '"]');
      const folderRows = () => [...document.querySelectorAll('[data-folder-row]')];
      const menuText = () => document.querySelector('[role="menu"]')?.textContent || '';
      const item = text => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes(text));
      const rightClick = el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 120 }));
      const dt = new DataTransfer();
      const drag = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      window.events = [];
      window.drawSidebar(); await tick();
      check('background task shows unread marker', row('b').textContent.includes('待查看'));
      check('active task shows no unread marker', !row('a').textContent.includes('待查看'));
      check('task rows show the CLI name for screen readers', row('c').textContent.includes('Claude Code'));
      check('current task section counts all tasks', document.querySelector('aside').textContent.includes('当前任务5'));
      const summaryOf = id => row(id).querySelector('[data-task-summary]');
      check('a task with a session shows its latest message on a second line', summaryOf('a')?.textContent === 'Fix the login bug');
      check('a task with no message yet shows the new-session line with its start time', /^新会话 · [0-9]{2}:[0-9]{2}$/.test(summaryOf('b')?.textContent || ''));
      const hourOf = () => Number((summaryOf('b').textContent.match(/([0-9]{2}):[0-9]{2}/) || [])[1]);
      const hour0 = hourOf();
      window.drawSidebar(false, 5); await tick();
      check('the new-session time follows the clock offset setting', hourOf() === (hour0 + 5) % 24, hour0 + ' -> ' + hourOf());
      window.drawSidebar(); await tick();
      check('a task whose summary is not read yet reserves the line without text', summaryOf('d') && summaryOf('d').textContent.trim() === '' && summaryOf('d').getBoundingClientRect().height > 0);
      check('CLIs without readable sessions stay single-line', !summaryOf('t'));
      check('a long message is truncated to one line instead of wrapping', summaryOf('c').scrollWidth > summaryOf('c').clientWidth && summaryOf('c').getBoundingClientRect().height < 24);
      check('badges and the order number stay right-aligned in both single- and two-line rows', ['a', 't'].every(id => { const btn = row(id).querySelector('button'); const num = row(id).querySelector('.font-mono'); return btn.getBoundingClientRect().right - num.getBoundingClientRect().right < 12; }));
      check('second-line text is at least 12px', parseFloat(getComputedStyle(summaryOf('a')).fontSize) >= 12);
      check('two-line rows are taller than single-line rows', row('a').getBoundingClientRect().height > row('t').getBoundingClientRect().height + 8);
      check('the status dot is still the first span of a two-line task button', getComputedStyle(row('a').querySelector('button span')).borderRadius !== '0px' && row('a').querySelector('button span').className.includes('rounded-full'));
      check('three folder rows with names and counts', folderRows().length === 3 && folderRows()[0].textContent.includes('OneAI') && folderRows()[1].textContent.includes('sports') && folderRows()[2].textContent.includes('empty'));
      check('git branch badges on folders that are repos only', folderRows()[0].querySelector('[data-git-branch]')?.textContent === 'main' && folderRows()[1].querySelector('[data-git-branch]')?.textContent === 'feature/x' && !folderRows()[2].querySelector('[data-git-branch]'));
      folderRows()[0].querySelector('button[aria-expanded]').click();
      check('clicking a folder toggles it', window.events.includes('toggle:D:/GitHub/OneAI'));

      document.querySelector('button[aria-label="在 OneAI 中新建任务"]').click(); await tick();
      check('folder plus opens the CLI menu', ['Codex', 'Claude Code', '自定义命令与目录'].every(t => menuText().includes(t)) && !menuText().includes('在资源管理器中打开'));
      item('Claude Code').click(); await tick();
      check('choosing a CLI creates a task in that folder', window.events.includes('quick:D:/GitHub/OneAI:claude') && !document.querySelector('[role="menu"]'));
      rightClick(folderRows()[0].firstElementChild); await tick();
      check('folder menu offers new task and folder actions', ['Codex', '自定义命令与目录', '在资源管理器中打开', '复制路径', '从侧栏移除文件夹'].every(t => menuText().includes(t)));
      item('自定义').click(); await tick();
      check('folder menu opens custom create for that folder', window.events.includes('custom:D:/GitHub/OneAI') && !document.querySelector('[role="menu"]'));
      rightClick(folderRows()[0].firstElementChild); await tick();
      item('在资源管理器中打开').click(); await tick();
      check('folder menu opens the folder', window.events.includes('open:D:/GitHub/OneAI'));
      rightClick(folderRows()[1].firstElementChild); await tick();
      item('从侧栏移除文件夹').click(); await tick();
      check('folder menu removes the clicked folder', window.events.includes('remove:D:/sports'));
      const placeholder = [...folderRows()[2].querySelectorAll('button')].find(b => b.textContent.trim() === '新建任务');
      check('an empty folder offers a create placeholder', Boolean(placeholder));
      placeholder.click(); await tick();
      check('the placeholder opens the CLI menu', menuText().includes('Claude Code'));
      document.body.click(); await tick();

      window.events = [];
      rightClick(row('b')); await tick();
      check('task menu lists all actions', ['重命名', '重启终端', '复制工作目录', '在资源管理器中打开', '关闭任务'].every(t => menuText().includes(t)));
      item('重启终端').click(); await tick();
      check('task menu restarts the clicked task', window.events.includes('restart:side-b'));
      rightClick(row('b')); await tick();
      item('在资源管理器中打开').click(); await tick();
      check('task menu opens the task directory', window.events.includes('open:D:/GitHub/OneAI'));
      row('b').dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      check('middle click closes the task', window.events.includes('close:side-b'));
      row('a').querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
      check('Alt+ArrowDown reorders the task', window.events.includes('reorder:side-a>side-b'));
      window.events = [];
      row('a').querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
      row('b').querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
      check('Alt+Arrow at a folder edge does nothing (tasks never leave their folder)', window.events.length === 0);
      drag(row('b'), 'dragstart'); await tick();
      drag(row('a'), 'dragover'); await tick();
      drag(row('a'), 'drop'); await tick();
      check('dragging a task onto another in the same folder reorders them', window.events.includes('reorder:side-b>side-a'));
      window.events = [];
      drag(row('b'), 'dragstart'); await tick();
      drag(row('c'), 'dragover'); await tick();
      drag(row('c'), 'drop'); await tick();
      drag(row('b'), 'dragend'); await tick();
      check('dropping a task onto another folder does nothing', window.events.length === 0);
      const grip = i => folderRows()[i].querySelector('button[draggable]');
      grip(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
      check('Alt+ArrowDown on a folder handle moves the folder', window.events.includes('reorder-folder:D:/GitHub/OneAI>D:/sports'));
      window.events = [];
      drag(grip(0), 'dragstart'); await tick();
      drag(folderRows()[1], 'dragover'); await tick();
      drag(folderRows()[1], 'drop'); await tick();
      check('dragging a folder onto another reorders the folders', window.events.includes('reorder-folder:D:/GitHub/OneAI>D:/sports'));

      const recentSection = document.querySelector('[data-recent-section]');
      check('recent section lists folders collapsed by default', recentSection && recentSection.textContent.includes('最近任务') && recentSection.textContent.includes('plan') && !recentSection.querySelector('[data-history-id]'));
      check('recent folder shows its git branch and session total', recentSection.querySelector('[data-git-branch]')?.textContent === 'dev' && recentSection.textContent.includes('7'));
      recentSection.querySelector('button[aria-expanded]').click(); await tick();
      check('expanding a recent folder lists its sessions and the remainder', recentSection.querySelectorAll('[data-history-id]').length === 2 && recentSection.textContent.includes('还有 5 个'));
      window.events = [];
      recentSection.querySelector('[data-history-id="h1"]').click();
      check('clicking a recent session resumes it', window.events.includes('resume:h1'));
      [...recentSection.querySelectorAll('button')].find(b => b.textContent.includes('还有 5 个')).click();
      check('the remainder link opens the full history', window.events.includes('history'));
      [...document.querySelectorAll('aside button')].find(b => b.textContent.includes('添加文件夹')).click();
      check('add folder button asks the app to pick a folder', window.events.includes('add-folder'));

      window.drawSidebar(true); await tick();
      const strip = id => document.querySelector('button[data-task-id="side-' + id + '"]');
      check('collapsed strip marks unread task', strip('b').getAttribute('aria-label').includes('待查看') && !strip('a').getAttribute('aria-label').includes('待查看'));
      check('collapsed strip unread differs from active', getComputedStyle(strip('b')).backgroundColor !== getComputedStyle(strip('a')).backgroundColor);
      check('collapsed strip has one button per folder', document.querySelectorAll('[data-folder-strip]').length === 3);
      document.querySelector('[data-folder-strip]').click(); await tick();
      check('collapsed folder button opens the CLI menu', menuText().includes('Claude Code'));
      return checks;
    })()\`));
    // 终端按需创建：只为选中过的任务创建 xterm 实例，避免 WebGL 上下文随任务数量溢出
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const tick = (ms = 300) => new Promise(r => setTimeout(r, ms));
      for (const [name, fn] of [['getSessionBuffer', async () => ''], ['writeSession', async () => {}], ['resizeSession', async () => {}], ['onSessionData', () => () => {}], ['onSessionExit', () => () => {}]]) if (!window.electronAPI[name]) window.electronAPI[name] = fn;
      window.drawTermMany(20, 0); await tick();
      check('only the active task gets a terminal instance at startup', document.querySelectorAll('.xterm').length === 1);
      window.drawTermMany(20, 5); await tick();
      check('selecting another task creates its terminal and keeps the first one alive', document.querySelectorAll('.xterm').length === 2);
      return checks;
    })()\`));
    // 历史会话抽屉
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
      window.events = [];
      window.drawHistory(['h2']); await tick(400);
      const groups = [...document.querySelectorAll('[data-history-group]')].map(e => e.textContent);
      check('history is split into today / yesterday / earlier', groups.join('|') === '今天|昨天|更早');
      const rows = [...document.querySelectorAll('[data-history-group] ~ div, [data-history-group] + div')];
      const text = document.body.textContent;
      check('rows show folder name and relative time instead of the full path', text.includes('OneAI') && !text.includes('D:/GitHub/OneAI') && text.includes('分钟前'));
      check('git branch badge only on repositories', document.querySelectorAll('[data-git-branch]').length === 1 && document.querySelector('[data-git-branch]').textContent.includes('main'));
      check('sessions that already have a task are marked as open', document.querySelectorAll('[data-history-open]').length === 1);
      const historySearch = document.querySelector('input[placeholder="搜索标题或目录"]');
      historySearch.blur(); await tick(50);
      const borderBlurred = getComputedStyle(historySearch.parentElement).borderColor;
      historySearch.focus(); await tick(50);
      check('history search box shows no focus outline or highlighted border', (getComputedStyle(historySearch).outlineStyle === 'none' || getComputedStyle(historySearch).outlineColor === 'rgba(0, 0, 0, 0)') && getComputedStyle(historySearch.parentElement).borderColor === borderBlurred);
      const cliSelect = document.querySelector('select[aria-label="按 CLI 筛选"]');
      check('history CLI filter is a dropdown with all CLIs', cliSelect && [...cliSelect.options].map(o => o.textContent).join('|') === '全部|Codex|Claude Code|Antigravity|Pi|Kimi Code');
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Today one')).click();
      check('clicking a session resumes it', window.events.includes('resume:h1'));
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('删除列表中全部')).click(); await tick();
      check('delete-all confirmation says it deletes the local session files', document.body.textContent.includes('同时删除本机会话文件'));
      return checks;
    })()\`));
    // 本周用量面板与每日方块图
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
      const pad = n => String(n).padStart(2, '0');
      const today = new Date();
      const todayKey = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
      window.usageEmpty = false;
      window.drawUsage(); await tick(400);
      const text = document.body.textContent;
      check('usage panel lists each model with its CLI', document.querySelectorAll('[data-usage-row]').length === 3 && text.includes('Sonnet 5.5') && text.includes('Gemini 4 Hydrogen') && text.includes('Antigravity') && text.includes('Codex'));
      const fixture = window.usageFixture(false);
      const requests = fixture.rows.reduce((sum, r) => sum + r.requests, 0);
      check('usage summary shows the weekly request total', document.querySelector('[data-usage-summary]').textContent.includes(String(requests)));
      check('usage tokens are shown in compact units', text.includes('105.7M'));
      const cells = [...document.querySelectorAll('[data-usage-cell]')];
      check('heatmap has one cell per day for 26 weeks', cells.length === 182);
      const column = document.querySelector('[data-usage-cell]').parentElement;
      check('each heatmap column is one week (7 cells, Monday first)', column.querySelectorAll('[data-usage-cell]').length === 7 && new Date(cells[0].dataset.date + 'T00:00:00').getDay() === 1);
      const levels = new Set(cells.map(c => c.dataset.level));
      check('heatmap uses all four green levels plus the empty level', ['0', '1', '2', '3', '4'].every(l => levels.has(l)));
      const level4 = cells.find(c => c.dataset.level === '4');
      const level0 = cells.find(c => c.dataset.level === '0');
      const level1 = cells.find(c => c.dataset.level === '1');
      check('busier days are drawn in a stronger green than empty days', getComputedStyle(level4).backgroundColor !== getComputedStyle(level0).backgroundColor && getComputedStyle(level4).backgroundColor !== getComputedStyle(level1).backgroundColor);
      check('days after today are marked as future and have no tooltip', cells.filter(c => c.dataset.date > todayKey).every(c => c.dataset.level === 'future' && !c.title) && cells.filter(c => c.dataset.date <= todayKey).every(c => c.dataset.level !== 'future'));
      check('today is outlined', cells.filter(c => c.className.includes('ring-1')).map(c => c.dataset.date).join() === todayKey);
      check('a cell tooltip gives the date and request count', level4.title.includes(level4.dataset.date) && level4.title.includes('次请求'));
      const grid = document.querySelector('[data-usage-heatmap]');
      check('heatmap fits inside the modal without horizontal scrolling', grid.parentElement.scrollWidth <= grid.parentElement.clientWidth);
      window.usageEmpty = true;
      window.drawUsage(); await tick(400);
      check('empty week shows a hint and an all-empty heatmap', Boolean(document.querySelector('[data-usage-empty]')) && [...document.querySelectorAll('[data-usage-cell]')].every(c => c.dataset.level === '0' || c.dataset.level === 'future'));
      window.usageEmpty = false;
      return checks;
    })()\`));
    // 多账号
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
      const item = text => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes(text));
      const row = id => document.querySelector('[data-task-id="' + id + '"]');
      window.events = [];
      window.drawAccountSidebar(); await tick();
      check('task row shows the account name', row('acc-with').textContent.includes('alt'));
      check('default-account task shows no account badge', !row('acc-plain').querySelector('[title^="账号"]') && !row('acc-plain').textContent.includes('账号已删除'));
      check('task whose account was deleted is flagged', row('acc-gone').textContent.includes('账号已删除'));
      document.querySelector('[data-folder-row] > div').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 120 })); await tick();
      check('folder menu offers create with an account under its CLI', Boolean(item('用 alt 新建')));
      item('用 alt 新建').click(); await tick();
      check('create with an account passes the folder, CLI and account id', window.events.includes('quick:D:/GitHub/OneAI:codex:acc-alt'));
      window.events = [];
      window.drawNewTask([]); await tick();
      check('no account select when the CLI has no accounts', !document.getElementById('new-task-account'));
      check('new task modal pre-selects the CLI and names the task after the folder', document.getElementById('new-task-cli').value === 'codex' && document.getElementById('new-task-title').value === 'Task 5' && document.getElementById('new-task-cwd').value === 'D:/GitHub/OneAI');
      window.drawNewTask(window.accountsFixture); await tick();
      const select = document.getElementById('new-task-account');
      check('new task modal offers default plus configured accounts', select && [...select.options].map(o => o.textContent).join('|') === '默认账号|alt');
      select.value = 'acc-alt'; select.dispatchEvent(new Event('change', { bubbles: true })); await tick();
      document.getElementById('new-task-form').requestSubmit(); await tick();
      check('new task modal submits the chosen account', window.events.some(e => e.startsWith('create:codex:acc-alt:')));
      window.events = [];
      window.drawNewTask(window.accountsFixture); await tick();
      const cliSelect = document.getElementById('new-task-cli');
      cliSelect.value = 'claude'; cliSelect.dispatchEvent(new Event('change', { bubbles: true })); await tick();
      check('switching the CLI resets the command and hides the other CLI account choice', document.getElementById('new-task-command').value === 'claude' && !document.getElementById('new-task-account'));
      document.getElementById('new-task-form').requestSubmit(); await tick();
      check('new task modal submits the chosen CLI with its default command', window.events.includes('create:claude:default:Task 5:claude:D:/GitHub/OneAI'));

      window.drawSettings(); await tick();
      const names = label => [...document.querySelectorAll('[aria-label="' + label + '"] button')].map(b => b.textContent.trim()).join('|');
      check('settings lists the eye-care themes', names('护眼主题色') === '豆沙绿|羊皮纸|暖夜|北极灰蓝');
      check('settings lists the editor themes (Darcula, Sublime Material and the Sublime Text built-ins)', names('编辑器配色主题') === 'Darcula|Sublime Material|Monokai|Mariana|Breakers|Solarized Dark|Solarized Light|Cobalt');
      const tab =[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('账号'));
      check('settings has an accounts tab', Boolean(tab));
      tab.click(); await tick(300);
      const section = name => document.querySelector('section[aria-label="' + name + ' 账号"]');
      check('accounts page lists Codex, Claude Code and Kimi Code', ['Codex', 'Claude Code', 'Kimi Code'].every(n => section(n)));
      check('accounts page shows only supported CLIs', !document.body.textContent.includes('Antigravity') && document.querySelectorAll('section[aria-label$="账号"]').length === 3);
      check('accounts page shows the add-account steps', document.querySelector('[data-account-guide]')?.querySelectorAll('li').length === 4);
      const setValue = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const addBtn = sec => [...section(sec).querySelectorAll('button')].find(b => b.textContent.includes('添加账号'));
      const submit = () => document.querySelector('form[aria-label="添加账号"], form[aria-label="编辑账号"]').requestSubmit();
      const alertText = () => document.querySelector('[role="alert"]')?.textContent || '';
      const li = () => document.querySelector('li[data-account-id]');
      const fill = async (name, dir, env = '') => { setValue(document.getElementById('account-name'), name); setValue(document.getElementById('account-dir'), dir); setValue(document.getElementById('account-env'), env); await tick(); };
      addBtn('Codex').click(); await tick();
      await fill('alt', 'relative/dir'); submit(); await tick();
      check('relative config dir is rejected', alertText().includes('绝对路径'));
      await fill('alt', 'C:/Users/me/.codex-logged', 'bad line'); submit(); await tick();
      check('invalid extra env line is rejected', alertText().includes('KEY=VALUE'));
      await fill('alt', 'C:/Users/me/.codex-logged', 'HTTPS_PROXY=http://127.0.0.1:7890'); submit(); await tick(300);
      const saved = window.currentAccounts();
      check('saved account is stored with its CLI, dir and env', saved.length === 1 && saved[0].cliId === 'codex' && saved[0].configDir === 'C:/Users/me/.codex-logged' && saved[0].env.includes('HTTPS_PROXY'));
      check('account row shows login status from the CLI', li() && li().textContent.includes('已登录') && li().textContent.includes('me@example.com'));
      addBtn('Codex').click(); await tick();
      await fill('ALT', 'C:/Users/me/.codex-other'); submit(); await tick();
      check('duplicate account name is rejected case-insensitively', alertText().includes('同名'));
      await fill('alt2', 'c:/users/me/.codex-logged/'); submit(); await tick();
      check('duplicate config dir is rejected', alertText().includes('已被'));
      [...document.querySelectorAll('form[aria-label="添加账号"] button')].find(b => b.textContent.trim() === '取消').click(); await tick();
      check('cancel closes the form without adding', !document.querySelector('form[aria-label="添加账号"]') && window.currentAccounts().length === 1);
      [...li().querySelectorAll('button')].find(b => b.textContent.includes('登录')).click();
      check('login button asks the app to start the login task', window.events.includes('login:alt'));
      li().querySelector('button[aria-label^="编辑"]').click(); await tick();
      await fill('alt-renamed', 'C:/Users/me/.codex-logged'); submit(); await tick(300);
      check('editing keeps the account id and updates the name', window.currentAccounts().length === 1 && window.currentAccounts()[0].id === saved[0].id && window.currentAccounts()[0].name === 'alt-renamed');
      addBtn('Kimi Code').click(); await tick();
      await fill('kimi-b', 'C:/Users/me/.kimi-b'); submit(); await tick(300);
      const kimi = window.currentAccounts().find(a => a.cliId === 'kimi');
      check('a Kimi account can be added and shows not logged in', kimi && section('Kimi Code').textContent.includes('未登录'));
      li().querySelector('button[aria-label^="删除"]').click(); await tick();
      check('delete asks for confirmation first', li().textContent.includes('确认删除') && window.currentAccounts().length === 2);
      [...li().querySelectorAll('button')].find(b => b.textContent.includes('确认删除')).click(); await tick();
      check('confirmed delete removes only that account', window.currentAccounts().length === 1 && window.currentAccounts()[0].cliId === 'kimi');
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
