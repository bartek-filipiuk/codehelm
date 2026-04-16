import { Search } from './(ui)/sidebar/Search';
import { ProjectList } from './(ui)/sidebar/ProjectList';
import { SessionList } from './(ui)/session-explorer/SessionList';
import { ProjectHeaderWrapper } from './(ui)/session-explorer/ProjectHeader';
import { MainPanel } from './(ui)/conversation/MainPanel';
import { ResizableColumns } from '@/components/layout/ResizableColumns';
import { SettingsDialog } from '@/components/SettingsDialog';

export default function Page() {
  return (
    <ResizableColumns
      sidebar={
        <aside className="flex min-h-0 flex-col bg-neutral-950">
          <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h1 className="text-sm font-semibold tracking-tight">claude-ui</h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                local
              </span>
              <SettingsDialog />
            </div>
          </header>
          <Search />
          <div className="mt-2 min-h-0 flex-1">
            <ProjectList />
          </div>
        </aside>
      }
      sessions={
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h2 className="text-sm font-medium">Sesje</h2>
          </header>
          <ProjectHeaderWrapper />
          <div className="min-h-0 flex-1">
            <SessionList />
          </div>
        </section>
      }
      viewer={
        <main className="min-h-0">
          <MainPanel />
        </main>
      }
    />
  );
}
