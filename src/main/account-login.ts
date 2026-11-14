import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildAccountEnv, SessionAccount } from './account-env';
import { t } from './i18n';

export interface LoginStatus {
  loggedIn: boolean | null; // null：命令输出无法识别
  detail?: string;          // 可显示的补充信息，如 Claude 返回的邮箱；无则缺省
}

// 用各 CLI 自带的状态命令判断登录状态，不读取任何凭据文件；Kimi Code 没有状态命令，只检查凭据文件是否存在
const STATUS_COMMANDS: Partial<Record<SessionAccount['cliId'], string>> = {
  codex: 'codex login status',
  claude: 'claude auth status',
};

function parseStatus(cliId: SessionAccount['cliId'], output: string): LoginStatus {
  if (cliId === 'claude') {
    const json = output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1);
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed.loggedIn === 'boolean') {
        return { loggedIn: parsed.loggedIn, detail: parsed.loggedIn && typeof parsed.email === 'string' ? parsed.email : undefined };
      }
    } catch {}
    return { loggedIn: null };
  }
  if (/not logged in/i.test(output)) return { loggedIn: false };
  if (/logged in/i.test(output)) return { loggedIn: true };
  return { loggedIn: null };
}

/** 在该账号的环境下运行 CLI 的状态命令（会按需创建账号配置目录，这是 Codex 运行的前提） */
export function checkAccountLogin(account: unknown): Promise<LoginStatus | { error: string }> {
  const built = buildAccountEnv(account);
  if ('error' in built) return Promise.resolve({ error: built.error });
  const { cliId } = account as SessionAccount;
  const command = STATUS_COMMANDS[cliId];
  if (!command) {
    // 只看文件是否存在、是否非空，不读取内容；凭据是否已过期要等 Kimi 实际请求时才知道
    try {
      const stat = fs.statSync(path.join(built.env.KIMI_CODE_HOME, 'credentials', 'kimi-code.json'));
      return Promise.resolve(stat.isFile() && stat.size > 0 ? { loggedIn: true, detail: t('有凭据文件') } : { loggedIn: false });
    } catch {
      return Promise.resolve({ loggedIn: false });
    }
  }
  const [file, args] = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`]]
    : ['/bin/sh', ['-c', command]];
  return new Promise((resolve) => {
    execFile(file, args, { env: { ...process.env, ...built.env }, windowsHide: true, timeout: 30000, encoding: 'utf8' }, (_error, stdout, stderr) => {
      // 未登录时 CLI 可能以非零状态退出，仍要解析输出
      resolve(parseStatus(cliId, `${stdout}\n${stderr}`));
    });
  });
}
