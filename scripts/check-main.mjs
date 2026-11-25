// 主进程与共享核心逻辑回归测试：使用 esbuild 打包并在隔离临时目录下执行 node:test
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, '.tmp', `check-main-${process.pid}`);
await fs.mkdir(outDir, { recursive: true });

const stubPlugin = {
  name: 'test-stubs',
  setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    b.onLoad({ filter: /^electron$/, namespace: 'stub' }, () => ({
      contents: `
        const path = require('node:path');
        module.exports = {
          app: {
            isReady: () => true,
            isPackaged: false,
            getVersion: () => '2.2.7',
            getPath: (name) => {
              const paths = globalThis.__ONEAI_TEST_PATHS__ || {};
              return paths[name] || path.join(paths.root || process.cwd(), name);
            },
          },
          ipcMain: { handle() {}, on() {} },
          shell: { openExternal: async () => {} },
          protocol: { handle() {}, registerSchemesAsPrivileged() {} },
          dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
          BrowserWindow: class {},
        };
      `,
      loader: 'js',
    }));
    b.onResolve({ filter: /^electron-updater$/ }, () => ({ path: 'electron-updater', namespace: 'stub' }));
    b.onLoad({ filter: /^electron-updater$/, namespace: 'stub' }, () => ({
      contents: `
        module.exports = {
          autoUpdater: {
            autoDownload: false,
            autoInstallOnAppQuit: true,
            allowPrerelease: false,
            allowDowngrade: false,
            on() {},
            checkForUpdates: async () => null,
            downloadUpdate: async () => [],
            quitAndInstall() {},
          },
        };
      `,
      loader: 'js',
    }));
    b.onResolve({ filter: /^node-pty$/ }, () => ({ path: 'node-pty', namespace: 'stub' }));
    b.onLoad({ filter: /^node-pty$/, namespace: 'stub' }, () => ({
      contents: `
        module.exports = {
          spawn(file, args, options) {
            return globalThis.__ONEAI_MOCK_PTY_SPAWN__(file, args, options);
          },
        };
      `,
      loader: 'js',
    }));
  },
};

const suiteFile = path.join(outDir, 'suite.cjs');

