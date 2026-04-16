import { describe, it, expect } from 'vitest';
import { JsonlEvent, KNOWN_EVENT_TYPES } from '@/lib/jsonl/types';

describe('JsonlEvent schema', () => {
  it('akceptuje event user', () => {
    const ok = JsonlEvent.safeParse({
      type: 'user',
      sessionId: 'abc',
      message: { role: 'user', content: 'hello' },
    });
    expect(ok.success).toBe(true);
  });

  it('akceptuje event assistant z content array', () => {
    const ok = JsonlEvent.safeParse({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    });
    expect(ok.success).toBe(true);
  });

  it('akceptuje wszystkie 9 znanych typów', () => {
    for (const t of KNOWN_EVENT_TYPES) {
      const base: Record<string, unknown> = { type: t };
      if (t === 'user') base['message'] = { role: 'user', content: 'x' };
      if (t === 'assistant') base['message'] = { role: 'assistant', content: [] };
      const ok = JsonlEvent.safeParse(base);
      expect(ok.success, `type ${t}`).toBe(true);
    }
  });

  it('odrzuca event bez type', () => {
    const ok = JsonlEvent.safeParse({ message: { role: 'user', content: 'x' } });
    expect(ok.success).toBe(false);
  });

  it('odrzuca nieznany type', () => {
    const ok = JsonlEvent.safeParse({ type: 'voodoo' });
    expect(ok.success).toBe(false);
  });

  it('akceptuje tool_result z stdout/stderr/exitCode', () => {
    const ok = JsonlEvent.safeParse({
      type: 'tool_result',
      toolUseResult: { stdout: 'x', stderr: '', exitCode: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
