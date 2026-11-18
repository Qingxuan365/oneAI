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
        const paths = globalThis.__ONEAI_TEST_PATHS__ || {};
        module.exports = {
          app: {
            getPath: (name) => paths[name] || path.join(paths.root || process.cwd(), name),
          },
          ipcMain: { handle() {}, on() {} },
          protocol: { handle() {}, registerSchemesAsPrivileged() {} },
          dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
          BrowserWindow: class {},
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
        import { parseTomlStrings } from './src/main/quota-service';
        import { isLocalOrLinkLocalHost, listTracks, parsePlaylist, readBodyTextCapped, resolveAllowedTrack, serveMusicTrack } from './src/main/music-library';
        import { readTaskSummaries } from './src/main/task-summary';
        import { allowPreviewFilePaths, readPreview, resolveInside } from './src/main/file-preview';
        import { setBoundedMap } from './src/main/fs-utils';
        import { folderKey, quoteTerminalPath, extractPathMatches } from './src/shared/paths';

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

        test('PtyManager snapshot, fast-exit tracking, restart fresh options and command wrapping', () => {
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

          const mgr = new PtyManager();
          const sent: Array<{ channel: string; payload: any }> = [];
          mgr.setWindow({
            isDestroyed: () => false,
            webContents: { send: (channel: string, payload: any) => sent.push({ channel, payload }) },
          } as any);

          // Unconfigured restart fails cleanly instead of falling back to plain PowerShell in OneAI cwd
          const missingRestart = mgr.restartSession('never-seen');
          assert.equal(missingRestart.success, false);
          assert.ok(missingRestart.error);

          // Quoted executable path gets PowerShell call operator (&) and account env
          const createRes = mgr.createSession({
            id: 'task-1',
            command: '"C:\\\\Program Files\\\\Tool\\\\cli.cmd" --flag',
            cwd: workDir,
            account: { cliId: 'codex', configDir: accDir1, env: { CUSTOM_VAR: 'v1' } },
          });
          assert.equal(createRes.success, true);
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

          // Fast exit records exitCode in snapshot
          spawned[0].emitExit(17);
          const deadSnap = mgr.getSessionSnapshot('task-1');
          assert.equal(deadSnap.alive, false);
          assert.equal(deadSnap.exitCode, 17);
          assert.equal(deadSnap.buffer, 'boot-line\\r\\n');

          // Restart with updated account env refreshes env and keeps seq monotonic
          const restartRes = mgr.restartSession('task-1', {
            account: { cliId: 'codex', configDir: accDir2, env: { CUSTOM_VAR: 'v2' } },
          });
          assert.equal(restartRes.success, true);
          assert.equal(spawned.length, 2);
          assert.equal(spawned[1].options.env.CODEX_HOME, accDir2);
          assert.equal(spawned[1].options.env.CUSTOM_VAR, 'v2');
          spawned[1].emitData('hi');
          assert.ok(mgr.getSessionSnapshot('task-1').seq > deadSnap.seq);

          // Pi uses useConptyDll while pwsh / wsl open interactive shells directly
          mgr.createSession({ id: 'task-pi', command: 'pi --continue', cwd: workDir });
          assert.equal(spawned.at(-1)!.options.useConptyDll, true);
          mgr.createSession({ id: 'task-pwsh', command: 'pwsh', cwd: workDir });
          assert.equal(spawned.at(-1)!.file, 'pwsh.exe');
          assert.deepEqual(spawned.at(-1)!.args, ['-NoExit', '-ExecutionPolicy', 'Bypass']);
          mgr.createSession({ id: 'task-wsl', command: 'wsl', cwd: workDir });
          assert.equal(spawned.at(-1)!.file, 'wsl.exe');
          mgr.createSession({ id: 'task-comment', command: 'mycli --fast # trailing comment', cwd: workDir, shell: true });
          assert.match(spawned.at(-1)!.args.at(-1)!, /mycli --fast # trailing comment\\nif \\(\\$null -ne \\$LASTEXITCODE\\)/);
          mgr.destroyAll();
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
            { id: 't-codex-resumed', cliId: 'codex', cwd: projectDir, createdAt: now, historyId: 'codex-archived-123', configDir: codexHome },
            { id: 't-kimi-resumed', cliId: 'kimi', cwd: projectDir, createdAt: now, historyId: 'kimi-sess-old', configDir: kimiHome },
            { id: 't-kimi-fresh', cliId: 'kimi', cwd: projectDir, createdAt: now, configDir: kimiHome },
          ]);

          assert.equal(summaries['t-codex-resumed']?.text, 'Resume archived Codex work');
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
