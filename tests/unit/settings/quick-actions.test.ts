import { describe, expect, it } from 'vitest';
import {
  applyDefaults,
  DEFAULT_SETTINGS,
  DEFAULT_TERMINAL_QUICK_ACTIONS,
  TERMINAL_QUICK_ACTION_LIMITS,
} from '@/lib/settings/types';

describe('terminalQuickActions settings field', () => {
  it('defaults include the classic four actions', () => {
    expect(DEFAULT_SETTINGS.terminalQuickActions).toEqual(DEFAULT_TERMINAL_QUICK_ACTIONS);
    expect(DEFAULT_SETTINGS.terminalQuickActions.map((a) => a.label)).toEqual([
      'git status',
      'git log',
      'pnpm test',
      'pnpm dev',
    ]);
  });

  it('applyDefaults keeps a well-formed custom list', () => {
    const out = applyDefaults({
      terminalQuickActions: [
        { label: 'dev', command: 'pnpm dev' },
        { label: 'test', command: 'pnpm test:unit --run' },
      ],
    });
    expect(out.terminalQuickActions).toHaveLength(2);
    expect(out.terminalQuickActions[0]?.label).toBe('dev');
  });

  it('applyDefaults rejects a non-array and falls back to defaults', () => {
    const out = applyDefaults({ terminalQuickActions: 'bogus' });
    expect(out.terminalQuickActions).toEqual(DEFAULT_TERMINAL_QUICK_ACTIONS);
  });

  it('applyDefaults rejects entries without a command and falls back', () => {
    const out = applyDefaults({ terminalQuickActions: [{ label: 'no cmd' }] });
    expect(out.terminalQuickActions).toEqual(DEFAULT_TERMINAL_QUICK_ACTIONS);
  });

  it('applyDefaults rejects empty labels', () => {
    const out = applyDefaults({ terminalQuickActions: [{ label: '   ', command: 'x' }] });
    expect(out.terminalQuickActions).toEqual(DEFAULT_TERMINAL_QUICK_ACTIONS);
  });

  it('applyDefaults rejects lists longer than the cap', () => {
    const big = Array.from({ length: TERMINAL_QUICK_ACTION_LIMITS.maxActions + 1 }, (_, i) => ({
      label: `a${i}`,
      command: `cmd ${i}`,
    }));
    const out = applyDefaults({ terminalQuickActions: big });
    expect(out.terminalQuickActions).toEqual(DEFAULT_TERMINAL_QUICK_ACTIONS);
  });

  it('applyDefaults rejects commands longer than the cap', () => {
    const longCommand = 'x'.repeat(TERMINAL_QUICK_ACTION_LIMITS.maxCommandLength + 1);
    const out = applyDefaults({
      terminalQuickActions: [{ label: 'too long', command: longCommand }],
    });
    expect(out.terminalQuickActions).toEqual(DEFAULT_TERMINAL_QUICK_ACTIONS);
  });
});
