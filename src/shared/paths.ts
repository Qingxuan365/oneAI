/** 文件夹的比较键：忽略大小写、末尾分隔符与正反斜杠差异 */
export function folderKey(folder: string): string {
  return folder.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}

/**
 * 为粘贴或拖入终端的文件路径按需包裹双引号：
 * 含空白或 PowerShell / cmd 元字符时包裹双引号并将内部双引号转义为两个，纯常规字符路径保持原样。
 */
export function quoteTerminalPath(filePath: string, alwaysQuote = false): string {
  if (!filePath) return '';
  if (alwaysQuote || /[\s&()'^;,\[\]{}$`]/.test(filePath)) {
    return `"${filePath.replace(/"/g, '""')}"`;
  }
  return filePath;
}

export interface PathMatchItem {
  raw: string;
  file: string;
  line?: number;
  start: number;
  length: number;
}

function stripLocationSuffix(raw: string): { file: string; line?: number } {
  const colonMatch = raw.match(/:(\d+)(?::\d+)?$/);
  if (colonMatch) {
    return { file: raw.slice(0, -colonMatch[0].length), line: Number(colonMatch[1]) };
  }
  const parenMatch = raw.match(/\((\d+),\d+\)$/);
  if (parenMatch) {
    return { file: raw.slice(0, -parenMatch[0].length), line: Number(parenMatch[1]) };
  }
  return { file: raw };
}

/**
 * 从终端逻辑行文本中提取可能的文件路径候选（最多 20 条，不重叠）：
 * - 支持相对/绝对路径、含 `@` `+` 及路径分隔符后成对 `(group)` / `[param]` 的路由段（不误吞 `Read(src/a.ts)` 或 `[a.ts](src/a.ts)` 外层括号）
 * - 支持 `:line`、`:line:col` 与 TypeScript `(line,col)` 行列后缀
 * - 支持 `Dockerfile` / `Makefile` 等无扩展名构建文件
 * - 支持带双引号的路径（拖入或粘贴含空格路径，`:line` 在引号内或紧随引号外均可）
 */
export function extractPathMatches(text: string): PathMatchItem[] {
  const found: PathMatchItem[] = [];
  const spans: Array<[number, number]> = [];
  const urlSpans: Array<[number, number]> = [];
  for (const urlMatch of text.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    const start = urlMatch.index ?? 0;
    urlSpans.push([start, start + urlMatch[0].length]);
  }
  const addCandidate = (start: number, length: number, raw: string, file: string, line?: number) => {
    if (found.length >= 20 || length <= 0 || !file) return;
    const end = start + length;
    if (urlSpans.some(([s, e]) => start < e && end > s)) return;
    if (spans.some(([s, e]) => start < e && end > s)) return;
    spans.push([start, end]);
    found.push({ raw, file, line, start, length });
  };

  let match: RegExpExecArray | null;
  // 1. 带双引号的绝对或显式相对路径（优先识别，避免带空格路径的后半截被拆成裸文件名）
  const quotedRegex = /"((?:[A-Za-z]:[\\/](?![\\/])|\.{1,2}[\\/])[^"\r\n]+?)"(?::(\d+)(?::\d+)?|\((\d+),\d+\))?/g;
  while ((match = quotedRegex.exec(text)) !== null && found.length < 20) {
    const inner = match[1];
    const outerLine = match[2] || match[3];
    const stripped = stripLocationSuffix(inner);
    const file = stripped.file;
    const line = outerLine ? Number(outerLine) : stripped.line;
    if (outerLine) {
      const fullAfterOpenQuote = match[0].slice(1);
      addCandidate(match.index + 1, fullAfterOpenQuote.length, fullAfterOpenQuote, file, line);
    } else {
      addCandidate(match.index + 1, inner.length, inner, file, line);
    }
  }

  // 2. 常见有扩展名路径（仅在路径分隔符后允许成对的 (group) 或 [param] 路由段）
  const pathRegex = /(?:(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/])|\.{1,2}[\\/]|\b)(?:[\w.\-@+\u4e00-\u9fa5\\/]|(?<=[\\/])\([\w.\-]+\)|(?<=[\\/])\[[\w.\-]+\])*?(?:[\w\-@+\u4e00-\u9fa5]|(?<=[\\/]\([\w.\-]+)\)|(?<=[\\/]\[[\w.\-]+)\])\.[A-Za-z][A-Za-z0-9]{0,7}(?::\d+(?::\d+)?|\(\d+,\d+\))?(?![\w/\\]|\.\w)/g;
  while ((match = pathRegex.exec(text)) !== null && found.length < 20) {
    const raw = match[0];
    const { file, line } = stripLocationSuffix(raw);
    addCandidate(match.index, raw.length, raw, file, line);
  }

  // 3. 无扩展名常见构建文件（Dockerfile / Makefile 等）
  const specialRegex = /(?:(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/])|\.{1,2}[\\/]|\b)(?:(?:[\w.\-@+\u4e00-\u9fa5\\/]|(?<=[\\/])\([\w.\-]+\)|(?<=[\\/])\[[\w.\-]+\])*[\\/])?(?:Dockerfile|Makefile|GNUmakefile|Justfile|Procfile|Rakefile|Gemfile)(?::\d+(?::\d+)?|\(\d+,\d+\))?(?![\w/\\.\-])/g;
  while ((match = specialRegex.exec(text)) !== null && found.length < 20) {
    const raw = match[0];
    const { file, line } = stripLocationSuffix(raw);
    addCandidate(match.index, raw.length, raw, file, line);
  }

  found.sort((a, b) => a.start - b.start);
  return found;
}
