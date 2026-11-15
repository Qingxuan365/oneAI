// claude-sonnet-5-5 -> Sonnet 5.5；别名 sonnet/opus/haiku 首字母大写
export function formatClaudeModel(id: string): string {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/i);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`;
  return /^[a-z]+$/.test(id) ? id[0].toUpperCase() + id.slice(1) : id;
}

