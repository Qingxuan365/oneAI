import hljs from 'highlight.js/lib/common';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import powershell from 'highlight.js/lib/languages/powershell';

hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('powershell', powershell);

export interface PreviewToken { text: string; className: string }

const MAX_HIGHLIGHT_CHARS = 1024 * 1024;
const MINIFIED_CHECK_CHARS = 50_000;
const MAX_AVG_LINE_CHARS = 2_000;

const languages: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyw: 'python', json: 'json', jsonc: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml',
  md: 'markdown', yaml: 'yaml', yml: 'yaml',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', psm1: 'powershell',
  java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sql: 'sql',
  ini: 'ini', toml: 'ini', kt: 'kotlin', kts: 'kotlin', swift: 'swift', lua: 'lua',
  diff: 'diff', patch: 'diff', graphql: 'graphql', gql: 'graphql',
};

function isMinifiedText(content: string): boolean {
  if (content.length <= MINIFIED_CHECK_CHARS) return false;
  let lineCount = 1;
  for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1)) lineCount++;
  return content.length / lineCount > MAX_AVG_LINE_CHARS;
}

function scopeToClassName(scope: string | undefined): string {
  if (!scope) return '';
  if (scope.startsWith('language:')) return scope.replace('language:', 'language-');
  if (scope.includes('.')) {
    const pieces = scope.split('.');
    return [`hljs-${pieces.shift()}`, ...pieces.map((part, i) => `${part}${'_'.repeat(i + 1)}`)].join(' ');
  }
  return `hljs-${scope}`;
}

interface EmitterTree {
  walk?: (renderer: {
    addText: (text: string) => void;
    openNode: (node: { scope?: string }) => void;
    closeNode: (node: { scope?: string }) => void;
  }) => void;
}

/** Parse the whole file so multiline tokens retain their scope across displayed lines. */
export function highlightPreview(content: string, filePath: string): PreviewToken[][] | null {
  const name = filePath.split(/[\\/]/).pop()?.toLowerCase() || '';
  const language = name === 'dockerfile' || name === 'makefile' ? name : languages[name.split('.').pop() || ''];
  if (!language || content.length > MAX_HIGHLIGHT_CHARS || !hljs.getLanguage(language)) return null;
  const normalized = content.replace(/\r\n?/g, '\n');
  if (isMinifiedText(normalized)) return null;
  try {
    const highlighted = hljs.highlight(normalized, { language, ignoreIllegals: true }) as unknown as { value: string; _emitter?: EmitterTree };
    const lines: PreviewToken[][] = [[]];
    const appendText = (raw: string, className: string) => {
      let pos = 0;
      let nl = raw.indexOf('\n');
      if (nl < 0) {
        if (raw) lines[lines.length - 1].push({ text: raw, className });
        return;
      }
      while (nl >= 0) {
        const segment = raw.slice(pos, nl);
        if (segment) lines[lines.length - 1].push({ text: segment, className });
        lines.push([]);
        pos = nl + 1;
        nl = raw.indexOf('\n', pos);
      }
      const tail = raw.slice(pos);
      if (tail) lines[lines.length - 1].push({ text: tail, className });
    };

    if (typeof highlighted._emitter?.walk === 'function') {
      const scopeStack: string[] = [];
      let currentClass = '';
      highlighted._emitter.walk({
        addText(text) {
          appendText(text, currentClass);
        },
        openNode(node) {
          const cls = scopeToClassName(node.scope);
          if (!cls) return;
          scopeStack.push(cls);
          currentClass = scopeStack.join(' ');
        },
        closeNode(node) {
          if (!node.scope) return;
          scopeStack.pop();
          currentClass = scopeStack.join(' ');
        },
      });
      return lines;
    }

    const template = document.createElement('template');
    template.innerHTML = highlighted.value;
    const visit = (node: Node, className: string) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendText(node.textContent || '', className);
      } else {
        const scope = node instanceof Element ? `${className} ${node.className}`.trim() : className;
        node.childNodes.forEach((child) => visit(child, scope));
      }
    };
    visit(template.content, '');
    return lines;
  } catch {
    return null;
  }
}
