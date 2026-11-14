[简体中文](README.md) | **English**

# OneAI Workbench

OneAI is a desktop workbench for running several local AI coding CLIs (Codex, Claude Code, Kimi Code, OpenCode and more) side by side. Every task runs in its own real terminal, and sessions stay alive while you switch between tasks and folders.

---

## Features

1. **Folder tree and multiple tasks (left sidebar)**
   - Each task row shows the official brand logo of its CLI (Codex, Kimi Code, OpenCode and others).
   - The first level is the working folder (Git branch badge, task count, collapse state). The second level is the tasks running concurrently in that folder, each with its own status light and close button. Terminals in several folders run at the same time, and switching tasks or folders never ends a terminal.
   - `Tab` moves focus across folders, tasks and close buttons, and `Enter` or `Space` activates them. The close button appears when a task row has focus. Running and waiting status dots stay static.
   - The "+" on a folder row opens a CLI menu. Choosing a CLI starts a task in that folder immediately with the default name (`Task N`) and the CLI's default command, with no dialog. CLIs that have accounts also get a "New with <account>" entry. "Custom command and directory..." in the menu, or `Ctrl + Shift + N`, opens a dialog to set the CLI, name, command and directory. `Ctrl + Shift + T` creates a task in the current folder with the current task's CLI.
   - The second line of a task row shows the latest user message in that task's session (Claude Code, Codex, Kimi Code). A session with no message yet shows "New session · creation time", using the same offset as the top bar clock (Settings → Time). Other CLIs have no readable session file and stay single-line. It refreshes every 5 seconds, stopped tasks included. Tasks with an account read sessions from that account's config directory.
   - The task-to-session mapping is heuristic. A task restored from history is matched by session id. Other tasks are matched by "session start time is not earlier than the task creation time", assigning the session to the most recently created task with the same folder and CLI (and the same account directory). With several tasks of the same kind running concurrently in one folder the match can be wrong, and sessions you start by hand outside OneAI in the same folder can be misattributed.
   - Right-click a folder to create a task, open it in File Explorer, copy its path, or remove it from the sidebar. Removing ends its terminals and removes its tasks, and the CLIs' history sessions are not affected.
   - The "Recent tasks" section groups local Claude Code, Codex and Kimi Code history sessions by folder. Folders already under "Current tasks" are not repeated, with at most 8 folders and 5 sessions each. It is collapsed by default, and clicking a session restores it as a current task. CLIs without readable history do not appear here.
   - The Git branch badge only reads `.git/HEAD`. It searches upward for the repository, supports worktrees, shows a 7-character commit for a detached HEAD, runs no git command and shows no change status. It refreshes when the folder list changes, when the window gains focus, and every 30 seconds.
   - When a background task stops producing output (turns idle) or its process exits, its sidebar row shows "Needs review". On the collapsed rail the mark is a solid highlight, and the count of a collapsed folder changes color with it. The mark disappears once you switch to the task. It is based on output silence only, so it does not distinguish "finished" from "waiting for confirmation", and it is not kept after restarting the app.
   - Right-click a task to rename, restart (start, when stopped), copy the working directory, open the directory in File Explorer, or close the task. Middle-click a task, or press `Ctrl + Shift + W`, to close the current task. A task whose process is still running asks for confirmation first.
   - Tasks can be reordered by dragging within their folder (not across folders), or with `Alt + ↑/↓` when a task has focus. The numbers of `Ctrl + digit` follow the order.
   - Double-click a task or press `F2` to rename it. `Ctrl + Tab` / `Ctrl + Shift + Tab` switch tasks, `Ctrl + 1…9` jumps to the Nth task, and `Ctrl + Shift + B` collapses the sidebar. The full list is in Settings → Shortcuts.
   - When the music directory contains audio files, a mini player appears at the bottom of the sidebar. The directory is chosen in Settings → Reminders.
   - Drag the handle left of a folder name to reorder folders, or focus the handle and press `Alt + ↑/↓`.
   - The top of the sidebar shows the logo, the `All agents in one.` tagline, the version (taken from `package.json`) and a greeting.
   - The sidebar button at the left end of the top bar collapses or expands the navigation. The state is saved and the current terminals keep running. A collapsed sidebar keeps a narrow rail: one button per folder (click to open the CLI menu and create a task), task number buttons below it (click to switch), and Add folder and Settings at the bottom.

