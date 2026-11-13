import { Account, SessionAccount } from './types';

/** 支持多账号的 CLI：id 即 CliDef.id。登录命令在该账号的环境下于终端任务中运行。 */
export const ACCOUNT_CLIS: Array<{
  id: Account['cliId'];
  name: string;
  envVar: string;
  defaultDir: string;
  loginCommand: string;
}> = [
  { id: 'codex', name: 'Codex', envVar: 'CODEX_HOME', defaultDir: '~\\.codex', loginCommand: 'codex login' },
  { id: 'claude', name: 'Claude Code', envVar: 'CLAUDE_CONFIG_DIR', defaultDir: '~\\.claude', loginCommand: 'claude auth login' },
  { id: 'kimi', name: 'Kimi Code', envVar: 'KIMI_CODE_HOME', defaultDir: '~\\.kimi-code', loginCommand: 'kimi login' },
];

export function accountCli(id: string) {
  return ACCOUNT_CLIS.find((cli) => cli.id === id);
}

/** 额度、状态等按「键」缓存：账号用账号 id，默认账号用分组 id */
export function quotaKey(groupId: string, accountId?: string): string {
  return accountId || groupId;
}

/** 解析附加环境变量文本：每行 KEY=VALUE，空行与 # 开头的行忽略 */
export function parseEnvLines(text: string | undefined): { env: Record<string, string>; error?: string } {
  const env: Record<string, string> = {};
  for (const [index, raw] of (text || '').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq).trim() : '';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { env, error: `第 ${index + 1} 行不是 KEY=VALUE 格式` };
    env[key] = line.slice(eq + 1).trim();
  }
  return { env };
}

export function toSessionAccount(account: Account): SessionAccount {
  return { cliId: account.cliId, configDir: account.configDir.trim(), env: parseEnvLines(account.env).env };
}

/** 读取已保存的账号列表时过滤掉结构不完整的条目 */
export function sanitizeAccounts(value: unknown): Account[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Account => Boolean(item)
    && typeof item.id === 'string' && item.id.length > 0
    && ACCOUNT_CLIS.some((cli) => cli.id === item.cliId)
    && typeof item.name === 'string' && typeof item.configDir === 'string');
}

/** 设置页保存账号前的校验，返回错误文字；通过时返回空字符串 */
export function validateAccount(draft: Pick<Account, 'cliId' | 'name' | 'configDir' | 'env'>, others: Account[]): string {
  const name = draft.name.trim();
  const dir = draft.configDir.trim();
  if (!name) return '请填写账号名称。';
  if (others.some((a) => a.cliId === draft.cliId && a.name.trim().toLowerCase() === name.toLowerCase())) return '同一 CLI 下已有同名账号。';
  if (!dir) return '请填写配置目录。';
  if (!/^(~([\\/]|$)|[A-Za-z]:[\\/]|\\\\)/.test(dir)) return '配置目录必须是绝对路径（如 C:\\Users\\你\\.codex-alt），或以 ~ 开头。';
  const normalize = (p: string) => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
  if (others.some((a) => a.cliId === draft.cliId && normalize(a.configDir) === normalize(dir))) return '该目录已被同一 CLI 的另一个账号使用。';
  const parsed = parseEnvLines(draft.env);
  if (parsed.error) return `附加环境变量：${parsed.error}`;
  return '';
}
