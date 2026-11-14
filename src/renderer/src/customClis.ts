import { CliDef, CustomCli } from './types';
import { t } from './i18n';

export function newCustomCliId(): string {
  return `custom-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).slice(0, 8)}`;
}

export function toCliDef(cli: CustomCli): CliDef {
  return { id: cli.id, name: cli.name, icon: 'terminal', defaultCommand: cli.command, custom: true };
}

/** 读取已保存的自定义 CLI 时过滤掉结构不完整的条目 */
export function sanitizeCustomClis(value: unknown): CustomCli[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is CustomCli => {
    const ok = Boolean(item) && typeof item.id === 'string' && item.id.length > 0 && !seen.has(item.id)
      && typeof item.name === 'string' && item.name.trim().length > 0
      && typeof item.command === 'string' && item.command.trim().length > 0;
    if (ok) seen.add(item.id);
    return ok;
  });
}

/** 设置页保存自定义 CLI 前的校验，返回错误文字；通过时返回空字符串。reservedNames 为内置与自动检测到的 CLI 名称 */
export function validateCustomCli(draft: Pick<CustomCli, 'name' | 'command'>, others: CustomCli[], reservedNames: string[]): string {
  const name = draft.name.trim();
  const command = draft.command.trim();
  if (!name) return t('请填写 CLI 名称。');
  if (name.length > 30) return t('CLI 名称不要超过 30 个字符。');
  const lower = name.toLowerCase();
  if (reservedNames.some((reserved) => reserved.toLowerCase() === lower)) return t('该名称已被内置或已检测到的 CLI 使用。');
  if (others.some((other) => other.name.trim().toLowerCase() === lower)) return t('已有同名的自定义 CLI。');
  if (!command) return t('请填写启动命令。');
  if (/[\r\n]/.test(command)) return t('启动命令只能是一行。');
  return '';
}
