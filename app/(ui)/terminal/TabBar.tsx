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

export function TabBar({ onNewTab }: Props) {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeTabId);
  const setActive = useTerminalStore((s) => s.setActive);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const renameTab = useTerminalStore((s) => s.renameTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

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

  const startEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setDraft(currentTitle);
  };

  const commitEdit = () => {
    if (!activeEditId) return;
    const trimmed = draft.trim();
    if (trimmed.length > 0) renameTab(activeEditId, trimmed);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="tabs-row">
      {tabs.map((t) => {
        const isEditing = activeEditId === t.id;
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            className={cn('tab', t.id === activeId && 'active')}
            title={isEditing ? undefined : `${t.title} · ${t.cwd} · dbl-click to rename`}
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
            {isEditing ? (
              <RenameInput
                initialValue={draft}
                onChange={setDraft}
                onCommit={commitEdit}
                onCancel={cancelEdit}
              />
            ) : (
              <span
                className="mono"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEdit(t.id, t.title);
                }}
              >
                {t.title}
              </span>
            )}
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

function RenameInput({
  initialValue,
  onChange,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      className="mono tab-rename"
      defaultValue={initialValue}
      maxLength={TERMINAL_TAB_TITLE_MAX_LEN}
      aria-label="Rename tab"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
