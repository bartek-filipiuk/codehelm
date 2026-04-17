import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { renderEvent } from '@/components/conversation/messages';
import { buildToolUseRegistry } from '@/lib/jsonl/tool-pairs';
import { DiffView } from '@/components/conversation/DiffView';

afterEach(() => cleanup());

describe('DiffView', () => {
  it('renderuje dodane linie jako zielone i usunięte jako czerwone', () => {
    const { container } = render(
      <DiffView
        oldText={'alpha\nbeta\n'}
        newText={'alpha\ngamma\n'}
        label="Edit"
        filePath="/x.ts"
      />,
    );
    expect(container.querySelector('[data-testid="diff-view"]')).not.toBeNull();
    expect(container.querySelector('.diff-added')).not.toBeNull();
    expect(container.querySelector('.diff-removed')).not.toBeNull();
    expect(screen.getByText('/x.ts')).toBeDefined();
  });

  it('pokazuje licznik + / -', () => {
    const { container } = render(<DiffView oldText={'a\nb\n'} newText={'a\nc\n'} label="Edit" />);
    expect(container.textContent).toMatch(/\+1/);
    expect(container.textContent).toMatch(/-1/);
  });
});

describe('ToolResultBlock → DiffView pairing', () => {
  function toolUseAssistant(id: string, name: string, input: unknown): JsonlEvent {
    return {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id, name, input }],
      },
    } as unknown as JsonlEvent;
  }
  function toolResultUser(toolUseId: string, text: string, isError = false): JsonlEvent {
    return {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: toolUseId, content: text, is_error: isError },
        ],
      },
    } as unknown as JsonlEvent;
  }

  it('renderuje diff dla tool_result sparowanego z Edit', () => {
    const events: JsonlEvent[] = [
      toolUseAssistant('toolu_1', 'Edit', {
        file_path: '/a.ts',
        old_string: 'foo',
        new_string: 'bar',
      }),
      toolResultUser('toolu_1', 'File updated'),
    ];
    const registry = buildToolUseRegistry(events);
    const { container } = render(<>{renderEvent(events[1]!, 1, registry)}</>);
    expect(container.querySelector('[data-testid="diff-view"]')).not.toBeNull();
  });

  it('fallback do raw output gdy brak pary', () => {
    const events: JsonlEvent[] = [toolResultUser('toolu_unknown', 'stdout text here')];
    const registry = buildToolUseRegistry(events);
    const { container } = render(<>{renderEvent(events[0]!, 0, registry)}</>);
    expect(container.querySelector('[data-testid="diff-view"]')).toBeNull();
    // Header summary includes the raw text.
    expect(container.textContent).toMatch(/stdout text here/);
  });

  it('fallback do raw output gdy tool_result jest błędem', () => {
    const events: JsonlEvent[] = [
      toolUseAssistant('toolu_err', 'Edit', {
        file_path: '/a',
        old_string: 'x',
        new_string: 'y',
      }),
      toolResultUser('toolu_err', 'Error: file not found', true),
    ];
    const registry = buildToolUseRegistry(events);
    const { container } = render(<>{renderEvent(events[1]!, 1, registry)}</>);
    expect(container.querySelector('[data-testid="diff-view"]')).toBeNull();
  });

  it('nie psuje renderowania nie-diff tooli', () => {
    const events: JsonlEvent[] = [
      toolUseAssistant('toolu_bash', 'Bash', { command: 'ls' }),
      toolResultUser('toolu_bash', 'file1\nfile2'),
    ];
    const registry = buildToolUseRegistry(events);
    const { container } = render(<>{renderEvent(events[1]!, 1, registry)}</>);
    expect(container.querySelector('[data-testid="diff-view"]')).toBeNull();
  });
});
