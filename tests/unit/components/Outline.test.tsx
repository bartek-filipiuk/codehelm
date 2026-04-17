import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outline } from '@/app/(ui)/conversation/Outline';
import type { JsonlEvent } from '@/lib/jsonl/types';

afterEach(() => cleanup());

function pair(ev: JsonlEvent, origIndex: number) {
  return { ev, origIndex };
}

const sample: JsonlEvent[] = [
  { type: 'user', message: { role: 'user', content: 'hello there' } },
  {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'hi back' }] as never },
  },
  { type: 'tool_use', name: 'Bash', input: { cmd: 'ls' } },
  { type: 'system', slug: 'session-start' },
];

describe('<Outline />', () => {
  it('renders one marker per event', () => {
    render(
      <Outline
        events={sample.map((e, i) => pair(e, i))}
        visibleStart={0}
        visibleEnd={0}
        onJump={() => {}}
      />,
    );
    const markers = screen.getAllByRole('listitem');
    expect(markers).toHaveLength(sample.length);
  });

  it('marks events inside the visible range with data-in-view=true', () => {
    render(
      <Outline
        events={sample.map((e, i) => pair(e, i))}
        visibleStart={1}
        visibleEnd={2}
        onJump={() => {}}
      />,
    );
    const m0 = screen.getByTestId('outline-marker-0');
    const m1 = screen.getByTestId('outline-marker-1');
    const m2 = screen.getByTestId('outline-marker-2');
    const m3 = screen.getByTestId('outline-marker-3');
    expect(m0.getAttribute('data-in-view')).toBe('false');
    expect(m1.getAttribute('data-in-view')).toBe('true');
    expect(m2.getAttribute('data-in-view')).toBe('true');
    expect(m3.getAttribute('data-in-view')).toBe('false');
  });

  it('click invokes onJump with the visible index', async () => {
    const onJump = vi.fn();
    render(
      <Outline
        events={sample.map((e, i) => pair(e, i))}
        visibleStart={0}
        visibleEnd={0}
        onJump={onJump}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('outline-marker-2'));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('marker exposes a preview tooltip via title', () => {
    render(
      <Outline
        events={sample.map((e, i) => pair(e, i))}
        visibleStart={0}
        visibleEnd={0}
        onJump={() => {}}
      />,
    );
    const m0 = screen.getByTestId('outline-marker-0');
    expect(m0.getAttribute('title')).toBe('hello there');
  });

  it('renders nothing when there are no events', () => {
    const { container } = render(
      <Outline events={[]} visibleStart={0} visibleEnd={0} onJump={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('marker carries its category as data attribute', () => {
    render(
      <Outline
        events={sample.map((e, i) => pair(e, i))}
        visibleStart={0}
        visibleEnd={0}
        onJump={() => {}}
      />,
    );
    expect(screen.getByTestId('outline-marker-0').getAttribute('data-category')).toBe('user');
    expect(screen.getByTestId('outline-marker-1').getAttribute('data-category')).toBe('assistant');
    expect(screen.getByTestId('outline-marker-2').getAttribute('data-category')).toBe('tools');
    expect(screen.getByTestId('outline-marker-3').getAttribute('data-category')).toBe('system');
  });
});
