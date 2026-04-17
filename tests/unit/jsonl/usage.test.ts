import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_PRICING,
  costForUsage,
  estimateSessionCost,
  extractUsage,
  formatUsd,
  modelRateKey,
  sumUsage,
  type ModelPricing,
} from '@/lib/jsonl/usage';
import type { JsonlEvent } from '@/lib/jsonl/types';

describe('extractUsage', () => {
  it('returns null for non-assistant events', () => {
    expect(
      extractUsage({
        type: 'user',
        message: { role: 'user', content: 'hi' },
      }),
    ).toBeNull();
    expect(extractUsage({ type: 'tool_use', name: 'Bash' })).toBeNull();
    expect(extractUsage(null)).toBeNull();
    expect(extractUsage('not an event')).toBeNull();
  });

  it('returns null when assistant message has no usage block', () => {
    const ev = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
      },
    };
    expect(extractUsage(ev)).toBeNull();
  });

  it('extracts usage when assistant content is an array of blocks', () => {
    const ev = {
      type: 'assistant',
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        content: [
          { type: 'text', text: 'ok' },
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        ],
        usage: {
          input_tokens: 120,
          output_tokens: 30,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      },
    };
    expect(extractUsage(ev)).toEqual({
      model: 'claude-sonnet-4-5',
      inputTokens: 120,
      outputTokens: 30,
      cacheCreationInputTokens: 10,
      cacheReadInputTokens: 5,
    });
  });

  it('extracts usage when assistant content is a plain text string (legacy shape)', () => {
    const ev = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: 'hello world',
        model: 'claude-opus-4-7',
        usage: {
          input_tokens: 10,
          output_tokens: 2,
        },
      },
    };
    const got = extractUsage(ev);
    expect(got).toMatchObject({
      model: 'claude-opus-4-7',
      inputTokens: 10,
      outputTokens: 2,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
  });

  it('treats missing or non-numeric usage fields as zero', () => {
    const ev = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [],
        usage: {
          input_tokens: 'nope',
          output_tokens: 7,
          cache_creation_input_tokens: -3,
        },
      },
    };
    expect(extractUsage(ev)).toEqual({
      model: null,
      inputTokens: 0,
      outputTokens: 7,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
  });

  it('returns null if all usage fields are zero or absent', () => {
    const ev = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      },
    };
    expect(extractUsage(ev)).toBeNull();
  });

  it('handles missing model field as null (falls back to default rate later)', () => {
    const ev = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [],
        usage: { input_tokens: 5, output_tokens: 5 },
      },
    };
    const got = extractUsage(ev);
    expect(got?.model).toBeNull();
  });
});

describe('modelRateKey', () => {
  it('maps known prefixes', () => {
    expect(modelRateKey('claude-opus-4-7')).toBe('opus-4');
    expect(modelRateKey('claude-sonnet-4-5')).toBe('sonnet-4');
    expect(modelRateKey('claude-haiku-4-5-20251001')).toBe('haiku-4');
  });
  it('falls back to default for unknown / missing', () => {
    expect(modelRateKey(null)).toBe('default');
    expect(modelRateKey(undefined)).toBe('default');
    expect(modelRateKey('')).toBe('default');
    expect(modelRateKey('foo-bar')).toBe('default');
  });
});

describe('costForUsage', () => {
  it('computes $ cost from per-million rates', () => {
    const cost = costForUsage(
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      'claude-sonnet-4-5',
    );
    expect(cost).toBeCloseTo(3 + 15, 6);
  });
  it('applies cache rates independently', () => {
    const cost = costForUsage(
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
        cacheReadInputTokens: 2_000_000,
      },
      'claude-opus-4-7',
    );
    expect(cost).toBeCloseTo(18.75 + 2 * 1.5, 6);
  });
  it('uses default rate when model unknown', () => {
    const cost = costForUsage(
      {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      'gpt-5',
    );
    expect(cost).toBeCloseTo(DEFAULT_MODEL_PRICING.default.input, 6);
  });
});

describe('sumUsage / estimateSessionCost', () => {
  it('sums across assistant events with mixed content shapes', () => {
    const events: JsonlEvent[] = [
      { type: 'user', message: { role: 'user', content: 'hi' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'one' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      } as never,
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-7',
          content: [{ type: 'tool_use', name: 'Bash', input: {} }],
          usage: { input_tokens: 200, output_tokens: 40, cache_read_input_tokens: 1000 },
        },
      } as never,
    ];
    const summed = sumUsage(events);
    expect(summed.inputTokens).toBe(300);
    expect(summed.outputTokens).toBe(90);
    expect(summed.cacheReadInputTokens).toBe(1000);

    const cost = estimateSessionCost(events);
    expect(cost.eventsWithUsage).toBe(2);
    // sonnet: (100 * 3 + 50 * 15) / 1e6 = 0.00105
    // opus:   (200 * 15 + 40 * 75 + 1000 * 1.5) / 1e6 = 0.0075
    expect(cost.totalUsd).toBeCloseTo(0.00105 + 0.0075, 6);
  });

  it('honors a custom pricing table', () => {
    const custom: ModelPricing = {
      ...DEFAULT_MODEL_PRICING,
      'sonnet-4': { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 },
    };
    const events: JsonlEvent[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [],
          usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        },
      } as never,
    ];
    const cost = estimateSessionCost(events, custom);
    expect(cost.totalUsd).toBeCloseTo(2, 6);
  });

  it('returns zero totals for sessions without any usage blocks', () => {
    const events: JsonlEvent[] = [
      { type: 'user', message: { role: 'user', content: 'hi' } },
      { type: 'tool_use', name: 'Bash' },
    ];
    const cost = estimateSessionCost(events);
    expect(cost.eventsWithUsage).toBe(0);
    expect(cost.totalUsd).toBe(0);
    expect(cost.tokens.inputTokens).toBe(0);
  });
});

describe('formatUsd', () => {
  it('renders em dash for zero / null / non-finite', () => {
    expect(formatUsd(0)).toBe('—');
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(Number.NaN)).toBe('—');
    expect(formatUsd(undefined)).toBe('—');
  });
  it('renders sub-cent amounts with explicit marker', () => {
    expect(formatUsd(0.003)).toBe('<$0.01');
  });
  it('renders two decimals below $1000', () => {
    expect(formatUsd(4.2)).toBe('$4.20');
    expect(formatUsd(123.456)).toBe('$123.46');
  });
  it('rounds + groups thousands for large amounts', () => {
    expect(formatUsd(12345.67)).toBe('$12,346');
  });
});
