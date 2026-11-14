import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { t } from './i18n';

export type AccountCliId = 'codex' | 'claude' | 'kimi';

/** 各 CLI 用来指定「配置目录」（登录凭据、会话记录都在其中）的环境变量；换一个目录就是换一个账号 */
export const ACCOUNT_ENV_VARS: Record<AccountCliId, string> = {
  codex: 'CODEX_HOME',
  claude: 'CLAUDE_CONFIG_DIR',
  kimi: 'KIMI_CODE_HOME',
};

export interface SessionAccount {
  cliId: AccountCliId;
  configDir: string;
  env?: Record<string, string>;
}

export function isAccountCli(id: unknown): id is AccountCliId {
  return id === 'codex' || id === 'claude' || id === 'kimi';
}

/** 展开开头的 `~`，结果必须是绝对路径，否则返回 null */
export function resolveConfigDir(dir: unknown): string | null {
  if (typeof dir !== 'string') return null;
  let value = dir.trim();
  if (!value) return null;
  if (value === '~' || /^~[\\/]/.test(value)) value = path.join(os.homedir(), value.slice(1));
  return path.isAbsolute(value) ? path.resolve(value) : null;
}

/**
 * 生成账号对应的终端环境变量，并确保配置目录存在（Codex 在目录不存在时直接报错退出）。
 * 配置目录变量最后写入，附加环境变量无法覆盖它。只创建目录，不读取、不复制任何凭据。
 */
export function buildAccountEnv(account: unknown): { env: Record<string, string> } | { error: string } {
  const value = account as Partial<SessionAccount> | null;
  if (!value || !isAccountCli(value.cliId)) return { error: t('账号配置无效：不支持的 CLI。') };
  const dir = resolveConfigDir(value.configDir);
  if (!dir) return { error: t('账号的配置目录为空或不是绝对路径，或该账号配置已被删除。请在「设置 → 账号」中检查。') };
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.statSync(dir).isDirectory()) return { error: t('账号配置目录不是文件夹：{dir}', { dir }) };
  } catch (error) {
    return { error: t('无法创建账号配置目录 {dir}：{reason}', { dir, reason: error instanceof Error ? error.message : String(error) }) };
  }

  const env: Record<string, string> = {};
  if (value.env && typeof value.env === 'object') {
    for (const [key, val] of Object.entries(value.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof val !== 'string' || val.includes('\0')) {
        return { error: t('账号的附加环境变量无效：{key}', { key }) };
      }
      env[key] = val;
    }
  }
  env[ACCOUNT_ENV_VARS[value.cliId]] = dir;
  return { env };
}
