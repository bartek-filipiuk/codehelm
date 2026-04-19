import { ptyManager, type PtyHandle } from './manager';
import {
  create as storeCreate,
  readAll as storeReadAll,
  remove as storeRemove,
  update as storeUpdate,
  type CreatePersistentTabInput,
  type PersistentTab,
  type UpdatePersistentTabInput,
} from './persistent-tabs-store';
import { persistentTabsRegistry } from './persistent-tabs-registry';
import { logger } from '@/lib/server/logger';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const INIT_CMD_DELAY_MS = 250;

async function spawnAndRegister(tab: PersistentTab): Promise<PtyHandle> {
  const handle = await ptyManager.spawn({
    cwd: tab.cwd,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    ...(tab.shell !== undefined ? { shell: tab.shell } : {}),
    ...(tab.args !== undefined ? { args: tab.args } : {}),
  });
  persistentTabsRegistry.register(tab, handle.id);
  handle.onExit(() => {
    // Only clear the registry entry if it still points at THIS pty. After a
    // user-triggered respawn the registry already holds the fresh handle
    // (different ptyId), and the dying old handle's exit must not nuke it.
    const entry = persistentTabsRegistry.getEntry(tab.persistentId);
    if (entry && entry.ptyId === handle.id) {
      persistentTabsRegistry.unregister(tab.persistentId);
    }
  });
  if (tab.initCommand) {
    const cmd = tab.initCommand;
    setTimeout(() => {
      try {
        handle.write(`${cmd}\r`);
      } catch (err) {
        logger.warn({ err, persistentId: tab.persistentId }, 'persistent_init_cmd_err');
      }
    }, INIT_CMD_DELAY_MS);
  }
  return handle;
}

export async function restoreAllAtStartup(): Promise<void> {
  const tabs = await storeReadAll();
  if (tabs.length === 0) {
    logger.info({}, 'persistent_tabs_empty');
    return;
  }
  let restored = 0;
  for (const tab of tabs) {
    try {
      await spawnAndRegister(tab);
      restored += 1;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, persistentId: tab.persistentId },
        'persistent_restore_failed',
      );
    }
  }
  logger.info({ restored, total: tabs.length }, 'persistent_tabs_restored');
}

export async function createPersistentTab(input: CreatePersistentTabInput): Promise<{
  tab: PersistentTab;
  ptyId: string;
}> {
  const tab = await storeCreate(input);
  try {
    const handle = await spawnAndRegister(tab);
    return { tab, ptyId: handle.id };
  } catch (err) {
    await storeRemove(tab.persistentId).catch(() => undefined);
    throw err;
  }
}

export async function updatePersistentTab(
  persistentId: string,
  patch: UpdatePersistentTabInput,
): Promise<PersistentTab> {
  const tab = await storeUpdate(persistentId, patch);
  persistentTabsRegistry.updateTab(tab);
  return tab;
}

export async function deletePersistentTab(persistentId: string): Promise<boolean> {
  const entry = persistentTabsRegistry.getEntry(persistentId);
  if (entry) {
    const handle = ptyManager.get(entry.ptyId);
    handle?.kill('SIGTERM');
    persistentTabsRegistry.unregister(persistentId);
  }
  return storeRemove(persistentId);
}

export async function listPersistentTabs(): Promise<
  Array<PersistentTab & { alive: boolean; ptyId: string | null }>
> {
  const tabs = await storeReadAll();
  return tabs.map((t) => {
    const entry = persistentTabsRegistry.getEntry(t.persistentId);
    const alive = entry != null && ptyManager.get(entry.ptyId) != null;
    return {
      ...t,
      alive,
      ptyId: entry?.ptyId ?? null,
    };
  });
}

export async function respawnPersistentTab(persistentId: string): Promise<PtyHandle | null> {
  const tabs = await storeReadAll();
  const tab = tabs.find((t) => t.persistentId === persistentId);
  if (!tab) return null;
  const existing = persistentTabsRegistry.getEntry(persistentId);
  if (existing) {
    const handle = ptyManager.get(existing.ptyId);
    handle?.kill('SIGTERM');
    persistentTabsRegistry.unregister(persistentId);
  }
  return spawnAndRegister(tab);
}
