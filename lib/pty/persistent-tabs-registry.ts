import { ptyManager } from './manager';
import type { PersistentTab } from './persistent-tabs-store';
import { logger } from '@/lib/server/logger';

interface Entry {
  tab: PersistentTab;
  ptyId: string;
  spawnedAt: number;
}

class PersistentTabsRegistry {
  private byPersistentId = new Map<string, Entry>();

  register(tab: PersistentTab, ptyId: string): void {
    this.byPersistentId.set(tab.persistentId, {
      tab,
      ptyId,
      spawnedAt: Date.now(),
    });
    logger.info(
      { persistentId: tab.persistentId, ptyId, size: this.byPersistentId.size },
      'persistent_tab_registered',
    );
  }

  unregister(persistentId: string): void {
    const had = this.byPersistentId.delete(persistentId);
    if (had) {
      logger.info(
        { persistentId, size: this.byPersistentId.size },
        'persistent_tab_unregistered',
      );
    }
  }

  getPtyId(persistentId: string): string | null {
    return this.byPersistentId.get(persistentId)?.ptyId ?? null;
  }

  getEntry(persistentId: string): Entry | null {
    return this.byPersistentId.get(persistentId) ?? null;
  }

  updateTab(tab: PersistentTab): void {
    const entry = this.byPersistentId.get(tab.persistentId);
    if (entry) entry.tab = tab;
  }

  findByCronTag(tag: string): Entry | null {
    for (const entry of this.byPersistentId.values()) {
      if (entry.tab.cronTag === tag) return entry;
    }
    return null;
  }

  list(): Entry[] {
    return Array.from(this.byPersistentId.values());
  }

  /** Removes any entries whose PTY handle is gone (e.g. crashed). */
  prune(): number {
    let removed = 0;
    for (const [pid, entry] of this.byPersistentId) {
      if (!ptyManager.get(entry.ptyId)) {
        this.byPersistentId.delete(pid);
        removed += 1;
        logger.info({ persistentId: pid }, 'persistent_tab_pruned');
      }
    }
    return removed;
  }
}

export const persistentTabsRegistry = new PersistentTabsRegistry();
export type { Entry as PersistentTabEntry };
