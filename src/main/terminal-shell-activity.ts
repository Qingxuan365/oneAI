import { CounterReader } from './system-stats';

// Only return process identities and roles from PowerShell. Command lines can
// include credentials, so they never reach the app or its logs.
const PROCESS_SCRIPT = String.raw`
while ($null -ne [Console]::In.ReadLine()) {
  try {
    $rows = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate,Name,CommandLine -ErrorAction Stop
    $result = foreach ($row in $rows) {
      if ($null -eq $row.CreationDate) { continue }
      $line = [string]$row.CommandLine
      $role = 'other'
      if ($row.Name -match '^(claude|codex|agy|kimi|kimi-code|pi)\.exe$' -or
          ($row.Name -match '^(node|bun)\.exe$' -and $line -match '(?i)^\s*(?:"[^"]+"|\S+)\s+"?[^"\r\n]*[\\/]pi-coding-agent[\\/][^"\r\n]*\.js(?:"|\s|$)')) {
        $role = 'cli'
      } elseif ($row.Name -match '^(cmd|powershell|pwsh|bash|sh|dash|zsh|fish)\.exe$' -and
                $line -match '(?i)(?:^|\s)(?:/c|-(?:[a-z]*c|command|encodedcommand|file))(?=\s|$)') {
        # Stdio MCP launchers use the same shell flags as tool commands.
        $role = if ($line -match '(?i)(?:^|[\s"\\/])(?:mcp|mcp-server[\w-]*|[\w-]+-mcp(?:-server)?|--stdio)(?:[.\s"\\/]|$)') { 'service' } else { 'shell' }
      }
      '{0},{1},{2},{3}' -f $row.ProcessId,$row.ParentProcessId,$row.CreationDate.ToFileTimeUtc(),$role
    }
    [Console]::Out.WriteLine(($result -join ';'))
  } catch { [Console]::Out.WriteLine('error') }
}`;

export function findActiveShellRoots(snapshot: string, roots: Iterable<number>): Set<number> {
  const rootIds = new Set(roots);
  const processes = new Map<number, { parent: number; created: bigint; role: string }>();
  for (const record of snapshot.split(';')) {
    const [id, parent, created, role] = record.split(',');
    if (!/^\d+$/.test(created ?? '')) continue;
    processes.set(Number(id), { parent: Number(parent), created: BigInt(created), role });
  }
  const active = new Set<number>();
  for (const [id, process] of processes) {
    if (process.role !== 'shell') continue;
    let insideCli = false;
    let current = process;
    const visited = new Set([id]);
    for (let ancestorId = process.parent; !visited.has(ancestorId);) {
      visited.add(ancestorId);
      const ancestor = processes.get(ancestorId);
      // A recycled PID can appear as the parent of an older process.
      if (!ancestor || ancestor.created > current.created || ancestor.role === 'service') break;
      if (ancestor.role === 'cli') insideCli = true;
      if (rootIds.has(ancestorId)) {
        if (insideCli) active.add(ancestorId);
        break;
      }
      current = ancestor;
      ancestorId = ancestor.parent;
    }
  }
  return active;
}

export const terminalShellReader = new CounterReader(PROCESS_SCRIPT);
