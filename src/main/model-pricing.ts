/**
 * 公开模型 API 等值成本估算（美元 / 1M tokens）。
 * 仅对明确公开费率的模型计算；内部代号（如 Orchestrator、Gemini 4 *、codex-auto-review）或未收录模型返回 null，
 * 由界面诚实标记为「未定价」并统计价格覆盖率。
 */

interface ModelRate {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
}

const PRICING_RULES: Array<{ test: (m: string) => boolean; rate: ModelRate }> = [
  // 排除内部模型 / 占位符
  {
    test: (m) => !m || m === 'auto' || m === 'codex-auto-review' || m.includes('orchestrator') || m.includes('gemini 4') || m.includes('gemini-4'),
    rate: { inputPerM: -1, outputPerM: -1, cacheReadPerM: -1, cacheWritePerM: -1 },
  },

  // Anthropic Claude
  {
    test: (m) => /opus[\s._-]*(?:4[\s._-]*(?:5|6)|[5-9])/.test(m),
    rate: { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  },
  {
    test: (m) => m.includes('opus'),
    rate: { inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 },
  },
  {
    test: (m) => m.includes('sonnet'),
    rate: { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  },
  {
    test: (m) => /haiku[\s._-]*(?:4[\s._-]*5|[5-9])/.test(m),
    rate: { inputPerM: 1, outputPerM: 5, cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  },
  {
    test: (m) => m.includes('haiku'),
    rate: { inputPerM: 0.8, outputPerM: 4, cacheReadPerM: 0.08, cacheWritePerM: 1.0 },
  },

  // OpenAI / Codex
  {
    test: (m) => m.includes('gpt-5-nano') || m.includes('gpt 5 nano'),
    rate: { inputPerM: 0.05, outputPerM: 0.4, cacheReadPerM: 0.005, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gpt-5-mini') || m.includes('gpt 5 mini'),
    rate: { inputPerM: 0.25, outputPerM: 2, cacheReadPerM: 0.025, cacheWritePerM: 0 },
  },
  {
    test: (m) => /gpt-5(?:\.\d+)?-pro/.test(m),
    rate: { inputPerM: 15, outputPerM: 120, cacheReadPerM: 1.5, cacheWritePerM: 0 },
  },
  {
    test: (m) => /gpt-5\.[2-9]/.test(m),
    rate: { inputPerM: 2.5, outputPerM: 15, cacheReadPerM: 0.25, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gpt-5'),
    rate: { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.125, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gpt-4.1-nano'),
    rate: { inputPerM: 0.1, outputPerM: 0.4, cacheReadPerM: 0.025, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gpt-4.1-mini'),
    rate: { inputPerM: 0.4, outputPerM: 1.6, cacheReadPerM: 0.1, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gpt-4.1'),
    rate: { inputPerM: 2, outputPerM: 8, cacheReadPerM: 0.5, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gpt-4o-mini'),
    rate: { inputPerM: 0.15, outputPerM: 0.6, cacheReadPerM: 0.075, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gpt-4o'),
    rate: { inputPerM: 2.5, outputPerM: 10, cacheReadPerM: 1.25, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('o3-mini') || m.includes('o4-mini'),
    rate: { inputPerM: 1.1, outputPerM: 4.4, cacheReadPerM: 0.275, cacheWritePerM: 0 },
  },
  {
    test: (m) => /\bo3\b/.test(m),
    rate: { inputPerM: 2, outputPerM: 8, cacheReadPerM: 0.5, cacheWritePerM: 0 },
  },

  // Google Gemini (2.x / 3.x)
  {
    test: (m) => m.includes('gemini-3-pro') || m.includes('gemini 3 pro'),
    rate: { inputPerM: 2, outputPerM: 12, cacheReadPerM: 0.2, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gemini-3-flash') || m.includes('gemini 3 flash'),
    rate: { inputPerM: 0.5, outputPerM: 3, cacheReadPerM: 0.05, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gemini-2.5-pro') || m.includes('gemini 2.5 pro'),
    rate: { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.31, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gemini-2.5-flash-lite') || m.includes('gemini 2.5 flash lite'),
    rate: { inputPerM: 0.1, outputPerM: 0.4, cacheReadPerM: 0.025, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gemini-2.5-flash') || m.includes('gemini 2.5 flash'),
    rate: { inputPerM: 0.3, outputPerM: 2.5, cacheReadPerM: 0.075, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('gemini-2.0-flash') || m.includes('gemini 2.0 flash'),
    rate: { inputPerM: 0.1, outputPerM: 0.4, cacheReadPerM: 0.025, cacheWritePerM: 0 },
  },

  // DeepSeek
  {
    test: (m) => m.includes('deepseek-reasoner') || m.includes('deepseek-r1'),
    rate: { inputPerM: 0.55, outputPerM: 2.19, cacheReadPerM: 0.14, cacheWritePerM: 0 },
  },
  {
    test: (m) => m.includes('deepseek-chat') || m.includes('deepseek-v3'),
    rate: { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0 },
  },
];

function findModelRate(model: string): ModelRate | null {
  const normalized = model.trim().toLowerCase();
  for (const rule of PRICING_RULES) {
    if (rule.test(normalized)) {
      return rule.rate.inputPerM < 0 ? null : rule.rate;
    }
  }
  return null;
}

/** 按公开 API 费率估算模型消耗（美元）；未知或内部模型返回 null */
export function estimateModelCostUsd(
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number | null {
  const rate = findModelRate(model);
  if (!rate) return null;
  const cost =
    (Math.max(0, usage.input) * rate.inputPerM
      + Math.max(0, usage.output) * rate.outputPerM
      + Math.max(0, usage.cacheRead) * rate.cacheReadPerM
      + Math.max(0, usage.cacheWrite) * rate.cacheWritePerM) / 1_000_000;
  return Number.isFinite(cost) ? cost : null;
}
