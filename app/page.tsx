import { Search } from './(ui)/sidebar/Search';
import { ProjectList } from './(ui)/sidebar/ProjectList';
import { SessionList } from './(ui)/session-explorer/SessionList';
import { ProjectHeaderWrapper } from './(ui)/session-explorer/ProjectHeader';
import { MainPanel } from './(ui)/conversation/MainPanel';

export default function Page() {
  return (
    <div className="grid h-screen grid-cols-[320px_320px_minmax(0,1fr)] bg-neutral-950 text-neutral-100">
      <aside className="flex min-h-0 flex-col border-r border-neutral-800 bg-neutral-950">
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight">claude-ui</h1>
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">local</span>
        </header>
        <Search />
        <div className="mt-2 min-h-0 flex-1">
          <ProjectList />
        </div>
      </aside>
      <section className="flex min-h-0 flex-col border-r border-neutral-800">
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-medium">Sesje</h2>
        </header>
        <ProjectHeaderWrapper />
        <div className="min-h-0 flex-1">
          <SessionList />
        </div>
      </section>
      <main className="min-h-0">
        <MainPanel />
      </main>
    </div>
  );
}
