// 校验多语言：源码里每个 t('中文') / T('中文') 都必须在 src/shared/en.ts 里有英文译文，占位符一致；同时报告没有被引用的译文。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enFile = path.join(root, 'src/shared/en.ts');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && full !== enFile) out.push(full);
  }
  return out;
}

const unescapeText = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
const enSource = fs.readFileSync(enFile, 'utf-8');
const en = new Map();
for (const m of enSource.matchAll(/^ {2}'((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',$/gm)) en.set(unescapeText(m[1]), unescapeText(m[2]));

const keyPattern = /(?<![\w.$])[tT]\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`$\n]*)`)/g;
const used = new Map();
for (const file of walk(path.join(root, 'src'))) {
  const text = fs.readFileSync(file, 'utf-8');
  for (const m of text.matchAll(keyPattern)) {
    const key = unescapeText(m[1] ?? m[2] ?? m[3]);
    if (!/[一-鿿　-〿＀-￯]/.test(key)) continue;
    if (!used.has(key)) used.set(key, path.relative(root, file));
  }
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const missing = [...used].filter(([key]) => !en.has(key));
const mismatched = [...used].filter(([key]) => en.has(key) && placeholders(key) !== placeholders(en.get(key)));
// 动态键（如 t(`${month}月`)）无法静态校验，译文照常登记但不算「未使用」
const unused = [...en.keys()].filter((key) => !used.has(key) && !/^\d+月$/.test(key) && !['今天', '昨天', '更早'].includes(key));

for (const [key, file] of missing) console.log(`MISSING  ${file}: ${key}`);
for (const [key, file] of mismatched) console.log(`PLACEHOLDER MISMATCH  ${file}: ${key}`);
for (const key of unused) console.log(`unused   ${key}`);
console.log(`\n${used.size} keys used, ${en.size} translations, ${missing.length} missing, ${mismatched.length} placeholder mismatches, ${unused.length} unused`);
process.exit(missing.length || mismatched.length ? 1 : 0);
