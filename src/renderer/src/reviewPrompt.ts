import { t } from './i18n';

export interface ReviewPromptInput {
  taskTitle: string;
  sourceCliName?: string;
  summary?: string | null;
  branch?: string | null;
  changedFiles?: string[];
}

const MAX_SUMMARY_CHARS = 120;
const MAX_LISTED_FILES = 8;

function singleLine(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function truncateText(text: string, maxChars: number): string {
  const clean = singleLine(text);
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1)}…`;
}

/** 生成一键审核任务的侧栏标题；避免重复叠加「审核：」前缀 */
export function buildReviewTaskTitle(sourceTitle: string): string {
  const clean = singleLine(sourceTitle) || 'Task';
  if (/^(?:审核|審核)：|^Review:\s*/i.test(clean)) return clean;
  return t('审核：{title}', { title: clean });
}

/** 构造单行审核提示词，避免在未开启 bracketed paste 的 CLI 中因换行提前拆分提交 */
export function buildReviewPrompt(input: ReviewPromptInput): string {
  const sep = t('，');
  const contextParts: string[] = [];
  const cleanTitle = singleLine(input.taskTitle);
  if (cleanTitle) {
    contextParts.push(t('任务「{title}」', { title: cleanTitle }));
  }
  const cleanCli = input.sourceCliName ? singleLine(input.sourceCliName) : '';
  if (cleanCli) {
    contextParts.push(t('由 {cli} 实现', { cli: cleanCli }));
  }
  const cleanSummary = input.summary ? truncateText(input.summary, MAX_SUMMARY_CHARS) : '';
  if (cleanSummary) {
    contextParts.push(t('需求摘要：{summary}', { summary: cleanSummary }));
  }
  const cleanBranch = input.branch ? singleLine(input.branch) : '';
  if (cleanBranch) {
    contextParts.push(t('当前分支：{branch}', { branch: cleanBranch }));
  }
  const files = (input.changedFiles ?? []).map(singleLine).filter(Boolean);
  if (files.length > 0) {
    const listed = files.slice(0, MAX_LISTED_FILES).join(', ');
    const filesLabel = files.length > MAX_LISTED_FILES
      ? t('{files} 等 {n} 个文件', { files: listed, n: files.length })
      : listed;
    contextParts.push(t('变更文件：{files}', { files: filesLabel }));
  }
  const context = contextParts.join(sep) || t('任务「{title}」', { title: 'Task' });
  return singleLine(t('请对当前项目中刚完成的功能改动（{context}）进行全面代码审核：先运行 git status 和 git diff（若改动已提交则查看 git show HEAD）了解实际改动，重点检查正确性、边界条件、安全隐患、性能与回归风险；按严重程度列出发现的问题、文件位置与修改建议。本次只做代码审核，不要直接修改代码。', { context }));
}
