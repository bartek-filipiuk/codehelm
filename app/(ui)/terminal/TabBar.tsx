'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useTerminalStore,
  TERMINAL_TAB_CAP,
  TERMINAL_TAB_TITLE_MAX_LEN,
} from '@/stores/terminal-slice';
import { cn } from '@/lib/utils';
import { toastInfo } from '@/lib/ui/toast';

interface Props {
  onNewTab?: () => void;
}

const INIT_COMMAND_MAX_LEN = 2048;

export function TabBar({ onNewTab }: Props) {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeTabId);
  const setActive = useTerminalStore((s) => s.setActive);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const editTab = useTerminalStore((s) => s.editTab);

  const [editingId, setEditingId] = useState<string | null>(null);

  const closeWithToast = (id: string) => {
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === id);
    closeTab(id);
    toastInfo('Tab closed', {
      id: `tab-closed-${id}`,
      ...(tab?.title ? { description: tab.title } : {}),
    });
  };

  // If the stored editingId points at a tab that no longer exists (closed
  // externally), treat it as null at render time. Avoids setState-in-effect.
  const activeEditId = useMemo(
    () => (editingId && tabs.some((t) => t.id === editingId) ? editingId : null),
    [editingId, tabs],
  );

  const startEdit = (id: string) => setEditingId(id);
  const cancelEdit = () => setEditingId(null);

  return (
    <div className="tabs-row">
      {tabs.map((t) => {
        const isEditing = activeEditId === t.id;
        const hasPersistent = t.panes.some((p) => p.persistentId);
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            className={cn('tab', t.id === activeId && 'active')}
            title={isEditing ? undefined : `${t.title} · ${t.cwd} · dbl-click to edit`}
            onClick={() => !isEditing && setActive(t.id)}
            onMouseDown={(e) => {
              if (isEditing) return;
              if (e.button === 1) {
                e.preventDefault();
                closeWithToast(t.id);
              }
            }}
          >
            <span className="dot ready" />
            <span
              className="mono"
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEdit(t.id);
              }}
            >
              {t.title}
            </span>
            <button
              type="button"
              className="close"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeWithToast(t.id);
              }}
              tabIndex={isEditing ? -1 : 0}
            >
              ×
            </button>
            {isEditing && (
              <TabEditPopover
                initialTitle={t.title}
                initialInitCommand={t.initCommand ?? ''}
                canEditInitCommand={hasPersistent}
                onCommit={({ title, initCommand }) => {
                  const patch: { title?: string; initCommand?: string | null } = {};
                  const trimmedTitle = title.trim();
                  if (trimmedTitle && trimmedTitle !== t.title) patch.title = trimmedTitle;
                  if (hasPersistent) {
                    const nextCmd = initCommand.trim();
                    const prevCmd = (t.initCommand ?? '').trim();
                    if (nextCmd !== prevCmd) {
                      patch.initCommand = nextCmd.length > 0 ? nextCmd : null;
                    }
                  }
                  if (Object.keys(patch).length > 0) editTab(t.id, patch);
                  setEditingId(null);
                }}
                onCancel={cancelEdit}
              />
            )}
          </div>
        );
      })}
      {onNewTab && (
        <button
          type="button"
          className="tab-add"
          disabled={tabs.length >= TERMINAL_TAB_CAP}
          onClick={onNewTab}
          title={tabs.length >= TERMINAL_TAB_CAP ? '16-tab limit reached' : 'New tab'}
          aria-label="New tab"
        >
          +
        </button>
      )}
    </div>
  );
}

interface TabEditPopoverProps {
  initialTitle: string;
  initialInitCommand: string;
  canEditInitCommand: boolean;
  onCommit: (next: { title: string; initCommand: string }) => void;
  onCancel: () => void;
}

function TabEditPopover({
  initialTitle,
  initialInitCommand,
  canEditInitCommand,
  onCommit,
  onCancel,
}: TabEditPopoverProps) {
  const [title, setTitle] = useState(initialTitle);
  const [initCommand, setInitCommand] = useState(initialInitCommand);
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  // Click-outside cancels. Mousedown (not click) so we beat react's click
  // bubbling on the tab itself, which would otherwise re-trigger setActive.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const node = ref.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) onCancel();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onCancel]);

  const submit = () => onCommit({ title, initCommand });

  return (
    <div
      ref={ref}
      className="tab-edit-popover"
      role="dialog"
      aria-label="Edit tab"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <label className="tab-edit-row">
        <span className="tab-edit-label">title</span>
        <input
          ref={titleRef}
          type="text"
          className="mono tab-edit-input"
          aria-label="Tab title"
          value={title}
          maxLength={TERMINAL_TAB_TITLE_MAX_LEN}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </label>
      <label className="tab-edit-row">
        <span className="tab-edit-label">on restart</span>
        <input
          type="text"
          className="mono tab-edit-input"
          aria-label="Restart command"
          value={initCommand}
          maxLength={INIT_COMMAND_MAX_LEN}
          disabled={!canEditInitCommand}
          placeholder={
            canEditInitCommand
              ? 'e.g. claude --resume <id>'
              : 'available after server registers this tab'
          }
          onChange={(e) => setInitCommand(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </label>
      <div className="tab-edit-actions">
        <span className="tab-edit-hint">enter saves · esc cancels</span>
        <button type="button" className="tab-edit-btn" onClick={onCancel}>
          cancel
        </button>
        <button
          type="button"
          className="tab-edit-btn primary"
          onClick={submit}
        >
          save
        </button>
      </div>
    </div>
  );
}