2. **Single-line live quota in the top bar (top right)**
   - Flat, single-line plain text, for example `Tokens: 8.2M • Cost: $4.29 • 5h: 82% (2h 45m) • 7d: 65% (Resets Sun) • Model: Sonnet 5.5 medium ↻`.
   - No popups, no floating cards, no overlays. It includes a countdown and a minimal refresh control.
   - Search, clear screen, restart and log export sit right next to the session status, and restart is disabled while a task is starting. When space runs out, the bar collapses the clock, network speed, memory, CPU, Tokens / Cost, quota reset time and model name in that order, and truncates the task title. Collapsed quota details remain available in the hover tooltip.
   - Quota and the refresh button are hidden when there is no active terminal session. For Claude Code, the model and reasoning level come from the statusLine snapshot. For Codex they come from the latest turn in the session log (or from `config.toml` if it was changed afterwards), and they update right after you switch inside the session.
   - The top bar clock shows system time by default. Settings → Time lets you add an offset of -24 to 24 hours.
   - Tokens and Cost are cumulative values of the most recently active session. Claude Code Tokens are accumulated from the session log (input + output + cache read and write, excluding separate subagent records), and Cost comes from the statusLine snapshot. Codex has Tokens only (the cumulative tokens of the latest session) and no Cost. Other CLIs show neither. When several sessions of the same CLI run in parallel, they cannot be told apart.
   - The right side of the top bar also shows machine-wide `CPU / Mem / Net`, refreshed every 2 seconds regardless of whether a terminal is open, and paused while the window is minimized. Network speed counts only physical adapters in the Up state (no VPN or proxy virtual adapters, no loopback) and needs the Windows PowerShell that ships with the system.

   - The native title bar is hidden. The top bar and the sidebar brand header drag the window, and the minimize / maximize / close buttons are at the top right, with color and height following the theme and UI scale.
   - With no active task, the left of the top bar shows the folder and Git branch where a new task will start. The middle area lists the 3 most recent history sessions (click to restore) and a new-task button for each CLI.
   - The history button at the right of the top bar (or `Ctrl + Shift + H`) opens the history drawer. Sessions are grouped into Today / Yesterday / Earlier with folder name, Git branch and relative time. Sessions already open in the sidebar are marked "Open". You can filter by CLI, search, and delete (deleting also removes the local session file).
   - The usage button left of the history button (or `Ctrl + Shift + U`) opens the "Weekly usage" panel. It reads local session records of Claude Code, Codex, Antigravity and Pi, including the directories of configured accounts. Codex is read from both `sessions` and `archived_sessions`, including compressed `.jsonl.zst` files, and Codex auto-review child sessions are listed at the end of the Codex group, marked "Child session". Rows are grouped CLI → account → model, each group with request and Token subtotals. A CLI that has only the default account does not show the account level. Account names come from Settings → Accounts, and the default account is shown as "Default account". Antigravity and Pi cannot tell accounts apart, so they all count under the default account. For this week (starting Monday) it lists requests, sessions and input / output / cache Tokens per model under each CLI, plus a green square chart of daily requests over the last 26 weeks, similar to the GitHub contribution graph (darker means more requests that day, and hovering shows the requests per CLI and account). A request is one model reply. Antigravity records have no model field, so the model name is inferred from switch records inside the session. Kimi Code and OpenCode are not counted yet, for lack of verifiable local session samples. Conversations that exist only in Codex's SQLite thread store (`thread_history_1.sqlite`) without a session file are not counted either. The first open has to decompress history sessions and can take a few seconds, after which results come from a cache. The machine keeps session records for a limited time, so earlier dates show as empty.

3. **High-performance keep-alive terminal viewport**
   - Built on `@xterm/xterm` and the native Windows ConPTY driver (`node-pty`).
   - Paths in terminal output that point to real files inside the task's working directory (absolute or relative, optionally with `:line`) are rendered as links. `Ctrl` + click opens a read-only preview panel on the right of the terminal, and URLs also open with `Ctrl` + click. The panel supports text and images, and its width is draggable. Text previews carry a VS Code style code minimap on the right that shows the visible range, and clicking or dragging it scrolls quickly. It can be toggled in Settings → Terminal → File preview (on by default). With a line number the preview jumps to and highlights that line. Preview text can be selected and copied, and clicking the path again or the refresh button re-reads the file. Text over 1 MB, images over 5 MB, binary files and files outside the working directory are not previewed.
   - In AI CLI tasks, `Shift + Enter` inserts a newline in the input box (system terminal tasks keep the normal Enter). `Ctrl + Shift + F` searches terminal content, highlights all matches and shows the match count.
   - Exported and copied session text is taken from what the terminal actually renders, scrollback included (up to 5000 lines).
   - Closing the window while terminal processes are still running asks for confirmation first.
   - When you switch sessions and subtasks in the sidebar, the DOM is shown and hidden rather than destroyed, so processes keep running and output and context are never interrupted or lost.
   - It adapts to window resizing and recalculates character rows and columns automatically.

