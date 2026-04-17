import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const TARGETS = ['app', 'components', 'lib', 'hooks', 'stores', 'tests', 'docs'] as const;
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const SELF = resolve(__dirname, 'no-polish-in-ui.test.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx|md)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('i18n guard: no Polish diacritics anywhere in the source tree', () => {
  for (const target of TARGETS) {
    it(`${target}/ stays free of Polish-specific characters`, () => {
      const files = walk(join(ROOT, target));
      const hits: string[] = [];
      for (const file of files) {
        if (file === SELF) continue;
        const text = readFileSync(file, 'utf8');
        if (POLISH.test(text)) {
          hits.push(file.slice(ROOT.length + 1));
        }
      }
      expect(hits).toEqual([]);
    });
  }
});