try {
  await build({
    stdin: {
      resolveDir: rootDir,
      loader: 'ts',
      contents: `
        import test from 'node:test';
        import assert from 'node:assert/strict';
        import fs from 'node:fs';
        import fsp from 'node:fs/promises';
        import path from 'node:path';

        const fixtureRoot = process.env.ONEAI_CHECK_FIXTURE_ROOT!;
        (globalThis as any).__ONEAI_TEST_PATHS__ = {
          root: fixtureRoot,
          temp: path.join(fixtureRoot, 'temp'),
          music: path.join(fixtureRoot, 'music'),
          userData: path.join(fixtureRoot, 'userData'),
        };
        fs.mkdirSync(path.join(fixtureRoot, 'temp', 'OneAI_Images'), { recursive: true });
        fs.mkdirSync(path.join(fixtureRoot, 'music'), { recursive: true });
        fs.mkdirSync(path.join(fixtureRoot, 'userData'), { recursive: true });

        import { PtyManager, PtyOutputBatcher } from './src/main/pty-manager';
        import { computeSessionUsage, parseAgyUsage, parseAgyUsageGroups, parseTomlStrings, readCodexRateWindows } from './src/main/quota-service';
        import { estimateModelCostUsd } from './src/main/model-pricing';
        import { buildDashboardStats, readDiskCache, scheduleSaveDiskCache } from './src/main/usage-stats';
        import { computeDashboardView } from './src/renderer/src/dashboardMetrics';
        import { startOutcome } from './src/renderer/src/taskStatus';
        import { detectLanguage, isLanguage, translate } from './src/shared/i18n';
        import { getLanguage, setLanguage, t } from './src/main/i18n';
        import { isLocalOrLinkLocalHost, listTracks, parsePlaylist, readBodyTextCapped, resolveAllowedTrack, serveMusicTrack } from './src/main/music-library';
        import { readTaskSummaries, readSessionDirectory } from './src/main/task-summary';
        import { allowPreviewFilePaths, readPreview, resolveInside } from './src/main/file-preview';
        import { listProjectDirectory } from './src/main/project-tree';
        import { setBoundedMap } from './src/main/fs-utils';
        import { folderKey, quoteTerminalPath, extractPathMatches } from './src/shared/paths';
        import { buildReleaseUrl, canUseAutoUpdater, compareSemver, extractVersionFromReleaseUrl, normalizeReleaseNotes, selectLocalizedReleaseNotes } from './src/main/updater';

        test('Traditional Chinese is detected, translated, and accepted by main-process i18n', () => {
          for (const locale of ['zh-TW', 'zh-HK', 'zh_MO', 'zh-Hant', 'zh-Hant-CN']) assert.equal(detectLanguage(locale), 'zh-TW');
          for (const locale of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans-TW']) assert.equal(detectLanguage(locale), 'zh-CN');
          assert.equal(detectLanguage('en-US'), 'en');
          assert.equal(detectLanguage(undefined), 'en');
          assert.equal(isLanguage('zh-TW'), true);
          assert.equal(isLanguage('zh-HK'), false);
          assert.equal(translate('zh-TW', '工作目录不存在或不是文件夹：{dir}', { dir: 'D:/我的项目' }), '工作目錄不存在或不是資料夾：D:/我的项目');
          assert.equal(translate('zh-TW', 'constructor'), 'constructor');
          setLanguage('zh-TW');
          assert.equal(getLanguage(), 'zh-TW');
          assert.equal(t('选择工作目录'), '選擇工作目錄');
          setLanguage('zh-CN');
        });

        test('PtyOutputBatcher emits monotonic seq and preserves surrogate pairs', async () => {
          const events: Array<{ id: string; data: string; seq: number }> = [];
          const batcher = new PtyOutputBatcher((id, data, seq) => events.push({ id, data, seq }));
          batcher.setActive('s1');

          batcher.push('s1', 'abc', 0);
          assert.equal(events.length, 1);
          assert.deepEqual(events[0], { id: 's1', data: 'abc', seq: 3 });

          // Burst within the same millisecond batches together and advances seq; discard drops pending without emitting
          batcher.push('s1', 'de', 3);
          batcher.push('s1', 'fgh', 5);
          batcher.flush('s1');
          assert.equal(events.length, 2);
          assert.deepEqual(events[1], { id: 's1', data: 'defgh', seq: 8 });
          batcher.push('s1', 'stale-chunk', 8);
          batcher.discard('s1');
          assert.equal(events.length, 2);

          // Surrogate pair at 64 KB split boundary stays intact
          const prefix = 'x'.repeat(65535);
          const emoji = '😀'; // length 2 surrogate pair
          const big = prefix + emoji + 'z';
          batcher.push('s2', big, 100);
          batcher.flush('s2');
          const s2Text = events.filter((e) => e.id === 's2').map((e) => e.data).join('');
          const s2LastSeq = events.filter((e) => e.id === 's2').at(-1)!.seq;
          assert.equal(s2Text, big);
          assert.equal(s2LastSeq, 100 + big.length);
        });

        test('PtyManager snapshot, fast-exit tracking, restart fresh options and command wrapping', async () => {
          const spawned: Array<{ file: string; args: string[]; options: any; emitData: (d: string) => void; emitExit: (code: number) => void }> = [];
          let nextPid = 900000; // non-existent high PID
          (globalThis as any).__ONEAI_MOCK_PTY_SPAWN__ = (file: string, args: string[], options: any) => {
            let onDataCb: ((d: string) => void) | null = null;
            let onExitCb: ((e: { exitCode: number }) => void) | null = null;
            const proc = {
              pid: ++nextPid,
              onData(cb: (d: string) => void) { onDataCb = cb; return { dispose() {} }; },
              onExit(cb: (e: { exitCode: number }) => void) { onExitCb = cb; return { dispose() {} }; },
              write() {},
              resize() {},
              kill() {},
            };
            spawned.push({
              file,
              args,
              options,
              emitData: (d) => onDataCb?.(d),
              emitExit: (exitCode) => onExitCb?.({ exitCode }),
            });
            return proc;
          };

          const workDir = path.join(fixtureRoot, 'proj');
          const accDir1 = path.join(fixtureRoot, 'acc-codex-1');
          const accDir2 = path.join(fixtureRoot, 'acc-codex-2');
          fs.mkdirSync(workDir, { recursive: true });

          const mgr = new PtyManager(async (...args) => (globalThis as any).__ONEAI_MOCK_PTY_SPAWN__(...args));
          const sent: Array<{ channel: string; payload: any }> = [];
          mgr.setWindow({
            isDestroyed: () => false,
            webContents: { send: (channel: string, payload: any) => sent.push({ channel, payload }) },
          } as any);

          // Unconfigured restart fails cleanly instead of falling back to plain PowerShell in OneAI cwd
          const missingRestart = await mgr.restartSession('never-seen');
          assert.equal(missingRestart.success, false);
          assert.ok(missingRestart.error);

          // Quoted executable path gets PowerShell call operator (&) and account env
          const createRes = await mgr.createSession({
            id: 'task-1',
            command: '"C:\\\\Program Files\\\\Tool\\\\cli.cmd" --flag',
            cwd: workDir,
            account: { cliId: 'codex', configDir: accDir1, env: { CUSTOM_VAR: 'v1' } },
          });
          assert.equal(createRes.success, true);
          assert.equal(createRes.reused, undefined);
          assert.equal(spawned.length, 1);
          assert.equal(spawned[0].file, 'powershell.exe');
          assert.match(spawned[0].args.at(-1)!, /& "C:\\\\Program Files\\\\Tool\\\\cli\.cmd" --flag/);
          assert.equal(spawned[0].options.env.CODEX_HOME, accDir1);
          assert.equal(spawned[0].options.env.CUSTOM_VAR, 'v1');

          spawned[0].emitData('boot-line\\r\\n');
          const liveSnap = mgr.getSessionSnapshot('task-1');
          assert.equal(liveSnap.alive, true);
          assert.equal(liveSnap.buffer, 'boot-line\\r\\n');
          assert.equal(liveSnap.seq, 'boot-line\\r\\n'.length);
          assert.equal(liveSnap.exitCode, undefined);

          const selected = await mgr.createSession({ id: 'task-1' });
          assert.equal(selected.reused, true);
          assert.equal(selected.buffer, liveSnap.buffer);
          assert.equal(spawned.length, 1);
          assert.equal(startOutcome(selected, 'running').status, 'running');
          assert.equal(startOutcome(selected, 'waiting').status, 'waiting');
          assert.equal(startOutcome(createRes, 'running').status, 'idle');
          assert.equal(startOutcome(missingRestart, 'waiting').status, 'error');

          // Fast exit records exitCode in snapshot
          spawned[0].emitExit(17);
          const deadSnap = mgr.getSessionSnapshot('task-1');
          assert.equal(deadSnap.alive, false);
          assert.equal(deadSnap.exitCode, 17);
          assert.equal(deadSnap.buffer, 'boot-line\\r\\n');

          // Restart with updated account env refreshes env and keeps seq monotonic
          const restartRes = await mgr.restartSession('task-1', {
            account: { cliId: 'codex', configDir: accDir2, env: { CUSTOM_VAR: 'v2' } },
          });
          assert.equal(restartRes.success, true);
          assert.equal(spawned.length, 2);
          assert.equal(spawned[1].options.env.CODEX_HOME, accDir2);
          assert.equal(spawned[1].options.env.CUSTOM_VAR, 'v2');
          spawned[1].emitData('hi');
          assert.ok(mgr.getSessionSnapshot('task-1').seq > deadSnap.seq);

          // Pi uses useConptyDll while pwsh / wsl open interactive shells directly
          await mgr.createSession({ id: 'task-pi', command: 'pi --continue', cwd: workDir });
          assert.equal(spawned.at(-1)!.options.useConptyDll, true);
          await mgr.createSession({ id: 'task-pwsh', command: 'pwsh', cwd: workDir });
          assert.equal(spawned.at(-1)!.file, 'pwsh.exe');
          assert.deepEqual(spawned.at(-1)!.args, ['-NoExit', '-ExecutionPolicy', 'Bypass']);
          await mgr.createSession({ id: 'task-wsl', command: 'wsl', cwd: workDir });
          assert.equal(spawned.at(-1)!.file, 'wsl.exe');
          await mgr.createSession({ id: 'task-comment', command: 'mycli --fast # trailing comment', cwd: workDir, shell: true });
          assert.match(spawned.at(-1)!.args.at(-1)!, /mycli --fast # trailing comment\\nif \\(\\$null -ne \\$LASTEXITCODE\\)/);
          mgr.destroyAll();
        });

        test('PTY acknowledgements ignore invalid values and survive clear and restart', async () => {
          const processes: any[] = [];
          const mgr = new PtyManager(async () => {
            const state: any = { ack: [], emit: null };
            processes.push(state);
            return { pid: 0, onData(cb: any) { state.emit = cb; }, onExit() {}, resize() {}, kill() {}, acknowledge(n: number) { state.ack.push(n); } } as any;
          });
          await mgr.createSession({ id: 'flow', cwd: fixtureRoot });
          processes[0].emit('abc');
          assert.deepEqual(processes[0].ack, [3]);
          mgr.getSessionSnapshot('flow');
          processes[0].emit('def');
          for (const n of [-1, NaN, Infinity, 7, 3.5]) mgr.acknowledge('flow', n);
          assert.deepEqual(processes[0].ack, [3]);
          mgr.acknowledge('flow', 6);
          mgr.acknowledge('flow', 6);
          assert.deepEqual(processes[0].ack, [3, 3]);
          processes[0].emit('ghi');
          mgr.clearSessionBuffer('flow');
          assert.deepEqual(processes[0].ack, [3, 3, 3]);
          assert.equal(mgr.getSessionSnapshot('flow').buffer, '');
          await mgr.restartSession('flow');
          processes[0].emit('stale');
          processes[1].emit('new');
          assert.equal(mgr.getSessionSnapshot('flow').buffer, 'new');
          mgr.acknowledge('flow', 9);
          assert.deepEqual(processes[1].ack, []);
          mgr.acknowledge('flow', 12);
          assert.deepEqual(processes[1].ack, [3]);
          mgr.destroyAll();
        });

        test('PTY creation cancellation and duplicate requests preserve lifecycle', async () => {
          let finish: any;
          let killed = false;
          const mgr = new PtyManager(() => new Promise(resolve => { finish = resolve; }));
          const first = mgr.createSession({ id: 'pending', cwd: fixtureRoot });
          assert.equal(mgr.createSession({ id: 'pending', cwd: fixtureRoot }), first);
          while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
          mgr.killSession('pending');
          finish({ pid: 0, kill() { killed = true; } } as any);
          assert.equal((await first).success, false);
          assert.equal(killed, true);
          assert.equal(mgr.aliveCount(), 0);
        });

        test('Usage cache isolates changed files and rejects incomplete or stale data', async () => {
          const file = path.join(fixtureRoot, 'cache-source.jsonl');
          await fsp.writeFile(file, 'fixture');
          const stat = await fsp.stat(file);
          const value = { mtimeMs: stat.mtimeMs, size: stat.size, sessionId: 'cached-session', entries: Array.from({ length: 600 }, (_, ts) => ({ ts, model: 'test', input: 1, output: 2, cacheRead: 0, cacheWrite: 0 })) };
          scheduleSaveDiskCache(file, value);
          let read;
          for (let i = 0; i < 100 && !read; i++) {
            await new Promise(resolve => setTimeout(resolve, 10));
            read = await readDiskCache(file, stat);
          }
          assert.deepEqual(read, value);
          assert.equal(await readDiskCache(file, { ...stat, size: stat.size + 1 } as any), undefined);
          const cacheDir = path.join(fixtureRoot, 'userData', 'usage-cache-v6');
          const cacheFiles = await fsp.readdir(cacheDir);
          assert.equal(cacheFiles.length, 1);
          const target = path.join(cacheDir, cacheFiles[0]);
          await fsp.writeFile(target, JSON.stringify({ mtimeMs: stat.mtimeMs, size: stat.size }) + '\\n');
          assert.equal(await readDiskCache(file, stat), undefined);
          scheduleSaveDiskCache(file, value);
          for (let i = 0; i < 100; i++) {
            await new Promise(resolve => setTimeout(resolve, 10));
            if (await readDiskCache(file, stat)) break;
          }
          assert.deepEqual(await readDiskCache(file, stat), value);
        });

        test('Summary directory cache reuses enumeration and detects entry changes', async () => {
          const dir = path.join(fixtureRoot, 'directory-cache');
          await fsp.mkdir(dir);
          await fsp.writeFile(path.join(dir, 'a.jsonl'), 'a');
          const first = await readSessionDirectory(dir);
          assert.equal(await readSessionDirectory(dir), first);
          await fsp.appendFile(path.join(dir, 'a.jsonl'), 'more');
          assert.deepEqual((await readSessionDirectory(dir)).map(e => e.name), ['a.jsonl']);
          await fsp.writeFile(path.join(dir, 'b.jsonl'), 'b');
          const future = new Date(Date.now() + 1000);
          await fsp.utimes(dir, future, future);
          assert.equal((await readSessionDirectory(dir)).length, 2);
        });

        test('parseTomlStrings strips comments and isolates sections accurately', () => {
          const toml = [
            '# model = "commented-out"',
            'fallback_model = "wrong-suffix"',
            'model = "gpt-5.5" # inline comment',
            'model_reasoning_effort = \\'high\\'',
            'endpoint = "https://api.example.com/v1#keep-hash" # strip this',
            '',
            '[profiles.fast]',
            'model = "gpt-5-mini"',
            'model_reasoning_effort = "low"',
            '',
            '[models."kimi-k3"]',
            'model = "k3-pro"',
            '',
            '[model]',
            'default = "grok-4.7"',
          ].join('\\n');

          const parsed = parseTomlStrings(toml);
          assert.equal(parsed.get('')?.get('model'), 'gpt-5.5');
          assert.equal(parsed.get('')?.get('model_reasoning_effort'), 'high');
          assert.equal(parsed.get('')?.get('endpoint'), 'https://api.example.com/v1#keep-hash');
          assert.equal(parsed.get('profiles.fast')?.get('model'), 'gpt-5-mini');
          assert.equal(parsed.get('models.kimi-k3')?.get('model'), 'k3-pro');
          assert.equal(parsed.get('model')?.get('default'), 'grok-4.7');
        });

        test('music-library enforces realpath containment, SSRF guards and body size cap', async () => {
          const musicDir = path.join(fixtureRoot, 'music-box');
          const outsideDir = path.join(fixtureRoot, 'outside-box');
          await fsp.mkdir(musicDir, { recursive: true });
          await fsp.mkdir(outsideDir, { recursive: true });
          const trackFile = path.join(musicDir, 'song.mp3');
          const secretAudio = path.join(outsideDir, 'secret.mp3');
          await fsp.writeFile(trackFile, Buffer.from('ID3-demo-track-bytes'));
          await fsp.writeFile(secretAudio, Buffer.from('ID3-secret'));

          // Junction inside musicDir pointing outside must not expose tracks
          const junctionPath = path.join(musicDir, 'linked-dir');
          try { await fsp.symlink(outsideDir, junctionPath, 'junction'); } catch {}

          const listed = await listTracks(musicDir);
          assert.equal(listed.tracks.length, 1);
          assert.equal(listed.tracks[0].name, 'song');

          // Case-variant path on Windows still resolves cleanly
          const toggledCase = trackFile.replace(/^[A-Za-z]/, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
          const allowed = await resolveAllowedTrack(toggledCase);
          assert.ok(allowed);
          assert.equal(allowed.mime, 'audio/mpeg');

          // Traversal and outside paths are rejected
          assert.equal(await resolveAllowedTrack(secretAudio), null);
          assert.equal(await resolveAllowedTrack(path.join(junctionPath, 'secret.mp3')), null);
          const forbiddenResp = await serveMusicTrack(new Request('oneai-music://track?file=' + encodeURIComponent(secretAudio)));
          assert.equal(forbiddenResp.status, 403);

          const rangeResp = await serveMusicTrack(new Request('oneai-music://track?file=' + encodeURIComponent(trackFile), {
            headers: { Range: 'bytes=0-2' },
          }));
          assert.equal(rangeResp.status, 206);
          assert.equal(rangeResp.headers.get('Access-Control-Allow-Origin'), '*');
          assert.equal(await rangeResp.text(), 'ID3');

          // SSRF guard on remote playlists
          assert.equal(isLocalOrLinkLocalHost('127.0.0.1'), true);
          assert.equal(isLocalOrLinkLocalHost('localhost'), true);
          assert.equal(isLocalOrLinkLocalHost('169.254.169.254'), true);
          assert.equal(isLocalOrLinkLocalHost('[::1]'), true);
          assert.equal(isLocalOrLinkLocalHost('stream.example.com'), false);

          const m3u = [
            '#EXTM3U',
            '#EXTINF:-1,Internal Probe',
            'http://127.0.0.1:8080/admin.mp3',
            '#EXTINF:-1,Metadata Probe',
            'http://169.254.169.254/latest/meta-data',
            '#EXTINF:-1,HLS Unsupported',
            'https://cdn.example.com/live.m3u8',
            '#EXTINF:-1,Public Stream',
            '/channels/lofi.mp3',
          ].join('\\n');
          const parsedRemote = parsePlaylist(m3u, new URL('https://radio.example.com/list.m3u'), '.m3u');
          assert.deepEqual(parsedRemote, [{ name: 'Public Stream', url: 'https://radio.example.com/channels/lofi.mp3' }]);

          // Streaming byte cap aborts oversized chunked response without Content-Length
          let cancelled = false;
          const bigStream = new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(600 * 1024));
            },
            cancel() {
              cancelled = true;
            },
          });
          const capped = await readBodyTextCapped(new Response(bigStream), 1024 * 1024);
          assert.equal(capped, null);
          assert.equal(cancelled, true);
        });

        test('task-summary resolves resumed Codex archived sessions and resumed Kimi sessions despite older mtime', async () => {
          const codexHome = path.join(fixtureRoot, 'codex-home');
          const kimiHome = path.join(fixtureRoot, 'kimi-home');
          const projectDir = path.join(fixtureRoot, 'workspace-a');
          await fsp.mkdir(path.join(codexHome, 'archived_sessions'), { recursive: true });
          await fsp.mkdir(path.join(kimiHome, 'sessions', 'proj-hash', 'kimi-sess-old'), { recursive: true });
          await fsp.mkdir(path.join(kimiHome, 'sessions', 'proj-hash', 'kimi-unrelated-old'), { recursive: true });
          await fsp.mkdir(projectDir, { recursive: true });

          const oldTime = new Date(Date.now() - 7 * 24 * 3600_000);
          const archivedRollout = path.join(codexHome, 'archived_sessions', 'rollout-2026-01-01-codex-archived-123.jsonl');
          const codexLines = [
            JSON.stringify({ type: 'session_meta', payload: { id: 'codex-archived-123', cwd: projectDir, source: 'cli', timestamp: oldTime.toISOString() } }),
            JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Resume archived Codex work' } }),
            JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.4', effort: 'medium' } }),
            JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {
              total_token_usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 15, total_tokens: 115 },
              last_token_usage: { input_tokens: 75 }, model_context_window: 100,
            } } }),
          ].join('\\n') + '\\n';
          await fsp.writeFile(archivedRollout, codexLines);
          await fsp.utimes(archivedRollout, oldTime, oldTime);

          const kimiStateFile = path.join(kimiHome, 'sessions', 'proj-hash', 'kimi-sess-old', 'state.json');
          await fsp.writeFile(kimiStateFile, JSON.stringify({
            id: 'kimi-sess-old',
            cwd: projectDir,
            createdAt: oldTime.getTime(),
            lastPrompt: 'Resume old Kimi session',
          }));
          await fsp.utimes(kimiStateFile, oldTime, oldTime);

          const kimiUnrelatedFile = path.join(kimiHome, 'sessions', 'proj-hash', 'kimi-unrelated-old', 'state.json');
          await fsp.writeFile(kimiUnrelatedFile, JSON.stringify({
            id: 'kimi-unrelated-old',
            cwd: projectDir,
            createdAt: oldTime.getTime(),
            lastPrompt: 'Should not leak into new Kimi task',
          }));
          await fsp.utimes(kimiUnrelatedFile, oldTime, oldTime);

          const now = Date.now();
          const summaries = await readTaskSummaries([
            { id: 't-codex-resumed', cliId: 'codex', cwd: projectDir, createdAt: now, historyId: 'codex-archived-123', configDir: codexHome, includeUsage: true },
            { id: 't-codex-other', cliId: 'codex', cwd: projectDir, createdAt: now, configDir: codexHome, includeUsage: true },
            { id: 't-kimi-resumed', cliId: 'kimi', cwd: projectDir, createdAt: now, historyId: 'kimi-sess-old', configDir: kimiHome },
            { id: 't-kimi-fresh', cliId: 'kimi', cwd: projectDir, createdAt: now, configDir: kimiHome },
          ]);

          assert.equal(summaries['t-codex-resumed']?.text, 'Resume archived Codex work');
          assert.equal(summaries['t-codex-resumed']?.usage?.model, 'gpt-5.4');
          assert.equal(summaries['t-codex-resumed']?.usage?.ctxPercent, 75);
          assert.equal(summaries['t-codex-resumed']?.usage?.tokenInput, 20);
          assert.equal(summaries['t-codex-other']?.usage, undefined);
          assert.equal(summaries['t-kimi-resumed']?.text, 'Resume old Kimi session');
          assert.equal(summaries['t-kimi-fresh']?.text, null);
        });

        test('file-preview, path helpers, LRU bounded map and terminal path extractor handle edge cases', async () => {
          const cwd = path.join(fixtureRoot, 'preview-cwd');
          const externalDir = path.join(fixtureRoot, 'external');
          await fsp.mkdir(cwd, { recursive: true });
          await fsp.mkdir(externalDir, { recursive: true });

          const insideText = path.join(cwd, 'notes.md');
          const extImg = path.join(externalDir, 'diagram.png');
          const extSecret = path.join(externalDir, 'secret.txt');
          await fsp.writeFile(insideText, '# hello');
          await fsp.writeFile(extImg, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
          await fsp.writeFile(extSecret, 'top-secret');

          assert.ok(await resolveInside(cwd, 'notes.md'));
          assert.equal(await resolveInside(cwd, extImg), null);
          await allowPreviewFilePaths([extImg, extSecret]);
          assert.ok(await resolveInside(cwd, extImg));
          assert.equal(await resolveInside(cwd, extSecret), null);
          const imgPreview = await readPreview(cwd, extImg);
          assert.equal(imgPreview.kind, 'image');

          // quoteTerminalPath & folderKey
          assert.equal(folderKey('D:/GitHub/OneAI///'), 'd:\\\\github\\\\oneai');
          assert.equal(quoteTerminalPath('D:\\\\plain\\\\a.png'), 'D:\\\\plain\\\\a.png');
          assert.equal(quoteTerminalPath('D:\\\\dir (1)\\\\a&b.png'), '"D:\\\\dir (1)\\\\a&b.png"');
          assert.equal(quoteTerminalPath('D:\\\\q"x.png', true), '"D:\\\\q""x.png"');

          // setBoundedMap LRU behavior
          const lru = new Map<string, number>();
          setBoundedMap(lru, 'a', 1, 3);
          setBoundedMap(lru, 'b', 2, 3);
          setBoundedMap(lru, 'c', 3, 3);
          setBoundedMap(lru, 'a', 10, 3); // refresh 'a'
          setBoundedMap(lru, 'd', 4, 3);  // should evict 'b'
          assert.deepEqual([...lru.keys()], ['c', 'a', 'd']);

          // extractPathMatches (including Claude Read(...) and Markdown [label](path:line) alongside Next.js routes)
          const sample = 'Read(src/App.tsx) [App.tsx](src/App.tsx:12) at (src/(auth)/[id]/page.tsx:42:9) and packages/@scope/pkg/index.ts(18,5) plus Dockerfile:7 and "D:\\\\My Dir\\\\a.ts":99 vs https://example.com/a/b.ts';
          const matches = extractPathMatches(sample);
          assert.deepEqual(
            matches.map((m) => ({ file: m.file, line: m.line })),
            [
              { file: 'src/App.tsx', line: undefined },
              { file: 'App.tsx', line: undefined },
              { file: 'src/App.tsx', line: 12 },
              { file: 'src/(auth)/[id]/page.tsx', line: 42 },
              { file: 'packages/@scope/pkg/index.ts', line: 18 },
              { file: 'Dockerfile', line: 7 },
              { file: 'D:\\\\My Dir\\\\a.ts', line: 99 },
            ],
          );
        });

        test('project-tree lazily lists directories with natural sort, dimmed flags, symlink containment and truncation', async () => {
          const projRoot = path.join(fixtureRoot, 'tree-proj');
          const outsideDir = path.join(fixtureRoot, 'tree-outside');
          await fsp.mkdir(path.join(projRoot, '.git'), { recursive: true });
          await fsp.mkdir(path.join(projRoot, 'node_modules', 'pkg'), { recursive: true });
          await fsp.mkdir(path.join(projRoot, 'src', 'nested'), { recursive: true });
          await fsp.mkdir(path.join(projRoot, 'docs'), { recursive: true });
          await fsp.mkdir(outsideDir, { recursive: true });

          await fsp.writeFile(path.join(projRoot, '.env'), 'KEY=1');
          await fsp.writeFile(path.join(projRoot, 'item10.txt'), '10');
          await fsp.writeFile(path.join(projRoot, 'item2.txt'), '2');
          await fsp.writeFile(path.join(projRoot, 'README.md'), '# hi');
          await fsp.writeFile(path.join(projRoot, 'src', 'App.tsx'), 'export {}');
          await fsp.writeFile(path.join(projRoot, 'src', 'nested', 'index.ts'), 'export {}');
          await fsp.writeFile(path.join(outsideDir, 'leak.txt'), 'nope');

          let hasExtLink = false;
          let hasLoopLink = false;
          try {
            await fsp.symlink(outsideDir, path.join(projRoot, 'ext-link'), 'junction');
            hasExtLink = true;
          } catch {}
          try {
            await fsp.symlink(path.join(projRoot, 'src'), path.join(projRoot, 'src', 'nested', 'loop-up'), 'junction');
            hasLoopLink = true;
          } catch {}

          const rootRes = await listProjectDirectory(projRoot, '');
          assert.equal(rootRes.ok, true);
          assert.deepEqual(
            rootRes.entries.map((e) => ({ name: e.name, isDir: e.isDir, dimmed: Boolean(e.dimmed), relPath: e.relPath })),
            [
              { name: '.git', isDir: true, dimmed: true, relPath: '.git' },
              { name: 'docs', isDir: true, dimmed: false, relPath: 'docs' },
              { name: 'node_modules', isDir: true, dimmed: true, relPath: 'node_modules' },
              { name: 'src', isDir: true, dimmed: false, relPath: 'src' },
              { name: '.env', isDir: false, dimmed: true, relPath: '.env' },
              { name: 'item2.txt', isDir: false, dimmed: false, relPath: 'item2.txt' },
              { name: 'item10.txt', isDir: false, dimmed: false, relPath: 'item10.txt' },
              { name: 'README.md', isDir: false, dimmed: false, relPath: 'README.md' },
            ],
          );

          const nestedRes = await listProjectDirectory(projRoot, 'src/nested');
          assert.equal(nestedRes.ok, true);
          assert.deepEqual(
            nestedRes.entries.map((e) => e.relPath),
            ['src/nested/index.ts'],
          );
          if (hasLoopLink) {
            assert.ok(!nestedRes.entries.some((e) => e.name === 'loop-up'));
          }

          const traversal = await listProjectDirectory(projRoot, '../tree-outside');
          assert.equal(traversal.ok, false);
          assert.equal(traversal.entries.length, 0);

          if (hasExtLink) {
            const extTraversal = await listProjectDirectory(projRoot, 'ext-link');
            assert.equal(extTraversal.ok, false);
            assert.equal(extTraversal.entries.length, 0);
          }

          const capped = await listProjectDirectory(projRoot, '', 3);
          assert.equal(capped.ok, true);
          assert.equal(capped.truncated, true);
          assert.equal(capped.totalCount, 8);
          assert.deepEqual(capped.entries.map((e) => e.name), ['.git', 'docs', 'node_modules']);
        });

        test('quota-service parses Antigravity usage groups and computes universal session metrics', () => {
          const now = Date.parse('2026-11-21T14:00:00Z');
          const raw = [
            'Gemini Models\\tWeekly Limit Remaining\\t75%\\t2026-11-28T10:03:45Z',
            'Gemini Models\\tFive Hour Limit Remaining\\t12%\\t2026-11-21T15:03:45Z',
            'Claude and GPT models\\tWeekly Limit Remaining\\t48%\\t2026-11-25T12:14:20Z',
            'Claude and GPT models\\tFive Hour Limit Remaining\\t100%\\t2026-11-21T18:58:52Z',
            'Gemini 4 Argon\\tGemini 4 Argon Weekly Limit\\t100%\\t2026-11-28T13:58:52Z',
          ].join('\\n');

          const neonOrch = parseAgyUsage(raw, 'Orchestrator (Neon)', now);
          assert.equal(neonOrch.group, 'Gemini Models');
          assert.equal(neonOrch.five.pct, 12);
          assert.equal(neonOrch.seven.pct, 75);

          const neon = parseAgyUsage(raw, 'Gemini 4 Neon (High)', now);
          assert.equal(neon.group, 'Gemini Models');
          assert.equal(neon.five.pct, 12);

          const claude = parseAgyUsage(raw, 'Claude Opus 5.5 (High)', now);
          assert.equal(claude.group, 'Claude and GPT models');
          assert.equal(claude.five.pct, 100);
          assert.equal(claude.seven.pct, 48);

          const gpt = parseAgyUsage(raw, 'GPT-OSS 120B (Medium)', now);
          assert.equal(gpt.group, 'Claude and GPT models');
          assert.equal(gpt.seven.pct, 48);

          const argon = parseAgyUsage(raw, 'Gemini 4 Argon (High)', now);
          assert.equal(argon.group, 'Gemini 4 Argon');
          assert.equal(argon.five.pct, -1);
          assert.equal(argon.seven.pct, 100);

          const argonOrch = parseAgyUsage(raw, 'Orchestrator (Argon)', now);
          assert.equal(argonOrch.group, 'Gemini 4 Argon');
          assert.equal(argonOrch.five.pct, -1);
          assert.equal(argonOrch.seven.pct, 100);

          // An expired snapshot does not establish the new window's balance.
          const expiredRaw = 'Gemini Models\\tFive Hour Limit Remaining\\t12%\\t2026-11-21T13:59:00Z';
          assert.equal(parseAgyUsage(expiredRaw, 'Orchestrator (Neon)', now).five.pct, -1);
          assert.equal(parseAgyUsage(raw, 'Auto', now).seven.pct, -1);

          // computeSessionUsage breakdown + zero preservation
          const full = computeSessionUsage({
            input: 335_000,
            output: 167_000,
            cacheRead: 32_100_000,
            cacheWrite: 0,
            lastCtxTokens: 292_617,
            ctxWindow: 475_000,
            costUsd: 0.24,
          });
          assert.equal(full.tokenInput, 335_000);
          assert.equal(full.tokenOutput, 167_000);
          assert.equal(full.tokenCache, 32_100_000);
          assert.equal(full.tokens, 32_602_000);
          assert.equal(full.cacheHitPercent, 99);
          assert.equal(full.ctxPercent, 62);
          assert.equal(full.ctxTokens, 292_617);
          assert.equal(full.ctxWindow, 475_000);
          assert.equal(full.costUsd, 0.24);

          const zeroCtx = computeSessionUsage({ input: 1000, output: 100, cacheRead: 0, ctxWindow: 1_000_000, ctxPercent: 0 });
          assert.equal(zeroCtx.ctxPercent, 0);
          assert.equal(zeroCtx.cacheHitPercent, 0);

          const agyUsage = computeSessionUsage({ input: 9_000, output: 2_500, cacheRead: 186_000, lastCtxTokens: 195_000 });
          assert.equal(agyUsage.ctxTokens, 195_000);
          assert.equal(agyUsage.ctxPercent, undefined);
          assert.equal(agyUsage.cacheHitPercent, 95);
        });

        test('Codex quota uses window duration and keeps missing or expired balances unknown', () => {
          const now = Date.parse('2026-11-21T14:00:00Z');
          const future = now / 1000 + 3600;
          const data = readCodexRateWindows({
            primary: { window_minutes: 10_080, used_percent: 61, resets_at: future },
            secondary: { window_minutes: 300, used_percent: 7, resets_at: future },
          }, now);
          assert.equal(data.fiveHourPercent, 93);
          assert.equal(data.sevenDayPercent, 39);
          assert.equal(data.fiveHourResetsIn, '1h 0m');
          assert.equal(readCodexRateWindows({ primary: { used_percent: 12 } }, now).fiveHourPercent, -1);
          assert.equal(readCodexRateWindows({ secondary: { window_minutes: 300, used_percent: 12, resets_at: now / 1000 } }, now).fiveHourPercent, -1);
          assert.equal(readCodexRateWindows({ primary: { window_minutes: 300, used_percent: 0 } }, now).fiveHourPercent, 100);
        });

        test('model-pricing, parseAgyUsageGroups and buildDashboardStats aggregate multi-day metrics accurately', () => {
          // Public API pricing vs internal/unpriced models
          const sonnetCost = estimateModelCostUsd('Sonnet 4.6', { input: 1_000_000, output: 100_000, cacheRead: 2_000_000, cacheWrite: 0 });
          assert.ok(sonnetCost !== null && Math.abs(sonnetCost - (3 + 1.5 + 0.6)) < 1e-6);
          const codexCost = estimateModelCostUsd('gpt-5.3-codex', { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 });
          assert.ok(codexCost !== null && Math.abs(codexCost - 17.5) < 1e-6);
          assert.equal(estimateModelCostUsd('Orchestrator (Neon)', { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 }), null);
          assert.equal(estimateModelCostUsd('Gemini 4 Argon', { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 }), null);
          assert.equal(estimateModelCostUsd('codex-auto-review', { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0 }), null);

          // parseAgyUsageGroups extracts every group in order and handles expired reset windows
          const now = Date.parse('2026-11-21T14:00:00Z');
          const rawGroups = [
            'Gemini Models\\tFive Hour Limit Remaining\\t83%\\t2026-11-21T18:30:00Z',
            'Gemini Models\\tWeekly Limit Remaining\\t67%\\t2026-11-28T08:30:00Z',
            'Claude and GPT models\\tFive Hour Limit Remaining\\t10%\\t2026-11-21T13:59:00Z',
            'Claude and GPT models\\tWeekly Limit Remaining\\t48%\\t2026-11-25T12:14:20Z',
            'Gemini 4 Argon\\tGemini 4 Argon Weekly Limit\\t100%\\t2026-11-28T13:58:52Z',
          ].join('\\n');
          const groups = parseAgyUsageGroups(rawGroups, now);
          assert.deepEqual(groups.map((g) => g.group), ['Gemini Models', 'Claude and GPT models', 'Gemini 4 Argon']);
          assert.equal(groups[0].five.pct, 83);
          assert.equal(groups[1].five.pct, -1);
          assert.equal(groups[1].seven.pct, 48);
          assert.equal(groups[2].five.pct, -1);
          assert.equal(groups[2].seven.pct, 100);

          // buildDashboardStats deduplicates by entry.key, normalizes project paths, preserves Pi native cost, and separates unpriced models
          const day1 = new Date(2026, 10, 20, 10, 0, 0).getTime();
          const day2 = new Date(2026, 10, 21, 10, 0, 0).getTime();
          const stats = buildDashboardStats([
            {
              cliId: 'claude',
              accountId: 'default',
              accountName: '默认账号',
              cwd: 'D:\\\\GitHub\\\\OneAI',
              fallbackModel: '',
              entries: [
                { key: 'dup-1', ts: day1, model: 'Sonnet 4.6', input: 100_000, output: 10_000, cacheRead: 200_000, cacheWrite: 0 },
                { key: 'dup-1', ts: day1, model: 'Sonnet 4.6', input: 100_000, output: 10_000, cacheRead: 200_000, cacheWrite: 0 },
                { key: 'msg-2', ts: day2, model: 'Sonnet 4.6', input: 50_000, output: 5_000, cacheRead: 100_000, cacheWrite: 0 },
              ],
            },
            {
              cliId: 'agy',
              accountId: 'default',
              accountName: '默认账号',
              cwd: undefined,
              fallbackModel: 'Orchestrator',
              entries: [
                { ts: day2, model: 'Orchestrator', input: 25_000, output: 410, cacheRead: 0, cacheWrite: 0 },
              ],
            },
            {
              cliId: 'pi',
              accountId: 'default',
              accountName: '默认账号',
              cwd: 'd:/github/oneai/',
              fallbackModel: '',
              entries: [
                { ts: day2, model: 'custom-unlisted', input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, costUsd: 0.12 },
              ],
            },
          ], day2);
          assert.equal(stats.sessions.length, 3);
          assert.equal(stats.projects.length, 1);
          assert.equal(stats.projects[0].name, 'OneAI');
          assert.equal(stats.earliestDate, '2026-11-20');
          assert.equal(stats.records.length, 4);
          const claudeDay1 = stats.records.find((r) => r.date === '2026-11-20' && r.model === 'Sonnet 4.6');
          assert.ok(claudeDay1 && claudeDay1.requests === 1 && claudeDay1.input === 100_000 && claudeDay1.costPriced);
          const agyRec = stats.records.find((r) => r.model === 'Orchestrator');
          assert.ok(agyRec && !agyRec.costPriced && agyRec.costUsd === 0);
          const piRec = stats.records.find((r) => r.model === 'custom-unlisted');
          assert.ok(piRec && piRec.costPriced && Math.abs(piRec.costUsd - 0.12) < 1e-6);
        });

        test('Dashboard deduplicates Codex copies and prices Pi requests individually', () => {
          const now = new Date(2026, 10, 23, 12).getTime();
          const entry = { ts: now, model: 'gpt-5.4', input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 };
          const account = { accountId: 'default', accountName: 'Default', fallbackModel: '' };
          const codex = { ...account, cliId: 'codex' as const, sessionId: 'shared-id', entries: [entry] };
          const unknown = { ...entry, model: 'custom-unlisted' };
          const stats = buildDashboardStats([
            codex,
            { ...codex, entries: [entry, { ...entry, ts: now - 1000 }] },
            { ...codex, accountId: 'other' },
            { ...account, cliId: 'pi', entries: [
              entry, { ...entry, costUsd: 1 },
              unknown, { ...unknown, costUsd: 0 },
            ] },
          ], now);
          assert.equal(stats.sessions.filter((s) => s.cliId === 'codex').length, 2);
          assert.equal(stats.records[0].requests, 2);
          const pi = computeDashboardView(stats, { range: 'today', cliId: 'pi', projectKey: 'all', accountKey: 'all' }, now);
          assert.equal(pi.estimatedCostUsd, 3.5);
          assert.equal(pi.priceCoveragePct, 75);
        });

        test('Dashboard scopes coverage to matching records and keeps the full monthly trend', () => {
          const now = new Date(2026, 10, 23, 12).getTime();
          const entry = { ts: now, model: 'model-a', input: 10, output: 0, cacheRead: 0, cacheWrite: 0 };
          const account = { accountId: 'default', accountName: 'Default', fallbackModel: '' };
          const stats = buildDashboardStats([
            { ...account, cliId: 'claude', entries: [{ ...entry, ts: new Date(2020, 0, 1, 12).getTime() }] },
            { ...account, cliId: 'codex', entries: [
              entry,
              { ...entry, ts: new Date(2026, 10, 15, 12).getTime() },
              { ...entry, model: 'model-b', input: 20 },
            ] },
          ], now);
          const filter = { range: 'all' as const, cliId: 'all' as const, accountKey: 'all', projectKey: 'all' };
          const all = computeDashboardView(stats, filter, now);
          assert.equal(all.trend.buckets.at(-1)?.key, '2026-11');
          assert.equal(all.trend.buckets.reduce((sum, b) => sum + b.tokens, 0), all.totalTokens);
          const model = all.breakdowns.model.find((m) => m.key === 'codex:model-a');
          assert.ok(model?.filterPatch);
          const modelView = computeDashboardView(stats, { ...filter, ...model.filterPatch }, now);
          assert.equal(modelView.totalTokens, 20);
          assert.equal(modelView.modelRows.length, 1);
          assert.equal(modelView.heatmap.weeks.flat().find((cell) => cell.date === '2026-11-14')?.status, 'missing');
          const week = computeDashboardView(stats, { ...filter, range: '7d', cliId: 'codex' }, now);
          assert.equal(week.comparison.prevTokens, 10);
          assert.equal(week.comparison.deltaPct, null);
        });

        test('Updater compares semver, normalizes release notes, builds release URLs and gates auto-update', () => {
          assert.equal(compareSemver('2.2.8', '2.2.7'), 1);
          assert.equal(compareSemver('v2.3.0', '2.2.99'), 1);
          assert.equal(compareSemver('2.2.7', 'v2.2.7'), 0);
          assert.equal(compareSemver('2.2.7', '2.2.8'), -1);
          assert.equal(compareSemver('2.2.8', '2.2.8-beta.1'), 1);
          assert.equal(compareSemver('2.2.8-beta.2', '2.2.8-beta.1'), 1);
          assert.equal(compareSemver('invalid', '2.2.7'), 0);

          assert.equal(buildReleaseUrl('2.2.8'), 'https://github.com/Qingxuan365/oneAI/releases/tag/v2.2.8');
          assert.equal(buildReleaseUrl('v2.2.8'), 'https://github.com/Qingxuan365/oneAI/releases/tag/v2.2.8');
          assert.equal(buildReleaseUrl(), 'https://github.com/Qingxuan365/oneAI/releases');
          assert.equal(extractVersionFromReleaseUrl('https://github.com/Qingxuan365/oneAI/releases/tag/v2.2.8'), '2.2.8');
          assert.equal(extractVersionFromReleaseUrl('https://github.com/Qingxuan365/oneAI/releases'), null);

          assert.equal(normalizeReleaseNotes('<p>Hello &amp; <b>world</b></p><ul><li>Fix 1</li><li>Fix 2</li></ul>'), 'Hello & world\\n- Fix 1\\n- Fix 2');
          assert.equal(normalizeReleaseNotes([{ version: '2.2.8', note: 'Added updater' }]), 'v2.2.8\\nAdded updater');
          assert.equal(normalizeReleaseNotes(null), '');
          const trilingual = '## 简体中文\\n- 简体条目\\n\\n## 繁體中文\\n- 繁體條目\\n\\n## English\\n- English item';
          assert.equal(selectLocalizedReleaseNotes(trilingual, 'zh-CN'), '- 简体条目');
          assert.equal(selectLocalizedReleaseNotes(trilingual, 'zh-TW'), '- 繁體條目');
          assert.equal(selectLocalizedReleaseNotes(trilingual, 'en'), '- English item');
          const bilingual = '## 更新内容\\n- 中文条目\\n\\n## What\\'s New\\n- English item';
          assert.equal(selectLocalizedReleaseNotes(bilingual, 'zh-CN'), '- 中文条目');
          assert.equal(selectLocalizedReleaseNotes(bilingual, 'zh-TW'), '- 中文条目');
          assert.equal(selectLocalizedReleaseNotes(bilingual, 'en'), '- English item');
          assert.equal(selectLocalizedReleaseNotes('- Single language note', 'zh-CN'), '- Single language note');

          assert.equal(canUseAutoUpdater({ isPackaged: true, appUpdateYmlExists: true }), true);
          assert.equal(canUseAutoUpdater({ isPackaged: false, appUpdateYmlExists: true }), false);
          assert.equal(canUseAutoUpdater({ isPackaged: true, portableDir: 'D:/portable', appUpdateYmlExists: true }), false);
          assert.equal(canUseAutoUpdater({ isPackaged: true, appUpdateYmlExists: false }), false);
        });
      `,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: suiteFile,
    plugins: [stubPlugin],
  });

  const fixtureRoot = path.join(outDir, 'fixtures');
  await fs.mkdir(fixtureRoot, { recursive: true });
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [suiteFile], {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, ONEAI_CHECK_FIXTURE_ROOT: fixtureRoot },
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
}
