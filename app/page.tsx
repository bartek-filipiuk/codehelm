import { Sidebar } from './(ui)/sidebar/Sidebar';
import { SessionExplorer } from './(ui)/session-explorer/SessionExplorer';
import { MainPanel } from './(ui)/conversation/MainPanel';
import { ResizableColumns } from '@/components/layout/ResizableColumns';
import { PersistentTabsBootstrap } from './PersistentTabsBootstrap';

export default function Page() {
  return (
    <>
      <PersistentTabsBootstrap />
      <ResizableColumns
        sidebar={<Sidebar />}
        sessions={<SessionExplorer />}
        viewer={
          <main className="pane min-h-0">
            <MainPanel />
          </main>
        }
      />
    </>
  );
}
