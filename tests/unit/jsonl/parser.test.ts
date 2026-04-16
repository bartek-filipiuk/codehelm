import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { parseJsonlStream } from '@/lib/jsonl/parser';

function streamOf(s: string): Readable {
  return Readable.from([s]);
}

describe('parseJsonlStream', () => {
  it('parsuje kilka poprawnych linii', async () => {
    const input = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'a' } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [] } }),
    ].join('\n');
    const out = [];
    for await (const ev of parseJsonlStream(streamOf(input), { logMalformed: false })) {
      out.push(ev);
    }
    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe('user');
    expect(out[1]?.type).toBe('assistant');
  });

  it('pomija malformed JSON', async () => {
    const input = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'a' } }),
      'not json',
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'b' } }),
    ].join('\n');
    const out = [];
    for await (const ev of parseJsonlStream(streamOf(input), { logMalformed: false })) {
      out.push(ev);
    }
    expect(out).toHaveLength(2);
  });

  it('pomija schema violations', async () => {
    const input = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'ok' } }),
      JSON.stringify({ type: 'voodoo' }),
    ].join('\n');
    const out = [];
    for await (const ev of parseJsonlStream(streamOf(input), { logMalformed: false })) {
      out.push(ev);
    }
    expect(out).toHaveLength(1);
  });

  it('toleruje CRLF', async () => {
    const input = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'a' } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'b' } }),
    ].join('\r\n');
    const out = [];
    for await (const ev of parseJsonlStream(streamOf(input), { logMalformed: false })) {
      out.push(ev);
    }
    expect(out).toHaveLength(2);
  });

  it('toleruje trailing blank lines', async () => {
    const input =
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'a' } }) + '\n\n\n';
    const out = [];
    for await (const ev of parseJsonlStream(streamOf(input), { logMalformed: false })) {
      out.push(ev);
    }
    expect(out).toHaveLength(1);
  });

  it('obsługuje pusty input', async () => {
    const out = [];
    for await (const ev of parseJsonlStream(streamOf(''), { logMalformed: false })) {
      out.push(ev);
    }
    expect(out).toHaveLength(0);
  });
});