4. **Working folders**
   - "Add folder" at the bottom of the sidebar adds a local folder. It only adds, and never ends terminals that are already running. With no active task, new tasks start in the most recently used folder by default.
   - The folder list, the tasks of each folder and the current selection are saved together and restored after a restart (tasks come back as stopped and start when selected).
   - When upgrading from an older version, the first launch merges the old per-folder task stores by directory (empty workspaces are not imported). The old data is kept as is and not deleted.
   - The "Working directory" in the new task dialog can be changed to another folder, and the task then appears under that folder.

5. **Themes**
   - The settings button at the bottom left offers "System", "Light" and "Dark". The choice takes effect immediately and is saved locally, and "System" follows the system appearance.
   - Settings → Appearance also has eye-care palettes (Bean Green, Parchment, Warm Night, Arctic Gray Blue) and editor palettes: Darcula, Sublime Material, the built-in Sublime Text themes Monokai, Mariana, Breakers, Solarized Dark, Solarized Light and Cobalt, the bundled IntelliJ IDEA themes IntelliJ Light, IDEA Light, IDEA Dark (new UI) and IDEA High Contrast, and Kiro IDE's Kiro Dark and Kiro Light. Terminal colors switch along with them.
   - Interface colors are all driven by semantic color variables. Task names and main quota text use 13px, and secondary text is at least 12px (at the default UI scale).

6. **Multiple accounts (Codex, Claude Code, Kimi Code)**
   - Settings → Accounts lets you add several accounts for each of these three CLIs. An account is an independent config directory (credentials and session records both live in it). When a task starts, `CODEX_HOME`, `CLAUDE_CONFIG_DIR` and `KIMI_CODE_HOME` are injected respectively, and a missing directory is created automatically. Optional extra environment variables (such as a proxy) are stored as plain text in the local app settings, so do not put secrets there.
   - "Log in" on an account opens a new terminal task in that account's environment running `codex login` / `claude auth login` / `kimi login`. The login state in the list comes from `codex login status` / `claude auth status`. Kimi Code has no status command, so OneAI only checks whether the credentials file exists. OneAI never copies or reads credentials.
   - The new task dialog lets you pick an account, and in the folder "+" menu every CLI with accounts gets a "New with <account>" entry. The task row and the top bar breadcrumb show the account name. A restart keeps the account the task is bound to. If the account configuration is deleted, the task refuses to start and does not fall back to the default account. "Restore defaults" does not clear accounts.
   - Top bar quota follows the task's account. Codex and Kimi Code read from that account's directory. For a non-default Claude Code account, only the model and reasoning level are shown and quota reads "--", because quota comes from a shared statusLine snapshot that cannot tell accounts apart.

7. **Work-time reminder**
   - After OneAI has been open for the set time (1 hour by default, adjustable from 1 to 12 hours), a break reminder dialog appears that must be closed manually, and by default a voice message is read out once. Settings → Reminders adjusts the duration or turns off the voice, and the dialog still appears. Closing the app resets the timer.

---

## Tech stack

- **Desktop runtime**: Electron 31 + Node.js
- **System pseudo terminal**: `node-pty` (Windows ConPTY API)
- **Frontend and terminal engine**: React 18 + TypeScript + Tailwind CSS + Lucide React + `@xterm/xterm`
- **Build pipeline**: Vite 5 + `vite-plugin-electron`

---

## Quick start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the dev workbench
```bash
npm run dev
```

### 3. Build and package
```bash
npm run build
npm run build:win        # Installer: release/OneAI-Setup-<version>.exe
npm run build:portable   # Portable (optional): release/OneAI-Portable-<version>.exe
```

If an old artifact is locked and cannot be overwritten, write the new one to a separate directory:

```bash
npm run build:win -- --config.directories.output=release/ui-polish
```

### 4. UI regression check

```bash
npm run check:ui
```

It uses a hidden Electron window to check theme colors, status text, font sizes, keyboard operation, the top bar layout at different widths, the sidebar "Needs review" mark, context menus and task ordering, plus terminal paste, search, link targeting and file preview. Check artifacts are written to `.tmp/ui-polish/`.
