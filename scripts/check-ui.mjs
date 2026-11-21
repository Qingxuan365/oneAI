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
    import { OnboardingModal } from './src/renderer/src/components/OnboardingModal';
    import { THEME_IDS } from './src/shared/types';
    import { setLanguage, t } from './src/renderer/src/i18n';
    window.ALL_THEMES = [...THEME_IDS];
    import { Terminal } from '@xterm/xterm';
    import { installDropGuard } from './src/renderer/src/dropGuard';
    installDropGuard();
    window.electronAPI = { getHomeDir: () => 'C:/Users/tester', onWindowMaximizedChange: callback => { window.setMaximized = callback; return () => {}; }, isWindowMaximized: async () => false,
      onSystemStats: callback => { window.pushStats = callback; return () => {}; },
      // 路径里带 logged 的账号视为已登录；账号相关桩不使用反斜杠，避免外层模板字符串转义
      checkAccountLogin: async account => ({ loggedIn: account.configDir.indexOf('logged') >= 0, detail: account.configDir.indexOf('logged') >= 0 ? 'me@example.com' : undefined }),
      selectWorkspaceDirectory: async () => 'C:/picked/dir',
      listSessionHistory: async (accounts) => { const h = (id, cliId, title, cwd, ago, extra = {}) => ({ id, cliId, title, cwd, updatedAt: Date.now() - ago, command: 'x', ...extra }); const base = [h('h1', 'codex', 'Today one', 'D:/GitHub/OneAI', 60000), h('h2', 'claude', 'Yesterday one', 'D:/plan', 86400000 + 3600000 * 2), h('h3', 'kimi', 'Old one', 'D:/old', 10 * 86400000)]; return Array.isArray(accounts) && accounts.length ? [h('h-acc', 'codex', 'Account session', 'D:/acc', 30000, { accountId: accounts[0].id, accountName: accounts[0].name }), ...base] : base; },
      getGitBranches: async (dirs) => Object.fromEntries(dirs.map((d) => [d, d === 'D:/GitHub/OneAI' ? 'main' : null])),
      getUsageStats: async () => window.usageFixture(window.usageEmpty),
      deleteSessionHistory: async () => ({ deleted: 0, failed: 0 }) };
    // 用量面板夹具：近 26 周的每日请求数（每 3 天一个非零值，最大 39），以及三个 CLI 的模型行
    window.usageEmpty = false;
    window.usageMany = false;
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
        days.push({ date: key(d), requests, by: requests ? { 'claude:default': requests } : {} });
      }
      // 带账号的夹具：Codex 有默认账号和 alt 账号，Claude 与 Antigravity 只有默认账号
      if (!empty) days[100] = { date: days[100].date, requests: 9, by: { 'claude:default': 2, 'codex:default': 3, 'codex:alt-id': 4 } };
      const accounts = empty ? [] : [
        { cliId: 'claude', accountId: 'default', name: t('默认账号') },
        { cliId: 'codex', accountId: 'default', name: t('默认账号') },
        { cliId: 'codex', accountId: 'alt-id', name: 'alt' },
        { cliId: 'agy', accountId: 'default', name: t('默认账号') },
        { cliId: 'pi', accountId: 'default', name: t('默认账号') },
      ];
      const D = { accountId: 'default', get accountName() { return t('默认账号'); } };
      const rows = empty ? [] : [
        { cliId: 'claude', ...D, model: 'Sonnet 5.5', requests: 246, sessions: 3, input: 546, output: 560666, cacheRead: 104684416, cacheWrite: 1044518 },
        { cliId: 'codex', ...D, model: t('自动审查 (codex-auto-review)'), subagent: true, requests: 21, sessions: 1, input: 93118, output: 1569, cacheRead: 1235456, cacheWrite: 0 },
        { cliId: 'codex', accountId: 'alt-id', accountName: 'alt', model: 'gpt-5.5', requests: 12, sessions: 1, input: 50000, output: 4000, cacheRead: 600000, cacheWrite: 0 },
        { cliId: 'codex', ...D, model: 'gpt-5.5', requests: 30, sessions: 2, input: 193118, output: 11569, cacheRead: 2235456, cacheWrite: 0 },
        { cliId: 'agy', ...D, model: 'Gemini 4 Hydrogen', requests: 103, sessions: 9, input: 1160400, output: 111017, cacheRead: 11419012, cacheWrite: 0 },
        { cliId: 'pi', ...D, model: 'deepseek-chat', requests: 35, sessions: 4, input: 20000, output: 9000, cacheRead: 300000, cacheWrite: 0 },
      ];
      // 模型很多的情形：再补 17 行，验证弹窗内容超出高度时出现滚动
      if (!empty && window.usageMany) for (let i = 0; i < 17; i++) rows.push({ cliId: 'claude', ...D, model: 'Model ' + i, requests: 5, sessions: 1, input: 1000, output: 2000, cacheRead: 3000, cacheWrite: 0 });
      return { generatedAt: Date.now(), weekStart: monday.getTime(), accounts, rows, days };
    };
    // 顶栏系统资源的最宽取值：CPU 100%、内存 31.9 GB、上行 999K/s、下行 99.9M/s
    window.fakeStats = { cpuPercent: 100, memUsedBytes: 31.9 * 1024 ** 3, memTotalBytes: 32 * 1024 ** 3, netUpBytesPerSec: 999 * 1024, netDownBytesPerSec: 99.9 * 1024 ** 2 };
    const root = createRoot(document.getElementById('root'));
    window.events = [];
    const CLIS = [
      { id: 'codex', name: 'Codex', icon: 'codex', defaultCommand: 'codex' },
      { id: 'claude', name: 'Claude Code', icon: 'claude', defaultCommand: 'claude' },
      { id: 'terminal', get name() { return t('系统终端'); }, icon: 'terminal', defaultCommand: 'powershell.exe' },
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
          dateVisible={!window.hideDate} onClearScreen={() => {}} onRestartSession={async () => {}} onExportLogs={async () => ({ success: true })} onOpenHistory={() => {}} onOpenUsage={() => window.events.push('usage')} /></div>
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
    // withMusic：带一条在线音乐，用于检查折叠侧栏时播放器不被卸载
    const MUSIC_STREAMS = [{ id: 'm1', name: 'Test radio', url: 'https://example.com/test.mp3' }];
    window.drawSidebar = (isCollapsed = false, clockOffset = 0, withMusic = false, customWidth = null) => {
      const tasks = [mkTask('side-a', 'codex', 'D:/GitHub/OneAI', { title: 'Side a' }), mkTask('side-b', 'codex', 'D:/GitHub/OneAI', { title: 'Side b' }), mkTask('side-c', 'claude', 'D:/sports', { title: 'Side c' }), mkTask('side-d', 'claude', 'D:/sports', { title: 'Side d', status: 'stopped' }), mkTask('side-t', 'terminal', 'D:/sports', { title: 'Side t' })];
      const folders = [{ path: 'D:/GitHub/OneAI', isExpanded: true }, { path: 'D:/sports', isExpanded: true }, { path: 'D:/empty', isExpanded: true }];
      const entry = (id, cliId, title, ago) => ({ id, cliId, title, cwd: 'D:/plan', updatedAt: Date.now() - ago, command: cliId + ' resume ' + id });
      const recent = [{ key: keyOf('D:/plan'), path: 'D:/plan', updatedAt: Date.now() - 3600000, total: 7, entries: [entry('h1', 'codex', 'History one', 3600000), entry('h2', 'claude', 'History two', 7200000)] }];
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <Sidebar isCollapsed={isCollapsed} width={customWidth} clis={CLIS} folders={folders} tasks={tasks} activeTaskId="side-a" unreadTaskIds={new Set(['side-a', 'side-b'])}
          gitBranches={{ [keyOf('D:/GitHub/OneAI')]: 'main', [keyOf('D:/sports')]: 'feature/x', [keyOf('D:/plan')]: 'dev' }} recentFolders={recent}
          clockOffsetHours={clockOffset} summaries={{ 'side-a': { text: 'Fix the login bug' }, 'side-b': { text: null }, 'side-c': { text: 'long '.repeat(40).trim() } }}
          onResizeWidth={(w) => window.events.push('resize:' + w)} onResetWidth={() => window.events.push('reset-width')}
          onToggleCollapse={() => window.events.push('toggle-collapse')}
          onToggleAllFolders={(expand) => window.events.push('toggle-all:' + expand)}
          onClearStoppedTasks={(p) => window.events.push('clear-stopped:' + p)}
          onPinRecentFolder={(p) => window.events.push('pin-recent:' + p)}
          onAddFolder={() => window.events.push('add-folder')} onSelectTask={(id) => window.events.push('select:' + id)}
          onToggleFolder={(p) => window.events.push('toggle:' + p)} onReorderFolder={(s, t) => window.events.push('reorder-folder:' + s + '>' + t)}
          onNewTask={(p, cli, acc) => window.events.push('quick:' + p + ':' + cli + (acc ? ':' + acc : ''))} onCustomNewTask={(p) => window.events.push('custom:' + p)}
          onCloseTask={(id) => window.events.push('close:' + id)} onRenameTask={() => {}}
          onReorderTask={(s, t) => window.events.push('reorder:' + s + '>' + t)}
          onRestartTask={(id) => window.events.push('restart:' + id)} onOpenFolder={(p) => window.events.push('open:' + p)} onRemoveFolder={(p) => window.events.push('remove:' + p)}
          onResumeHistory={(e) => window.events.push('resume:' + e.id)} onOpenHistory={() => window.events.push('history')}
          musicStreams={withMusic ? MUSIC_STREAMS : undefined} />
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
    window.drawNewTask = (accounts, initialAccountId) => {
      const existing = [mkTask('n1', 'codex', 'D:/GitHub/OneAI', { title: 'Task 4' }), mkTask('n2', 'codex', 'D:/other', { title: 'Task 9' })];
      flushSync(() => root.render(<div className="workbench-ui h-screen">
        <button id="outside-modal-btn" type="button">outside</button>
        <NewTaskModal isOpen onClose={() => {}} clis={CLIS} initialCliId="codex" initialAccountId={initialAccountId} folderPath="D:/GitHub/OneAI" tasks={existing} accounts={accounts}
          onCreate={async (cli, title, command, cwd, accountId) => { window.events.push('create:' + cli + ':' + (accountId || 'default') + ':' + title + ':' + command + ':' + cwd); return { success: true }; }} />
      </div>));
    };
    function SettingsHarness() {
      const [settings, setSettings] = React.useState({ theme: 'dark', voiceReminderEnabled: true, workReminderHours: 1, terminalFontSize: 15, terminalLineHeight: 1.3, uiScale: 'comfortable', terminalCursorStyle: 'bar', terminalCursorBlink: true, previewMinimap: true, musicDirectory: '', musicPlayerVisible: true, musicStreams: [], clockOffsetHours: 0, topbarDateVisible: true, language: 'zh-CN', onboardingDone: true, accounts: [], customClis: [] });
      setLanguage(settings.language);
      window.currentSettings = () => settings;
      window.currentCustomClis = () => settings.customClis;
      window.currentAccounts = () => settings.accounts;
      return <SettingsModal isOpen onClose={() => {}} settings={settings} onUpdateSettings={setSettings} onResetDefault={() => {}} onLoginAccount={(a) => window.events.push('login:' + a.name)}
        fallbackKnownClis={[{ id: 'codex', name: 'Codex', command: 'codex' }, { id: 'claude', name: 'Claude Code', command: 'claude' }, { id: 'opencode', name: 'OpenCode', command: 'opencode' }, { id: 'grok', name: 'Grok Build', command: 'grok' }]} installed={{ codex: true, claude: true }}
        onCustomClisChange={(list) => setSettings((prev) => ({ ...prev, customClis: list }))} onRedetectClis={() => window.events.push('redetect')} />;
    }
    function OnboardingHarness({ clis }) {
      const [language, setLang] = React.useState('en');
      setLanguage(language);
      return <OnboardingModal isOpen language={language} onLanguageChange={(l) => { window.events.push('lang:' + l); setLang(l); }} detectedClis={clis} defaultFolder="C:/Users/tester" onAddFolder={() => window.events.push('add-folder')} onFinish={() => window.events.push('onboarding-finish')} />;
    }
    window.setUiLanguage = setLanguage;
    window.drawOnboarding = (clis) => flushSync(() => root.render(<div className="workbench-ui h-screen"><OnboardingHarness clis={clis} /></div>));
    window.drawSettings = () => flushSync(() => root.render(<div className="workbench-ui h-screen"><SettingsHarness /></div>));
    window.drawUsage = () => flushSync(() => root.render(<div className="workbench-ui h-screen"><UsageModal key={String(window.usageEmpty) + String(window.usageMany)} isOpen onClose={() => {}} accounts={[]} /></div>));
    window.drawHistory = (open, accounts) => flushSync(() => root.render(<div className="workbench-ui h-screen"><HistoryModal isOpen onClose={() => {}} onResume={(e) => window.events.push('resume:' + e.id + (e.accountId ? ':' + e.accountId : ''))} openHistoryIds={new Set(open)} accounts={accounts} /></div>));
    window.drawTermMany = (count, active) => {
      const tasks = Array.from({ length: count }, (_, i) => ({ id: 'many-' + i, groupId: 'terminal', title: 'm' + i, status: 'running', cwd: 'D:/GitHub/OneAI', createdAt: 1 }));
      flushSync(() => root.render(<div className="workbench-ui flex h-screen"><TerminalViewport theme="dark" tasks={tasks} activeTaskId={'many-' + active} /></div>));
    };
    window.termRef = React.createRef();
    // 记录 xterm 的每次写入（内容与时间），用来检查回显是否立即写入、隐藏终端是否延后写入
    window.xtermWrites = [];
    const originalWrite = Terminal.prototype.write;
    Terminal.prototype.write = function (data, callback) {
      if (typeof data === 'string' && data) window.xtermWrites.push({ data, at: performance.now() });
      return originalWrite.call(this, data, callback);
    };
    // 卸载当前界面：TerminalViewport 在挂载时订阅数据流，换掉 onSessionData 桩后需重新挂载
    window.clearRoot = () => flushSync(() => root.render(<div />));
    // 两个任务：active 可见，另一个隐藏；用于检查隐藏终端的合并写入
    window.drawTermPair = (active) => {
      const tasks = ['pair-a', 'pair-b'].map((id) => ({ id, groupId: 'codex', title: id, status: 'running', cwd: 'D:/GitHub/OneAI', createdAt: 1 }));
      flushSync(() => root.render(<div className="workbench-ui flex h-screen"><TerminalViewport theme="dark" tasks={tasks} activeTaskId={active} /></div>));
    };
    window.drawTerm = (id, groupId = 'codex', status = 'running') => {
      const tasks = [{ id, groupId, title: id, status, cwd: 'D:/GitHub/OneAI', createdAt: 1 }];
      flushSync(() => root.render(<div className="workbench-ui flex h-screen">
        <button id="outside-button" type="button">outside</button>
        <TerminalViewport ref={window.termRef} theme="dark" tasks={tasks} activeTaskId={id} />
      </div>));
    };
    window.drawPreview = (line, openedAt, minimap = true, width = 400, containerWidth = null) => {
      flushSync(() => root.render(<div className="workbench-ui flex h-screen" style={containerWidth ? { width: containerWidth + 'px' } : undefined}>
        {containerWidth && <main id="narrow-term-probe" className="flex-1 min-w-0 h-full" />}
        <FilePreviewPanel cwd="D:/x" filePath="a.ts" line={line} openedAt={openedAt} minimap={minimap} width={width} onResize={(w) => window.events.push('preview-resize:' + w)} onResetWidth={() => window.events.push('preview-reset')} onClose={() => {}} />
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
await build({
  entryPoints: ['src/main/usage-stats.ts'],
  bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'fzstd'],
  outfile: new URL('usage-stats.cjs', dir).pathname.replace(/^\/(\w:)/, '$1'),
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
      // 全部 25 个主题：正文、次要文字与点缀色在面板 / 画布上的对比度（WCAG 相对亮度）须达到下限
      const ALL_THEMES = window.ALL_THEMES;
      const rgbOf = name => getComputedStyle(document.documentElement).getPropertyValue('--color-' + name).trim().split(' ').map(Number);
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
      for (const theme of ALL_THEMES) {
        document.documentElement.dataset.theme = theme;
        const low = [['fg', 'canvas', 6], ['fg', 'panel', 5.5], ['fg-muted', 'canvas', 4.5], ['fg-subtle', 'panel', 4], ['fg-faint', 'panel', 3.5], ['accent', 'panel', 3.5], ['accent', 'canvas', 3.5], ['success', 'canvas', 3.5], ['danger', 'canvas', 3.5], ['warning', 'canvas', 3.5]]
          .filter(([fg, bg, min]) => ratio(rgbOf(fg), rgbOf(bg)) < min).map(([fg, bg, min]) => fg + ' on ' + bg + ' ' + ratio(rgbOf(fg), rgbOf(bg)).toFixed(2) + ' < ' + min);
        check(theme + ' text and accent colors keep enough contrast' + (low.length ? ' [' + low.join('; ') + ']' : ''), low.length === 0);
      }
      for (const theme of ALL_THEMES) {
        document.documentElement.dataset.theme = theme;
        const panel = getComputedStyle(document.querySelector('header')).backgroundColor;
        colors.push(panel);
        check(theme + ' header/sidebar same panel', panel === getComputedStyle(document.querySelector('aside > div')).backgroundColor);
      }
      check('all 25 theme panel colors differ', ALL_THEMES.length === 25 && new Set(colors).size === colors.length);
      for (const [status, label] of Object.entries({ starting: '启动中', running: '运行中', idle: '空闲', waiting: '等待输入', stopped: '已停止', error: '启动失败' })) {
        window.draw(status);
        check(status + ' Chinese label in the sidebar row', task().textContent.includes(label));
        check(status + ' topbar shows no task status', !document.querySelector('header').textContent.includes(label));
        check(status + ' accessible task button', task().tagName === 'BUTTON');
        check(status + ' restart disabled', [...document.querySelectorAll('header button')].find(b => b.title.includes('当前终端') || b.title.includes('正在启动')).disabled === (status === 'starting'));
        const dot = () => task().querySelector('span.rounded-full');
        if (status === 'running') check('running dot spins', getComputedStyle(dot()).animationName === 'spin');
        if (status === 'idle') check('idle dot is hollow', getComputedStyle(dot()).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(dot()).borderTopWidth !== '0px');
        if (status === 'waiting') check('waiting dot is solid', getComputedStyle(dot()).backgroundColor !== 'rgba(0, 0, 0, 0)');
        if (status === 'starting') {
          const restart = byTitle('正在启动');
          check('starting restart visibly disabled', restart.disabled && Number(getComputedStyle(restart).opacity) < 1);
        }
        if (status === 'error') check('error colors match', getComputedStyle(dot()).backgroundColor === getComputedStyle(dot().parentElement).color);
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
    // 窗口尺寸异步生效：先等页面的 innerWidth 追上窗口内容宽度，再留一点时间给容器查询重新布局，避免固定等待造成偶发失败
    const settleSize = async () => {
      for (let i = 0; i < 100; i++) {
        if (await win.webContents.executeJavaScript('window.innerWidth') === win.getContentSize()[0]) break;
        await new Promise(r => setTimeout(r, 30));
      }
      await new Promise(r => setTimeout(r, 200));
    };
    for (const width of [900, 1100, 1280, 1440, 1920, 2400, 2800]) {
      win.setSize(width, 900);
      await win.webContents.executeJavaScript('window.setMaximized(' + (width >= 1920) + ')');
      await settleSize();
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
    await settleSize();
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
      check('the status dot and label follow the task title', (() => { const dot = row('a').querySelector('button span.rounded-full'); const title = row('a').querySelector('button span.truncate'); return Boolean(dot && title) && dot.getBoundingClientRect().left > title.getBoundingClientRect().right && /空闲|运行中|启动中|等待输入|已停止|启动失败/.test(dot.parentElement.textContent); })());
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
      const drawerRect = document.querySelector('[role="dialog"]').getBoundingClientRect();
      check('history drawer starts below the 44px top bar so the window controls stay clickable', drawerRect.top >= 44 && document.querySelector('.modal-overlay').getBoundingClientRect().top >= 44);
      const cliSelect = document.querySelector('select[aria-label="按 CLI 筛选"]');
      check('history CLI filter is a dropdown built from the CLIs present in the history', cliSelect && [...cliSelect.options].map(o => o.textContent).join('|') === '全部|Claude Code|Codex|Kimi Code');
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Today one')).click();
      check('clicking a session resumes it', window.events.includes('resume:h1'));
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('删除列表中全部')).click(); await tick();
      check('delete-all confirmation says it deletes the local session files', document.body.textContent.includes('同时删除本机会话文件'));
      window.events = [];
      window.drawHistory(['acc-alt:h-acc'], window.accountsFixture); await tick(250);
      check('history modal displays configured account sessions with CLI and account label', document.body.textContent.includes('Codex（alt）') && document.body.textContent.includes('Account session'));
      check('history modal marks account-scoped open sessions via accountId:id', document.querySelectorAll('[data-history-open]').length === 1);
      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Account session')).click();
      check('resuming an account history session preserves its accountId', window.events.includes('resume:h-acc:acc-alt'));
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
      check('usage panel lists each model with its CLI', document.querySelectorAll('[data-usage-row]').length === 6 && text.includes('Sonnet 5.5') && text.includes('deepseek-chat') && text.includes('Gemini 4 Hydrogen') && text.includes('Antigravity') && text.includes('Codex'));
      const fixture = window.usageFixture(false);
      const requests = fixture.rows.reduce((sum, r) => sum + r.requests, 0);
      const groupNames = [...document.querySelectorAll('[data-usage-cli]')].map(g => g.textContent.trim());
      check('usage models are grouped under one header per CLI, ordered by tokens', groupNames.length === 4 && groupNames[0].startsWith('Claude Code') && groupNames.some(n => n.startsWith('Codex')) && groupNames.some(n => n.startsWith('Antigravity')) && groupNames.some(n => n.startsWith('Pi')));
      const codexRows = [...document.querySelectorAll('[data-usage-group="codex"] [data-usage-row]')];
      const defaultRows = [...document.querySelectorAll('[data-usage-group="codex"] tr')].reduce((acc, tr) => { if (tr.hasAttribute('data-usage-account')) acc.current = tr.getAttribute('data-usage-account'); else if (tr.hasAttribute('data-usage-row')) (acc[acc.current] = acc[acc.current] || []).push(tr); return acc; }, {});
      check('codex splits into default and alt account sections, each listing its own models', document.querySelectorAll('[data-usage-group="codex"] [data-usage-account]').length === 2 && (defaultRows['default'] || []).length === 2 && (defaultRows['alt-id'] || []).length === 1 && defaultRows['alt-id'][0].textContent.includes('gpt-5.5'));
      check('within the default account the real model comes first and the auto-review sub-session last, tagged', codexRows.length === 3 && defaultRows['default'][0].textContent.includes('gpt-5.5') && defaultRows['default'][1].textContent.includes('codex-auto-review') && defaultRows['default'][1].textContent.includes('子会话') && !defaultRows['default'][0].textContent.includes('子会话'));
      const alt = document.querySelector('[data-usage-account="alt-id"]');
      check('an account section header shows its name and request subtotal', alt.textContent.includes('alt') && alt.textContent.includes('12'));
      check('CLIs with only the default account show no account sections', document.querySelectorAll('[data-usage-group="claude"] [data-usage-account], [data-usage-group="agy"] [data-usage-account], [data-usage-group="pi"] [data-usage-account]').length === 0);
      check('a CLI header shows that CLI request subtotal', document.querySelector('[data-usage-group="codex"] [data-usage-cli]').textContent.includes('63'));
      // 每个 CLI 大类前的折叠按钮可收起 / 展开其下的账号与模型列表
      const codexToggle = () => document.querySelector('[data-usage-group="codex"] [data-usage-cli] button[aria-expanded]');
      const agyToggle = () => document.querySelector('[data-usage-group="agy"] [data-usage-cli] button[aria-expanded]');
      check('each CLI group starts expanded with a collapse button', document.querySelectorAll('[data-usage-cli] button[aria-expanded="true"]').length === 4);
      codexToggle().click(); await tick(100);
      check('clicking a CLI collapse button collapses its account and model rows while keeping the CLI subtotal and other groups', codexToggle().getAttribute('aria-expanded') === 'false' && document.querySelectorAll('[data-usage-group="codex"] [data-usage-account]').length === 0 && document.querySelectorAll('[data-usage-group="codex"] [data-usage-row]').length === 0 && document.querySelector('[data-usage-group="codex"] [data-usage-cli]').textContent.includes('63') && document.querySelectorAll('[data-usage-group="agy"] [data-usage-row]').length === 1);
      codexToggle().click(); await tick(100);
      check('clicking the collapse button again expands the CLI model list back', codexToggle().getAttribute('aria-expanded') === 'true' && document.querySelectorAll('[data-usage-group="codex"] [data-usage-account]').length === 2 && document.querySelectorAll('[data-usage-group="codex"] [data-usage-row]').length === 3);
      document.querySelector('[data-usage-group="agy"] [data-usage-cli]').click(); await tick(100);
      check('clicking the CLI header row also collapses its model list', agyToggle().getAttribute('aria-expanded') === 'false' && document.querySelectorAll('[data-usage-group="agy"] [data-usage-row]').length === 0);
      document.querySelector('[data-usage-group="agy"] [data-usage-cli]').click(); await tick(100);
      check('clicking the CLI header row again expands its model list', agyToggle().getAttribute('aria-expanded') === 'true' && document.querySelectorAll('[data-usage-group="agy"] [data-usage-row]').length === 1);
      const toggleAllBtn = () => [...document.querySelectorAll('section[aria-label="各 CLI 的账号与模型用量"] button')].find(b => b.textContent.includes('全部收起') || b.textContent.includes('全部展开'));
      toggleAllBtn().click(); await tick(100);
      check('collapse-all button collapses every CLI group and flips its label to expand-all', document.querySelectorAll('[data-usage-row]').length === 0 && toggleAllBtn().textContent.includes('全部展开'));
      toggleAllBtn().click(); await tick(100);
      check('expand-all button restores every CLI group', document.querySelectorAll('[data-usage-row]').length === 6 && toggleAllBtn().textContent.includes('全部收起'));
      check('usage overview renders cache share and CLI token share bar, and table wrapper is a focusable region', document.querySelector('[data-usage-summary]').textContent.includes('缓存占比') && Boolean(document.querySelector('[aria-label="Tokens 占比"]')) && document.querySelector('[role="region"][aria-labelledby="usage-table-heading"]')?.tabIndex === 0);
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
      const multi = [...document.querySelectorAll('[data-usage-cell]')].find(c => c.dataset.date === window.usageFixture(false).days[100].date);
      check('a day tooltip lists each CLI account (account name only where a CLI has several)', multi.title.includes('Codex（alt） 4') && multi.title.includes('Codex（默认账号） 3') && multi.title.includes('Claude Code 2') && !multi.title.includes('Claude Code（'));
      const grid = document.querySelector('[data-usage-heatmap]');
      check('heatmap fits inside the modal without horizontal scrolling', grid.parentElement.scrollWidth <= grid.parentElement.clientWidth);
      const gridRect = grid.getBoundingClientRect();
      const cell0Rect = cells[0].getBoundingClientRect();
      const lastCellRect = cells[cells.length - 1].getBoundingClientRect();
      const weekdaySpans = [...grid.firstElementChild.children].slice(1);
      check('heatmap fills the full row width with square cells', Math.abs(gridRect.width - grid.closest('section').getBoundingClientRect().width) <= 4 && Math.abs(lastCellRect.right - gridRect.right) <= 1 && Math.abs(cell0Rect.width - cell0Rect.height) < 1 && cell0Rect.width >= 18);
      check('heatmap weekday labels stay aligned with their rows', [0, 2, 4, 6].every(i => { const a = weekdaySpans[i].getBoundingClientRect(); const b = cells[i].getBoundingClientRect(); return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) <= 2; }));
      const panel = document.querySelector('[role="dialog"]');
      check('usage modal is wide enough for the table and the heatmap (at least 700px)', panel.getBoundingClientRect().width >= 700);
      window.usageMany = true;
      window.drawUsage(); await tick(400);
      const scroller = document.querySelector('[role="dialog"] .overflow-y-auto');
      check('with many models the modal stays within the window and its content scrolls vertically', document.querySelectorAll('[data-usage-row]').length === 23 && getComputedStyle(scroller).overflowY === 'auto' && scroller.scrollHeight > scroller.clientHeight && document.querySelector('[role="dialog"]').getBoundingClientRect().height <= window.innerHeight);
      scroller.scrollTop = scroller.scrollHeight; await tick(50);
      check('the heatmap and footnote are reachable by scrolling', scroller.scrollTop > 0 && document.body.textContent.includes('暂不含 Kimi Code'));
      window.usageMany = false;
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
      const terminalTab = [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('终端'));
      terminalTab.click(); await tick(200);
      const minimapSwitch = () => document.querySelector('[role="switch"][aria-label="显示文件预览小地图"]');
      check('settings has a file-preview minimap switch on the terminal page, on by default', Boolean(minimapSwitch()) && minimapSwitch().getAttribute('aria-checked') === 'true' && document.body.textContent.includes('显示代码缩略图'));
      minimapSwitch().click(); await tick(100);
      check('the minimap switch turns the setting off and on again', window.currentSettings().previewMinimap === false && minimapSwitch().getAttribute('aria-checked') === 'false');
      minimapSwitch().click(); await tick(100);
      check('turning the minimap switch back on restores the setting', window.currentSettings().previewMinimap === true);
      const smoothSwitch = () => document.querySelector('[role="switch"][aria-label="平滑滚动"]');
      check('settings has a smooth-scrolling switch on the terminal page, off by default', Boolean(smoothSwitch()) && smoothSwitch().getAttribute('aria-checked') === 'false');
      smoothSwitch().click(); await tick(100);
      check('the smooth-scrolling switch turns the setting on', window.currentSettings().terminalSmoothScroll === true && smoothSwitch().getAttribute('aria-checked') === 'true');
      smoothSwitch().click(); await tick(100);
      const linkSwitch = () => document.querySelector('[role="switch"][aria-label="单击打开链接"]');
      check('settings has a single-click-links switch, off by default', Boolean(linkSwitch()) && linkSwitch().getAttribute('aria-checked') === 'false');
      linkSwitch().click(); await tick(100);
      check('the single-click-links switch turns the setting on', window.currentSettings().terminalLinkClick === true);
      linkSwitch().click(); await tick(100);
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('外观')).click(); await tick(200);
      const names = label => [...document.querySelectorAll('[aria-label="' + label + '"] button')].map(b => b.textContent.trim()).join('|');
      check('settings lists the eye-care themes', names('护眼主题色') === '豆沙绿|羊皮纸|薰衣草|雾灰|暖夜|北极灰蓝|森夜|墨夜');
      check('settings lists the editor themes (Darcula, Sublime Material, the Sublime Text built-ins, the IDEA themes, Kiro and One Dark)', names('编辑器配色主题') === 'Darcula|Sublime Material|Monokai|Mariana|Breakers|Solarized Dark|Solarized Light|Cobalt|IntelliJ Light|IDEA Light|IDEA Dark|IDEA 高对比度|Kiro Dark|Kiro Light|One Dark');
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
      await fill('alt', 'C:/Users/tester/.codex'); submit(); await tick();
      check('the default account directory cannot be reused for a new account', alertText().includes('默认账号'));
      await fill('alt', '~/.codex'); submit(); await tick();
      check('a ~ path that points at the default account directory is rejected too', alertText().includes('默认账号'));
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
      // 设置 → CLI：自动检测结果与自定义 CLI
      const cliTab = [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'CLI');
      check('settings has a CLI tab', Boolean(cliTab));
      cliTab.click(); await tick();
      const detectedRows = [...document.querySelectorAll('section[aria-label="自动检测的 CLI"] li')];
      const rowOf = id => document.querySelector('li[data-cli-id="' + id + '"]');
      check('CLI page lists the known CLIs without the system terminal', detectedRows.length === 4 && !rowOf('terminal') && rowOf('codex') && rowOf('grok'));
      check('CLI page marks detected and missing CLIs', rowOf('codex').textContent.includes('已安装') && rowOf('opencode').textContent.includes('未检测到'));
      [...document.querySelectorAll('section[aria-label="自动检测的 CLI"] button')].find(b => b.textContent.includes('重新检测')).click();
      check('re-detect button asks the app to detect again', window.events.includes('redetect'));
      const redetectBtn = () => [...document.querySelectorAll('section[aria-label="自动检测的 CLI"] button')].find(b => b.textContent.includes('检测'));
      await tick(50);
      check('re-detect button shows progress while detecting', redetectBtn().disabled && redetectBtn().textContent.includes('检测中'));
      await tick(900);
      check('re-detect button shows a finished hint afterwards', !redetectBtn().disabled && document.querySelector('section[aria-label="自动检测的 CLI"] [role="status"]').textContent.includes('已重新检测'));
      // 数字输入框：可以先清空再输入，时钟可以直接键入负数
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === '提醒').click(); await tick();
      const hoursInput = () => document.querySelector('input[aria-label="工作时长提醒的小时数"]');
      hoursInput().focus(); setValue(hoursInput(), ''); await tick();
      check('reminder hours input can be cleared while typing', hoursInput().value === '');
      setValue(hoursInput(), '5'); await tick();
      check('typing a new value after clearing keeps it', hoursInput().value === '5');
      setValue(hoursInput(), '99'); hoursInput().blur(); await tick();
      check('an out-of-range value is clamped to 12 on blur', hoursInput().value === '12');
      hoursInput().focus(); setValue(hoursInput(), ''); hoursInput().blur(); await tick();
      check('leaving the reminder input empty restores the last valid value', hoursInput().value === '12');
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === '时间').click(); await tick();
      const offsetInput = () => document.querySelector('input[aria-label="顶栏时钟增加的小时数"]');
      offsetInput().focus(); setValue(offsetInput(), '-'); await tick();
      check('clock offset accepts a lone minus sign while typing', offsetInput().value === '-');
      setValue(offsetInput(), '-5'); await tick();
      check('clock offset accepts a negative number typed by keyboard', offsetInput().value === '-5' && document.querySelector('[role="tabpanel"]').textContent.includes('-5 小时'));
      offsetInput().blur(); await tick();
      check('clock offset keeps the committed negative value after blur', offsetInput().value === '-5');
      setValue(offsetInput(), '0'); offsetInput().blur(); await tick();
      // 设置 → 提醒 → 音乐播放器：在线音乐
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === '提醒').click(); await tick();
      const streamGroup = () => document.querySelector('[role="group"][aria-label="在线音乐"]');
      const streamRows = () => [...streamGroup().querySelectorAll('li[data-music-stream-id]')];
      const streamForm = () => streamGroup().querySelector('form[aria-label="添加在线音乐"]');
      const addStream = async (name, url) => { setValue(streamForm().querySelector('input[aria-label="名称（可选）"]'), name); setValue(streamForm().querySelector('input[aria-label="音乐网址"]'), url); await tick(); streamForm().requestSubmit(); await tick(); };
      check('music settings shows the online music block with no built-in links', Boolean(streamGroup()) && streamRows().length === 0 && ![...streamGroup().querySelectorAll('button')].some(b => b.textContent.includes('Radio Paradise')));
      await addStream('', 'ftp://example.com/a.mp3');
      check('a non-http URL is rejected with a message', Boolean(streamGroup().querySelector('[role="alert"]')) && streamRows().length === 0);
      await addStream('', 'https://example.com/live.m3u8');
      check('an HLS .m3u8 URL is rejected', streamGroup().querySelector('[role="alert"]').textContent.includes('m3u8') && streamRows().length === 0);
      await addStream('My radio', 'https://example.com/radio.mp3');
      check('a valid URL is added with its name and the form is cleared', streamRows().length === 1 && streamRows()[0].textContent.includes('My radio') && !streamGroup().querySelector('[role="alert"]') && streamForm().querySelector('input[aria-label="音乐网址"]').value === '');
      await addStream('', 'https://example.com/radio.mp3');
      check('adding the same URL twice is rejected', streamRows().length === 1 && Boolean(streamGroup().querySelector('[role="alert"]')));
      for (let i = 1; i <= 4; i++) await addStream('', 'https://example.com/s' + i + '.mp3');
      const streamList = () => streamGroup().querySelector('ul');
      check('five sources are all visible without a scrollbar', streamRows().length === 5 && streamList().scrollHeight <= streamList().clientHeight + 1);
      await addStream('', 'https://example.com/s5.mp3');
      check('the sixth source makes the list scroll and keeps its height at five rows', streamRows().length === 6 && streamList().scrollHeight > streamList().clientHeight + 1 && Math.abs(streamList().clientHeight - streamRows()[0].offsetHeight * 5) < 12);
      streamRows()[5].querySelector('button[aria-label^="删除"]').click(); await tick();
      check('a music source can be deleted', streamRows().length === 5);
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'CLI').click(); await tick();
      const customAdd = () => [...document.querySelectorAll('section[aria-label="自定义 CLI"] button')].find(b => b.textContent.includes('添加 CLI'));
      const customForm = () => document.querySelector('form[aria-label="添加自定义 CLI"], form[aria-label="编辑自定义 CLI"]');
      const customRow = () => document.querySelector('li[data-custom-cli-id]');
      const cliFill = async (name, command) => { setValue(document.getElementById('custom-cli-name'), name); setValue(document.getElementById('custom-cli-command'), command); await tick(); };
      check('custom CLI section starts empty with a hint', !customRow() && document.querySelector('section[aria-label="自定义 CLI"]').textContent.includes('还没有自定义 CLI'));
      customAdd().click(); await tick();
      await cliFill('', 'mycli'); customForm().requestSubmit(); await tick();
      check('custom CLI without a name is rejected', alertText().includes('名称'));
      await cliFill('Codex', 'mycli'); customForm().requestSubmit(); await tick();
      check('custom CLI cannot reuse a built-in name', alertText().includes('已被内置'));
      await cliFill('My Agent', '   '); customForm().requestSubmit(); await tick();
      check('custom CLI without a command is rejected', alertText().includes('启动命令'));
      await cliFill('My Agent', 'mycli --model fast'); customForm().requestSubmit(); await tick(300);
      const customSaved = window.currentCustomClis();
      check('saved custom CLI keeps its name and full command under a custom- id', customSaved.length === 1 && customSaved[0].name === 'My Agent' && customSaved[0].command === 'mycli --model fast' && customSaved[0].id.startsWith('custom-'));
      check('custom CLI row shows name, command and its detection state', customRow().textContent.includes('My Agent') && customRow().textContent.includes('mycli --model fast') && customRow().textContent.includes('未检测到'));
      customAdd().click(); await tick();
      await cliFill('my agent', 'other'); customForm().requestSubmit(); await tick();
      check('duplicate custom CLI name is rejected case-insensitively', alertText().includes('同名'));
      [...customForm().querySelectorAll('button')].find(b => b.textContent.trim() === '取消').click(); await tick();
      customRow().querySelector('button[aria-label^="编辑"]').click(); await tick();
      await cliFill('My Agent 2', 'mycli --model slow'); customForm().requestSubmit(); await tick(300);
      check('editing a custom CLI keeps its id', window.currentCustomClis().length === 1 && window.currentCustomClis()[0].id === customSaved[0].id && window.currentCustomClis()[0].command === 'mycli --model slow');
      customRow().querySelector('button[aria-label^="删除"]').click(); await tick();
      check('deleting a custom CLI asks first and warns about its tasks', customRow().textContent.includes('确认删除') && customRow().textContent.includes('任务') && window.currentCustomClis().length === 1);
      [...customRow().querySelectorAll('button')].find(b => b.textContent.includes('确认删除')).click(); await tick();
      check('confirmed delete removes the custom CLI', window.currentCustomClis().length === 0 && !customRow());
      // 设置 → 外观 → 语言：立即生效，设置页文案跟着切换
      try {
      const tabLabels = () => [...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim()).join('|');
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('外观')).click(); await tick();
      const langBtn = name => [...document.querySelectorAll('[aria-label="界面语言"] button, [aria-label="Interface language"] button')].find(b => b.textContent.trim() === name);
      check('appearance page offers both languages with the current one pressed', langBtn('简体中文')?.getAttribute('aria-pressed') === 'true' && langBtn('English')?.getAttribute('aria-pressed') === 'false');
      langBtn('English').click(); await tick(300);
      check('choosing English stores the language setting', window.currentSettings().language === 'en');
      check('settings tabs switch to English at once', tabLabels() === 'Appearance|Time|Terminal|Account|CLI|Reminders|Shortcuts');
      check('theme names follow the language', [...document.querySelectorAll('[aria-label="Eye-care theme colors"] button')].map(b => b.textContent.trim()).join('|') === 'Bean Green|Parchment|Lavender|Mist Gray|Warm Night|Arctic Gray Blue|Forest Night|Ink Night');
      const hasCjkS = (txt) => [...txt].some(c => c.charCodeAt(0) >= 0x2e80);
      for (const tabName of ['Time', 'Terminal', 'Account', 'CLI', 'Reminders', 'Shortcuts']) {
        [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === tabName).click(); await tick(250);
        const dlg = document.querySelector('[role="dialog"]');
        const parts = [dlg.textContent, ...[...dlg.querySelectorAll('[title],[aria-label],[placeholder]')].flatMap(e => ['title', 'aria-label', 'placeholder'].map(a => e.getAttribute(a) || ''))];
        const bad = parts.find(hasCjkS) || '';
        check('English settings page ' + tabName + ' has no Chinese' + (bad ? ': ' + bad : ''), !bad);
      }
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'Time').click(); await tick();
      const dateSwitch = () => document.querySelector('button[role="switch"][aria-label="Show date"]');
      check('time page has the top bar date switch, on by default', dateSwitch()?.getAttribute('aria-checked') === 'true');
      dateSwitch().click(); await tick(100);
      check('the date switch turns the setting off', window.currentSettings().topbarDateVisible === false && dateSwitch().getAttribute('aria-checked') === 'false');
      dateSwitch().click(); await tick(100);
      check('the date switch turns it back on', window.currentSettings().topbarDateVisible === true);
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'Account').click(); await tick(300);
      check('accounts page shows the real home directory instead of a fixed path', document.body.textContent.includes('C:/Users/tester') && !document.body.textContent.includes('你'));
      [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'Appearance').click(); await tick();
      langBtn('简体中文').click(); await tick(300);
      check('switching back to Simplified Chinese restores the Chinese labels', tabLabels() === '外观|时间|终端|账号|CLI|提醒|快捷键');
      } catch (e) { check('settings language tests threw: ' + String(e.stack).split(String.fromCharCode(10)).slice(0, 3).join(' | '), false); }
      return checks;
    })()\`));
    // 首次引导（选语言、欢迎页）与顶栏日期开关
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const tick = (ms = 150) => new Promise(r => setTimeout(r, ms));
      window.events.length = 0;
      window.drawOnboarding([{ id: 'codex', name: 'Codex', icon: 'codex' }, { id: 'claude', name: 'Claude Code', icon: 'claude' }]); await tick();
      const dialog = () => document.querySelector('[role="dialog"]');
      const langButtons = () => [...dialog().querySelectorAll('[role="group"] button')];
      check('onboarding opens on the language step with both languages', dialog().textContent.includes('Language') && langButtons().map(b => b.textContent.trim()).join('|') === '简体中文|English');
      check('the preselected language is pressed', langButtons().find(b => b.textContent.trim() === 'English').getAttribute('aria-pressed') === 'true');
      check('onboarding cannot be dismissed with the close button', dialog().querySelector('button[aria-label="Close"]')?.disabled === true);
      langButtons().find(b => b.textContent.trim() === '简体中文').click(); await tick();
      check('picking a language applies it to the dialog straight away', window.events.includes('lang:zh-CN') && dialog().querySelector('[data-onboarding-next]').textContent.trim() === '下一步');
      dialog().querySelector('[data-onboarding-next]').click(); await tick();
      check('the welcome step lists the CLIs detected on this machine', dialog().querySelector('[data-onboarding-step="welcome"]') && [...dialog().querySelectorAll('[data-onboarding-clis] li')].map(li => li.textContent.trim()).join('|') === 'Codex|Claude Code');
      check('the welcome step shows the local default folder', dialog().textContent.includes('C:/Users/tester'));
      [...dialog().querySelectorAll('button')].find(b => b.textContent.includes('添加文件夹')).click();
      check('the add folder button asks the app to pick a folder', window.events.includes('add-folder'));
      dialog().querySelector('[data-onboarding-finish]').click();
      check('get started finishes the onboarding', window.events.includes('onboarding-finish'));
      window.drawOnboarding([]); await tick();
      check('with no CLI found the welcome step explains what to do', dialog().querySelector('[data-onboarding-no-cli]') && !dialog().querySelector('[data-onboarding-clis]'));
      // 英文界面里不应残留中文：扫描文本与 title / aria-label / placeholder 属性
      const hasCjk = (txt) => [...txt].some(c => c.charCodeAt(0) >= 0x2e80);
      const findCjk = (root) => {
        const parts = [root.textContent, ...[...root.querySelectorAll('[title],[aria-label],[placeholder]')].flatMap(e => ['title', 'aria-label', 'placeholder'].map(a => e.getAttribute(a) || ''))];
        const hit = parts.find(hasCjk);
        if (!hit) return '';
        const at = [...hit].findIndex(c => c.charCodeAt(0) >= 0x2e80);
        return '...' + [...hit].slice(Math.max(0, at - 25), at + 25).join('');
      };
      window.setUiLanguage('en');
      for (const [name, fn] of [['main layout', () => window.draw()], ['sidebar', () => window.drawSidebar()], ['collapsed sidebar', () => window.drawSidebar(true)], ['account sidebar', () => window.drawAccountSidebar()], ['usage', () => window.drawUsage()], ['history', () => window.drawHistory([])]]) {
        fn(); await tick(300);
        const bad = findCjk(document.body);
        check('English ' + name + ' has no Chinese' + (bad ? ': ' + bad : ''), !bad);
        if (name === 'usage') {
          const g = document.querySelector('[data-usage-heatmap]');
          check('English usage heatmap fills the row without horizontal overflow', Boolean(g) && g.parentElement.scrollWidth <= g.parentElement.clientWidth && Math.abs(g.getBoundingClientRect().width - g.closest('section').getBoundingClientRect().width) <= 4);
        }
      }
      window.setUiLanguage('zh-CN');
      // 顶栏日期：最大化时显示年月日与星期，设置里关闭后只显示时间
      window.hideDate = false; window.draw(); await tick();
      window.setMaximized(true); await tick(400);
      const clock = () => document.getElementById('oneai-topbar-clock').textContent.trim();
      check('maximized top bar shows the date by default', clock().indexOf('-') > 0 && clock().indexOf(':') > 0);
      window.hideDate = true; window.draw(); await tick(400);
      check('with the date switched off the top bar shows only the time', clock().indexOf('-') < 0 && clock().split(':').length === 3);
      window.hideDate = false; window.setMaximized(false); window.draw(); await tick();
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
    // 终端输入交互：回显立即写入、隐藏终端延后合并、Shift+Enter 例外、AltGr、连点粘贴、点按钮后焦点、停止的任务
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const wait = (ms = 150) => new Promise(r => setTimeout(r, ms));
      const textarea = () => [...document.querySelectorAll('.xterm-helper-textarea')].find(t => t.offsetParent);
      const press = (init) => { const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); textarea().dispatchEvent(e); return e; };
      const ESC_CR = String.fromCharCode(27, 13);
      let emit = null;
      window.electronAPI.onSessionData = (callback) => { emit = callback; return () => { emit = null; }; };
      window.clearRoot(); window.drawTermPair('pair-a'); await wait(300);
      const written = (text) => window.xtermWrites.filter(w => w.data.includes(text));
      window.xtermWrites = [];
      emit({ id: 'pair-a', data: 'echo-1' });
      check('active terminal writes a lone echo immediately', written('echo-1').length === 1);
      emit({ id: 'pair-a', data: 'burst-1' }); emit({ id: 'pair-a', data: 'burst-2' });
      const burstSync = written('burst-1').length;
      await wait(60);
      check('output arriving within a frame is merged into one write', burstSync === 0 && window.xtermWrites.filter(w => w.data === 'burst-1burst-2').length === 1);
      // 激活一次 pair-b 让它创建实例，再切回 pair-a，使 pair-b 成为隐藏终端
      window.drawTermPair('pair-b'); await wait(200); window.drawTermPair('pair-a'); await wait(200);
      window.xtermWrites = [];
      emit({ id: 'pair-b', data: 'hidden-1' }); emit({ id: 'pair-b', data: 'hidden-2' });
      await wait(100);
      const hiddenEarly = written('hidden-1').length;
      await wait(300);
      check('hidden terminal defers and merges its output', hiddenEarly === 0 && window.xtermWrites.filter(w => w.data === 'hidden-1hidden-2').length === 1);
      emit({ id: 'pair-b', data: 'hidden-3' });
      window.drawTermPair('pair-b');
      check('switching to a hidden terminal writes its pending output right away', written('hidden-3').length === 1);
      window.clearRoot();
      window.electronAPI.onSessionData = () => () => {};

      window.ptyWrites = [];
      window.electronAPI.writeSession = async (id, text) => { window.ptyWrites.push({ id, text }); return true; };
      window.drawTerm('custom-shift', 'custom-ab12cd34'); await wait(300);
      press({ key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: true }); await wait(100);
      check('Shift+Enter is left alone in custom CLI tasks', !window.ptyWrites.some(w => w.text === ESC_CR));
      window.clearRoot(); window.drawTerm('ime-shift'); await wait(300);
      window.ptyWrites = [];
      press({ key: 'Enter', code: 'Enter', keyCode: 229, shiftKey: true, isComposing: true }); await wait(100);
      check('Shift+Enter during IME composition is not rewritten', !window.ptyWrites.some(w => w.text === ESC_CR));

      let reads = 0;
      window.electronAPI.readPasteContent = async () => { reads++; await wait(80); return { content: 'pasted-once' }; };
      press({ key: 'v', code: 'KeyV', keyCode: 86, ctrlKey: true, altKey: true }); await wait(150);
      check('AltGr+V (Ctrl+Alt+V) is not treated as paste', reads === 0);
      window.ptyWrites = [];
      const host = textarea().closest('.xterm').parentElement;
      host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await wait(250);
      check('double right-click pastes only once', reads === 1 && window.ptyWrites.filter(w => w.text.includes('pasted-once')).length === 1);
      const notice = () => document.querySelector('[role="status"]')?.textContent;
      check('pasting shows a Pasted notice', notice() === '已粘贴');
      window.electronAPI.readPasteContent = async () => ({ type: 'image-path', content: 'C:/t/paste_1.png' });
      host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(150);
      check('pasting a screenshot says the image path was pasted', notice() === '已粘贴图片路径');
      window.electronAPI.readPasteContent = async () => ({ type: 'none', content: '' });
      host.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(150);
      check('pasting an empty clipboard says it is empty', notice() === '剪贴板为空');

      window.clearRoot(); window.drawTerm('focus-click'); await wait(300);
      const button = document.getElementById('outside-button');
      button.focus(); button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await wait(50);
      check('mouse click on a button hands focus back to the terminal', document.activeElement === textarea());
      button.focus(); button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); await wait(50);
      check('keyboard-activated button keeps focus', document.activeElement === button);

      window.clearRoot();
      window.electronAPI.writeSession = async () => false;
      window.drawTerm('stopped-a', 'codex', 'stopped'); await wait(300);
      window.xtermWrites = [];
      textarea().focus();
      // 回车在 keydown 时就产生输入（可打印字符要等 keypress / input），用它模拟两次输入
      press({ key: 'Enter', code: 'Enter', keyCode: 13 }); await wait(50);
      press({ key: 'Enter', code: 'Enter', keyCode: 13 }); await wait(100);
      check('typing into a stopped task shows the restart hint once', written('进程已停止').length === 1);

      // 上翻时显示「回到底部」，期间有新输出时提示，点击后回到底部并隐藏
      window.clearRoot();
      let emitScroll = null;
      window.electronAPI.onSessionData = (callback) => { emitScroll = callback; return () => { emitScroll = null; }; };
      window.electronAPI.writeSession = async () => true;
      window.drawTerm('scroll-a'); await wait(300);
      const CRLF = String.fromCharCode(13, 10);
      emitScroll({ id: 'scroll-a', data: Array.from({ length: 200 }, (_, i) => 'line-' + i).join(CRLF) + CRLF }); await wait(150);
      const jump = () => document.querySelector('button[aria-label="回到底部"], button[aria-label="有新输出，回到底部"]');
      check('no back-to-bottom button while the terminal is at the bottom', !jump());
      textarea().focus();
      press({ key: 'PageUp', code: 'PageUp', keyCode: 33, shiftKey: true }); await wait(150);
      check('scrolling up shows the back-to-bottom button without a new-output hint', jump()?.getAttribute('aria-label') === '回到底部');
      emitScroll({ id: 'scroll-a', data: 'more-1' + CRLF + 'more-2' + CRLF }); await wait(150);
      check('new output while scrolled up changes the button to the new-output hint', jump()?.getAttribute('aria-label') === '有新输出，回到底部');
      jump().click(); await wait(150);
      check('clicking the button scrolls to the bottom and hides it', !jump());
      const toTop = () => document.querySelector('button[aria-label="回到顶部"]');
      check('content over one screen shows a back-to-top button', Boolean(toTop()));
      toTop().click(); await wait(150);
      check('clicking back-to-top scrolls to the top: the top button hides and back-to-bottom appears', !toTop() && Boolean(jump()));
      jump().click(); await wait(150);

      // Claude Code 全屏模式（备用屏）：xterm 无回滚区，回到顶部改为向 CLI 发送 Ctrl+Home；其他 CLI 不显示
      window.clearRoot();
      const altSent = [];
      window.electronAPI.writeSession = async (id, data) => { altSent.push(data); return true; };
      window.drawTerm('alt-codex', 'codex'); await wait(300);
      emitScroll({ id: 'alt-codex', data: String.fromCharCode(27) + '[?1049h' + 'alt screen' + CRLF }); await wait(150);
      check('alternate screen of a non-Claude CLI shows no back-to-top button', !toTop());
      window.clearRoot();
      window.drawTerm('alt-claude', 'claude'); await wait(300);
      check('Claude task on the normal screen shows no back-to-top button', !toTop());
      emitScroll({ id: 'alt-claude', data: String.fromCharCode(27) + '[?1049h' + 'alt screen' + CRLF }); await wait(150);
      check('Claude task on the alternate screen shows a back-to-top button', Boolean(toTop()));
      toTop().click(); await wait(100);
      check('clicking it sends Ctrl+Home to the CLI', altSent.includes(String.fromCharCode(27) + '[1;5H'));
      window.clearRoot();
      window.drawTerm('scroll-a'); await wait(300);

      // 按住 Ctrl 时容器带 ctrl-held（链接手型光标），松开或窗口失焦后移除
      const termHost = document.querySelector('.term-host');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true, bubbles: true }));
      check('holding Ctrl marks the terminal host', termHost.classList.contains('ctrl-held'));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', ctrlKey: false, bubbles: true }));
      check('releasing Ctrl clears the mark', !termHost.classList.contains('ctrl-held'));

      // 没有终端实例的任务仍要重启底层进程
      let restarted = null;
      window.electronAPI.restartSession = async (id) => { restarted = id; return { success: true }; };
      const restartResult = await window.termRef.current.restartActiveTerminal('never-opened');
      check('restart without a terminal instance still restarts the process', restarted === 'never-opened' && restartResult?.success === true);
      window.clearRoot();
      window.electronAPI.writeSession = async (id, text) => { window.ptyWrites.push({ id, text }); return true; };
      return checks;
    })()\`));
    // 设置页选项卡：方向键 / Home / End 切换，只有当前页可 Tab 聚焦，内容区由当前选项卡标注
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const wait = (ms = 100) => new Promise(r => setTimeout(r, ms));
      window.clearRoot(); window.drawSettings(); await wait(200);
      const tabs = () => [...document.querySelectorAll('[role="tab"]')];
      const selected = () => tabs().find(t => t.getAttribute('aria-selected') === 'true');
      const press = (key) => selected().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      selected().focus();
      press('ArrowDown'); await wait();
      check('settings tabs: ArrowDown selects and focuses the next tab', selected() === tabs()[1] && document.activeElement === tabs()[1]);
      press('ArrowUp'); await wait(); press('ArrowUp'); await wait();
      check('settings tabs: ArrowUp wraps to the last tab', selected() === tabs().at(-1));
      press('Home'); await wait();
      check('settings tabs: Home goes to the first tab', selected() === tabs()[0]);
      check('settings tabs: only the selected tab is in the Tab order', tabs().filter(t => t.tabIndex === 0).length === 1 && selected().tabIndex === 0);
      const panel = document.querySelector('[role="tabpanel"]');
      check('settings tab panel is labelled by the selected tab', panel.getAttribute('aria-labelledby') === selected().id && selected().getAttribute('aria-controls') === panel.id);
      window.clearRoot();
      return checks;
    })()\`));
    // 左侧区域：拖放不跳转、折叠不卸载播放器、任务行保留焦点、菜单限高、问候语跟随时钟偏移
    result.push(...await win.webContents.executeJavaScript(\`(async () => {
      const checks = [];
      const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
      const wait = (ms = 200) => new Promise(r => setTimeout(r, ms));
      window.clearRoot(); window.drawSidebar(); await wait();
      const dropOn = (target, types) => {
        const dataTransfer = new DataTransfer();
        if (types.includes('Files')) dataTransfer.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
        else dataTransfer.setData('text/plain', 'dragged text');
        const e = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
        target.dispatchEvent(e);
        return e.defaultPrevented;
      };
      check('dropping a file on the sidebar does not navigate the window', dropOn(document.getElementById('oneai-sidebar'), ['Files']));
      const field = document.body.appendChild(document.createElement('input'));
      check('dropping text into an input keeps the default insert', !dropOn(field, ['text/plain']));
      check('dropping a file onto an input still does not navigate', dropOn(field, ['Files']));
      field.remove();

      window.electronAPI.resolveMusicStream = async (url) => [{ name: '', url }];
      window.drawSidebar(false, 0, true); await wait(300);
      const player = () => document.querySelector('[role="group"][aria-label="音乐播放器"]');
      const before = player();
      window.drawSidebar(true, 0, true); await wait(300);
      check('collapsing the sidebar keeps the music player mounted (hidden)', before && player() === before && player().hidden);
      window.drawSidebar(false, 0, true); await wait(300);
      check('expanding again shows the same player instance', player() === before && !player().hidden);
      const volSlider = player()?.querySelector('input[aria-label="音量"]');
      if (volSlider) {
        volSlider.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(volSlider, '0.42');
        volSlider.dispatchEvent(new Event('change', { bubbles: true }));
        volSlider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      }
      await wait(50);
      check('music volume persists and releasing slider blurs input', localStorage.getItem('oneai_music_volume') === '0.42' && document.activeElement !== volSlider);

      window.drawSidebar(); await wait();
      window.events = [];
      const row = document.querySelector('[data-task-id="side-a"] button[data-keep-focus]');
      row.focus(); row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await wait(80);
      check('mouse click on a task row keeps focus for F2 / Alt+arrows', document.activeElement === row);

      const rowHeightBefore = document.querySelector('[data-task-id="side-a"]').getBoundingClientRect().height;
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })); await wait(80);
      const renameInput = document.querySelector('[data-task-id="side-a"] input');
      const rowHeightEditing = document.querySelector('[data-task-id="side-a"]').getBoundingClientRect().height;
      check('inline rename on a two-line task preserves row height and keeps summary line', Boolean(renameInput) && Math.abs(rowHeightEditing - rowHeightBefore) <= 1 && Boolean(document.querySelector('[data-task-id="side-a"] [data-task-summary]')));
      renameInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(80);

      const inactiveClose = document.querySelector('button[aria-label="关闭 Side b"]');
      check('inactive unhovered task close button takes zero width so title/summary keep space', inactiveClose && inactiveClose.getBoundingClientRect().width === 0);

      const plusBtn = document.querySelector('[data-folder-row] button[aria-haspopup="menu"]');
      plusBtn.click(); await wait(100);
      const menu = document.querySelector('[role="menu"]');
      const menuStyle = menu && getComputedStyle(menu);
      check('sidebar context menu is capped to the window and scrolls', menuStyle && menuStyle.maxHeight !== 'none' && menuStyle.overflowY === 'auto');
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); await wait(50);
      check('sidebar menu supports ArrowDown keyboard focus navigation', document.activeElement?.getAttribute('role') === 'menuitem');
      plusBtn.click(); await wait(80);
      check('clicking the same folder + button toggles the menu closed', !document.querySelector('[role="menu"]'));

      document.querySelector('button[aria-label="折叠所有文件夹"]').click(); await wait(50);
      check('collapse-all button requests collapsing all folders', window.events.includes('toggle-all:false'));

      const sportsHeader = document.querySelectorAll('[data-folder-row]')[1].firstElementChild;
      sportsHeader.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 160 })); await wait(80);
      const clearItem = [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('清理已停止任务'));
      check('folder menu offers clearing stopped tasks when present', Boolean(clearItem));
      clearItem?.click(); await wait(50);
      check('clear stopped tasks passes the folder path', window.events.includes('clear-stopped:D:/sports'));

      document.querySelector('button[aria-label="收起最近任务"]').click(); await wait(80);
      const collapsedRecent = !document.querySelector('[data-recent-key]');
      document.querySelector('button[aria-label="展开最近任务"]').click(); await wait(80);
      check('recent tasks section can collapse and expand', collapsedRecent && Boolean(document.querySelector('[data-recent-key]')));

      document.querySelector('[data-recent-key] button[aria-expanded]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 220 })); await wait(80);
      const pinItem = [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('加入工作区'));
      pinItem?.click(); await wait(50);
      check('recent folder menu offers pinning folder to workspace', window.events.includes('pin-recent:D:/plan'));

      const resizer = document.querySelector('#oneai-sidebar [role="separator"][aria-orientation="vertical"]');
      resizer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 320 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 380 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      resizer?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await wait(50);
      check('sidebar resize handle updates width and double-click resets it', window.events.includes('resize:380') && window.events.includes('reset-width'));

      window.drawSidebar(false, 0, false, 410); await wait(50);
      check('custom sidebar width applies cleanly', document.getElementById('oneai-sidebar').getBoundingClientRect().width === 410);

      window.events = [];
      window.drawSidebar(true); await wait(80);
      const stripB = document.querySelector('button[data-task-id="side-b"]');
      const stripFolder = document.querySelector('[data-folder-strip]');
      const taskRect = stripB.getBoundingClientRect();
      const folderRect = stripFolder.getBoundingClientRect();
      const stripButtons = [...document.querySelectorAll('#oneai-sidebar [data-folder-strip], #oneai-sidebar [data-task-id]')];
      const stripGaps = stripButtons.slice(1).map((el, i) => el.getBoundingClientRect().top - stripButtons[i].getBoundingClientRect().bottom);
      check('collapsed task button is square and matches folder button size', Math.abs(taskRect.width - taskRect.height) < 1 && Math.abs(taskRect.width - folderRect.width) < 1 && Math.abs(taskRect.height - folderRect.height) < 1 && stripB.scrollWidth <= stripB.clientWidth);
      check('collapsed folder and CLI buttons share uniform vertical spacing', stripGaps.length >= 4 && stripGaps[0] >= 3 && stripGaps.every(g => Math.abs(g - stripGaps[0]) < 1));
      check('collapsed unread button still renders status dot and CLI icon', stripB.querySelectorAll('span').length >= 2 && Boolean(stripB.querySelector('svg')));
      stripB.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 120 })); await wait(80);
      check('collapsed task button supports right-click context menu', Boolean(document.querySelector('[role="menu"]')));
      document.body.click(); await wait(50);
      stripB.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      check('collapsed task button supports middle-click close', window.events.includes('close:side-b'));
      document.querySelector('button[aria-label="展开左侧导航栏"]').click();
      check('collapsed footer offers expand sidebar button', window.events.includes('toggle-collapse'));

      const hour = new Date().getHours();
      window.drawSidebar(false, (26 - hour) % 24); await wait();
      check('greeting follows the clock offset', document.getElementById('oneai-sidebar').textContent.includes('午夜好'));
      window.drawSidebar(false, (15 - hour + 24) % 24); await wait();
      check('greeting updates when the clock offset changes', document.getElementById('oneai-sidebar').textContent.includes('下午好'));
      window.clearRoot();
      return checks;
    })()\`));
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
      const syntaxText = ['/* first', 'second */', 'const value = "<img src=x onerror=alert(1)>";', ''].join(String.fromCharCode(10));
      window.electronAPI.readPreviewFile = async () => ({ kind: 'text', path: 'sample.ts', content: syntaxText });
      window.drawPreview(2, 3); await wait();
      check('preview colors keywords and strings without creating HTML elements', document.querySelector('.hljs-keyword')?.textContent === 'const' && Boolean(document.querySelector('.hljs-string')) && !document.querySelector('pre img'));
      check('preview preserves multiline comment scope and target line', highlighted()?.textContent === 'second */' && Boolean(highlighted()?.querySelector('.hljs-comment')));
      check('preview preserves source and trailing line', [...document.querySelectorAll('pre > div')].map(d => d.textContent === ' ' ? '' : d.textContent).join(String.fromCharCode(10)) === syntaxText);
      const keywordColor = getComputedStyle(document.querySelector('.hljs-keyword')).color;
      const oldTheme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = oldTheme === 'light' ? 'dark' : 'light';
      check('preview syntax colors follow theme changes', getComputedStyle(document.querySelector('.hljs-keyword')).color !== keywordColor);
      document.documentElement.dataset.theme = oldTheme;
      window.electronAPI.readPreviewFile = async () => ({ kind: 'text', path: 'sample.txt', content: syntaxText });
      window.drawPreview(2, 4); await wait();
      check('unknown preview languages remain plain text', !document.querySelector('pre span') && highlighted()?.textContent === 'second */');
      const mediumMultiLine = Array.from({ length: 7000 }, (_, i) => 'const value' + i + ' = ' + i + ';').join(String.fromCharCode(13, 10));
      window.electronAPI.readPreviewFile = async () => ({ kind: 'text', path: 'medium.mjs', content: mediumMultiLine });
      window.drawPreview(1, 5); await wait();
      check('multi-line code files over 100 KB still get syntax highlighting', mediumMultiLine.length > 100000 && document.querySelector('.hljs-keyword')?.textContent === 'const');
      window.electronAPI.readPreviewFile = async () => ({ kind: 'text', path: 'minified.ts', content: 'const value = 1;'.repeat(7000) });
      window.drawPreview(1, 6); await wait();
      check('minified preview skips syntax processing but retains text', !document.querySelector('pre span') && document.querySelector('pre').textContent === 'const value = 1;'.repeat(7000));
      const overMax = ('const value = 1;' + String.fromCharCode(10)).repeat(70000);
      window.electronAPI.readPreviewFile = async () => ({ kind: 'text', path: 'huge.ts', content: overMax });
      window.drawPreview(1, 7); await wait();
      check('over-1MB preview skips syntax processing but retains text', !document.querySelector('pre span') && [...document.querySelectorAll('pre > div')].map(d => d.textContent === ' ' ? '' : d.textContent).join(String.fromCharCode(10)) === overMax);
      // 代码缩略图（minimap）
      const longText = Array.from({ length: 300 }, (_, i) => '  const value' + i + ' = ' + i + ';').join(String.fromCharCode(10));
      window.electronAPI.readPreviewFile = async () => ({ kind: 'text', path: 'long.ts', size: 9000, content: longText });
      window.drawPreview(150, 10); await wait(300);
      const mini = () => document.querySelector('[data-preview-minimap]');
      const slider = () => document.querySelector('[data-preview-minimap-slider]');
      const scroller = () => document.querySelector('aside[aria-label="文件预览"] .overflow-auto');
      check('long preview shows a minimap on the right with a canvas', Boolean(mini()) && mini().querySelector('canvas').height > 0 && mini().getBoundingClientRect().right <= document.querySelector('aside[aria-label="文件预览"]').getBoundingClientRect().right + 1);
      check('the minimap slider covers only the visible part of a scrollable file', Boolean(slider()) && slider().getBoundingClientRect().height < mini().querySelector('canvas').getBoundingClientRect().height && slider().getBoundingClientRect().height >= 10);
      // 检查窗口是隐藏的、不渲染帧，浏览器不会自己派发 scroll 事件，所以设置 scrollTop 后手动派发一次
      const scrollTo = async (top) => { scroller().scrollTop = top; scroller().dispatchEvent(new Event('scroll')); await wait(200); };
      await scrollTo(0);
      const atTop = slider().getBoundingClientRect().top;
      await scrollTo(scroller().scrollHeight);
      const atBottom = slider().getBoundingClientRect().top;
      check('the slider follows the preview scroll position', atBottom > atTop + 5 && atTop <= mini().getBoundingClientRect().top + 2);
      scroller().scrollTop = 0; await wait(100);
      const canvasRect = mini().querySelector('canvas').getBoundingClientRect();
      mini().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: canvasRect.left + 20, clientY: canvasRect.top + canvasRect.height / 2 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await wait(150);
      const ratio = scroller().scrollTop / Math.max(1, scroller().scrollHeight - scroller().clientHeight);
      check('clicking the middle of the minimap scrolls the preview to about the middle', ratio > 0.35 && ratio < 0.65);
      const wheelBefore = scroller().scrollTop;
      mini().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 })); await wait(100);
      check('wheeling over the minimap scrolls the preview', scroller().scrollTop > wheelBefore);
      window.drawPreview(150, 11, false); await wait(200);
      check('the minimap is not rendered when it is turned off', !mini() && Boolean(document.querySelector('pre')));
      window.electronAPI.readPreviewFile = async () => ({ kind: 'text', path: 'short.ts', size: 13, content: ['one', 'two', 'three'].join(String.fromCharCode(10)) });
      window.drawPreview(undefined, 12, true); await wait(300);
      check('a short file that needs no scrolling shows the minimap without a slider', Boolean(mini()) && !slider());
      window.electronAPI.readPreviewFile = async () => ({ kind: 'binary', path: 'x.bin', size: 5 });
      window.drawPreview(undefined, 13, true); await wait(200);
      check('no minimap for non-text previews', !mini());
      // 预览面板分隔条双击重置与窄窗口下终端最小宽度保护
      window.events = [];
      const previewSep = document.querySelector('aside[aria-label="文件预览"] [role="separator"]');
      previewSep.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      check('double-clicking preview separator resets width', window.events.includes('preview-reset'));
      window.drawPreview(undefined, 14, false, 420, 540); await wait(100);
      check('narrow window keeps at least 320px for terminal viewport beside preview', document.getElementById('narrow-term-probe').getBoundingClientRect().width >= 320);

      // Modal Tab / Shift+Tab 焦点陷阱 + NewTaskModal 预选账号
      window.clearRoot();
      window.drawNewTask(window.accountsFixture, 'acc-alt'); await wait(100);
      check('NewTaskModal preselects initialAccountId when valid for CLI', document.getElementById('new-task-account')?.value === 'acc-alt');
      const dlg = document.querySelector('[role="dialog"]');
      const focusables = [...dlg.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(el => el.getClientRects().length > 0);
      focusables.at(-1).focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      const wrappedForward = document.activeElement === focusables[0];
      focusables[0].focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      const wrappedBackward = document.activeElement === focusables.at(-1);
      check('Modal traps Tab and Shift+Tab focus within dialog', wrappedForward && wrappedBackward && document.activeElement !== document.getElementById('outside-modal-btn'));

      // TerminalViewport 快照 seq 去重与秒退进程退出横幅补打
      window.clearRoot();
      let emitSnapData = null;
      let resolveSnap = null;
      window.electronAPI.onSessionData = (cb) => { emitSnapData = cb; return () => { emitSnapData = null; }; };
      window.electronAPI.getSessionSnapshot = () => new Promise((r) => { resolveSnap = r; });
      window.xtermWrites = [];
      window.drawTerm('snap-dedup');
      emitSnapData({ id: 'snap-dedup', data: 'DUP', seq: 10 });
      emitSnapData({ id: 'snap-dedup', data: '-LIVE', seq: 15 });
      resolveSnap({ buffer: 'SNAP-10', seq: 10, alive: true });
      await wait(120);
      const dedupCombined = window.xtermWrites.map(w => w.data).join('');
      check('TerminalViewport deduplicates early chunks with seq <= snapshot.seq and replays newer chunks', dedupCombined === 'SNAP-10-LIVE');

      window.clearRoot();
      window.xtermWrites = [];
      let emitSnapExit = null;
      window.electronAPI.onSessionExit = (cb) => { emitSnapExit = cb; return () => { emitSnapExit = null; }; };
      window.electronAPI.getSessionSnapshot = async () => ({ buffer: 'fatal-err', seq: 9, alive: false, exitCode: 9 });
      window.drawTerm('snap-fast-exit');
      await wait(120);
      const fastExitOut = window.xtermWrites.map(w => w.data).join('');
      check('TerminalViewport prints exit banner from snapshot when process exited before mount', fastExitOut.includes('fatal-err') && fastExitOut.includes('9'));
      window.xtermWrites = [];
      emitSnapExit({ id: 'snap-fast-exit', exitCode: 3 });
      await wait(60);
      check('TerminalViewport still prints exit banner on subsequent exit after resume', window.xtermWrites.some(w => w.data.includes('3')));
      delete window.electronAPI.getSessionSnapshot;
      window.electronAPI.onSessionData = () => () => {};
      window.electronAPI.onSessionExit = () => () => {};
      window.clearRoot();
      return checks;
    })()\`));
    {
      const { extractAgyModelChange } = require(require('node:path').join(__dirname, 'usage-stats.cjs'));
      const bt = String.fromCharCode(96), bs = String.fromCharCode(92);
      const mkTag = (from, to) => '<USER_SETTINGS_CHANGE>\\nThe user changed setting ' + bt + 'Model Selection' + bt + ' from ' + from + ' to ' + to + '. No need to comment on this change if the user doesn\\'t ask about it.\\n</USER_SETTINGS_CHANGE>';
      const mkUser = (req, tail) => JSON.stringify({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\\n' + req + '\\n</USER_REQUEST>\\n<ADDITIONAL_METADATA>\\nt\\n</ADDITIONAL_METADATA>' + (tail ? '\\n' + tail : '') });
      result.push({
        name: 'Antigravity model parser extracts trailing USER_INPUT setting changes and ignores source/tool regex noise',
        ok: extractAgyModelChange(mkUser('hi', mkTag('None', 'Gemini 4 Carbon (High)'))) === 'Gemini 4 Carbon'
          && extractAgyModelChange(mkUser('reset', mkTag('Gemini 4 Carbon (High)', 'None'))) === ''
          && extractAgyModelChange(JSON.stringify({ source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ args: '/' + bt + 'Model Selection' + bt + ' from .+? to (.+?)' + bs + '. No need/' }] })) === null
          && extractAgyModelChange(JSON.stringify({ source: 'MODEL', type: 'GENERIC', content: '{"type":"USER_INPUT","content":' + JSON.stringify(mkTag('a', '(.+?)' + bs)) + '}' })) === null
          && extractAgyModelChange(mkUser('pasted:\\n' + mkTag('None', '(.+?)' + bs), '')) === null
          && extractAgyModelChange(mkUser('pasted:\\n' + mkTag('None', 'FakeModel (Low)'), mkTag('None', 'Gemini 4 Hydrogen (XHigh)'))) === 'Gemini 4 Hydrogen',
      });
    }
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
