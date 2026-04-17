import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const TARGETS = ['app', 'components'] as const;
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('i18n guard: no Polish diacritics in user-facing UI code', () => {
  for (const target of TARGETS) {
    it(`${target}/ stays free of Polish-specific characters`, () => {
      const files = walk(join(ROOT, target));
      const hits: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        if (POLISH.test(text)) {
          hits.push(file.slice(ROOT.length + 1));
        }
      }
      expect(hits).toEqual([]);
    });
  }
});
