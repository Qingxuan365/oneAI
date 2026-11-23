// 校验多语言：源码中的中文文案应有对应译文，占位符一致。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const translationFiles = new Map([
  ['en', path.join(root, 'src/shared/en.ts')],
  ['zh-TW', path.join(root, 'src/shared/zh-TW.ts')],
]);
const tablePaths = new Set(translationFiles.values());

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !tablePaths.has(full)) out.push(full);
  }
  return out;
}

const unescapeText = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

function loadTranslations(file) {
  const source = fs.readFileSync(file, 'utf-8');
  const entries = source.matchAll(/^ {2}'((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',$/gm);
  return new Map([...entries].map(([, key, value]) => [unescapeText(key), unescapeText(value)]));
}

const keyPattern = /(?<![\w.$])[tT]\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`$\n]*)`)/g;
const dynamicCallPattern = /(?<![\w.$])[tT]\(\s*(?!['"`])([^\n;)]+)/g;
const cjkPattern = /[一-鿿　-〿＀-￯]/;
const used = new Map();
const dynamicCjk = [];
for (const file of walk(path.join(root, 'src'))) {
  const text = fs.readFileSync(file, 'utf-8');
  const rel = path.relative(root, file);
  for (const m of text.matchAll(keyPattern)) {
    const key = unescapeText(m[1] ?? m[2] ?? m[3]);
    if (!cjkPattern.test(key)) continue;
    if (!used.has(key)) used.set(key, rel);
  }
  for (const m of text.matchAll(dynamicCallPattern)) {
    const expr = m[1].trim();
    if (cjkPattern.test(expr)) dynamicCjk.push([expr, rel]);
  }
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
// 动态月名与历史日期分组在运行时生成。
const dynamicKeys = [...Array.from({ length: 12 }, (_, i) => `${i + 1}月`), '今天', '昨天', '更早']
  .filter((key) => !used.has(key));
const required = new Map([...used, ...dynamicKeys.map((key) => [key, '(runtime key)'])]);
let failed = dynamicCjk.length > 0;
for (const [expr, file] of dynamicCjk) console.log(`DYNAMIC CJK  ${file}: t(${expr})`);
for (const [language, file] of translationFiles) {
  const table = loadTranslations(file);
  const missing = [...required].filter(([key]) => !table.get(key));
  const mismatched = [...required].filter(([key]) => table.has(key) && placeholders(key) !== placeholders(table.get(key)));
  const unused = [...table.keys()].filter((key) => !required.has(key));
  for (const [key, source] of missing) console.log(`${language} MISSING  ${source}: ${key}`);
  for (const [key, source] of mismatched) console.log(`${language} PLACEHOLDER MISMATCH  ${source}: ${key}`);
  for (const key of unused) console.log(`${language} UNUSED   ${key}`);
  console.log(`${language}: ${table.size} translations, ${missing.length} missing, ${mismatched.length} placeholder mismatches, ${unused.length} unused`);
  failed ||= missing.length > 0 || mismatched.length > 0 || unused.length > 0;
}
console.log(`${required.size} required keys, ${dynamicCjk.length} dynamic CJK calls`);
process.exitCode = failed ? 1 : 0;
