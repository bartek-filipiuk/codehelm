import type { JsonlEvent } from './types';

export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ExtractedUsage extends UsageTokens {
  model: string | null;
}

/**
 * Per-million-token pricing in USD.
 * cacheWrite ≈ input billed at cache-creation rate, cacheRead at cache-read rate.
 */
export interface ModelRate {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const MODEL_RATE_KEYS = ['opus-4', 'sonnet-4', 'haiku-4', 'default'] as const;
export type ModelRateKey = (typeof MODEL_RATE_KEYS)[number];
export type ModelPricing = Record<ModelRateKey, ModelRate>;

export const DEFAULT_MODEL_PRICING: ModelPricing = {
  'opus-4': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'sonnet-4': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'haiku-4': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  default: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
};

function zeroTokens(): UsageTokens {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * Finds a usage block inside either a parsed assistant event, a raw record with
 * the same shape, or an arbitrary content-array entry. Returns null when no
 * usable numeric fields are found.
 */
function readUsageFromObject(obj: Record<string, unknown> | null | undefined): UsageTokens | null {
  if (!obj) return null;
  const inp = num(obj['input_tokens']);
  const out = num(obj['output_tokens']);
  const cw = num(obj['cache_creation_input_tokens']);
  const cr = num(obj['cache_read_input_tokens']);
  if (inp === 0 && out === 0 && cw === 0 && cr === 0) return null;
  return {
    inputTokens: inp,
    outputTokens: out,
    cacheCreationInputTokens: cw,
    cacheReadInputTokens: cr,
  };
}

/**
 * Extracts usage + model from any assistant-shaped event.
 * Accepts both the typed JsonlEvent union and raw JSON objects — we probe
 * defensively because older CLI versions stored the model on different fields.
 * Returns null when the event is not an assistant message or has no usage.
 */
export function extractUsage(event: unknown): ExtractedUsage | null {
  if (!event || typeof event !== 'object') return null;
  const ev = event as { type?: unknown; message?: unknown };
  if (ev.type !== 'assistant') return null;
  if (!ev.message || typeof ev.message !== 'object') return null;
  const msg = ev.message as {
    usage?: unknown;
    model?: unknown;
    content?: unknown;
  };
  const usage = readUsageFromObject((msg.usage ?? null) as Record<string, unknown> | null);
  if (!usage) return null;
  const model = typeof msg.model === 'string' && msg.model ? msg.model : null;
  return { ...usage, model };
}

/**
 * Sums usage across a stream of events.
 */
export function sumUsage(events: Iterable<JsonlEvent>): UsageTokens {
  const acc = zeroTokens();
  for (const ev of events) {
    const u = extractUsage(ev);
    if (!u) continue;
    acc.inputTokens += u.inputTokens;
    acc.outputTokens += u.outputTokens;
    acc.cacheCreationInputTokens += u.cacheCreationInputTokens;
    acc.cacheReadInputTokens += u.cacheReadInputTokens;
  }
  return acc;
}

/**
 * Maps a raw model string (e.g. "claude-opus-4-7") to a known rate key.
 * Unknown or missing models fall back to "default".
 */
export function modelRateKey(model: string | null | undefined): ModelRateKey {
  if (!model) return 'default';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus-4';
  if (m.includes('sonnet')) return 'sonnet-4';
  if (m.includes('haiku')) return 'haiku-4';
  return 'default';
}

function rateFor(model: string | null | undefined, pricing: ModelPricing): ModelRate {
  const key = modelRateKey(model);
  return pricing[key] ?? pricing.default;
}

/** Cost in USD for a single usage block at the given per-model rate. */
export function costForUsage(
  usage: UsageTokens,
  model: string | null | undefined,
  pricing: ModelPricing = DEFAULT_MODEL_PRICING,
): number {
  const rate = rateFor(model, pricing);
  const perMillion = 1_000_000;
  return (
    (usage.inputTokens * rate.input) / perMillion +
    (usage.outputTokens * rate.output) / perMillion +
    (usage.cacheCreationInputTokens * rate.cacheWrite) / perMillion +
    (usage.cacheReadInputTokens * rate.cacheRead) / perMillion
  );
}

export interface SessionCost {
  totalUsd: number;
  tokens: UsageTokens;
  eventsWithUsage: number;
}

/**
 * Streams assistant events and returns total cost + aggregate tokens.
 * Unknown models use the default rate.
 */
export function estimateSessionCost(
  events: Iterable<JsonlEvent>,
  pricing: ModelPricing = DEFAULT_MODEL_PRICING,
): SessionCost {
  const tokens = zeroTokens();
  let totalUsd = 0;
  let eventsWithUsage = 0;
  for (const ev of events) {
    const u = extractUsage(ev);
    if (!u) continue;
    eventsWithUsage++;
    tokens.inputTokens += u.inputTokens;
    tokens.outputTokens += u.outputTokens;
    tokens.cacheCreationInputTokens += u.cacheCreationInputTokens;
    tokens.cacheReadInputTokens += u.cacheReadInputTokens;
    totalUsd += costForUsage(u, u.model, pricing);
  }
  return { totalUsd, tokens, eventsWithUsage };
}

/**
 * Formats a USD amount for UI. Below one cent shows "<$0.01"; zero shows "—".
 * Two decimals up to $999.99, then three-sig-figs-with-comma above.
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—';
  if (usd <= 0) return '—';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1000) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}
