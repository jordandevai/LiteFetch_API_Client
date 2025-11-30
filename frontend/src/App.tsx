import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CollectionSidebar } from './components/sidebar/CollectionSidebar';
import { RequestEditor } from './components/request/RequestEditor';
import { ResponseViewer } from './components/response/ResponseViewer';
import { EnvironmentPanel } from './components/environment/EnvironmentPanel';
import { HistoryDrawer } from './components/history/HistoryDrawer';
import { useActiveRequestStore } from './stores/useActiveRequestStore';
import { useActiveRequestFromCollection } from './hooks/useCollectionData';
import type { RequestResult } from './lib/api';
import { ImportPostmanButton } from './components/import/ImportPostmanButton';
import { CookieManager } from './components/cookies/CookieManager';
import { useEnvironmentQuery } from './hooks/useEnvironmentData';
import { LiteAPI } from './lib/api';
import { WorkspacePassphraseModal } from './components/workspace/WorkspacePassphraseModal';
import { useWorkspaceLockStore } from './stores/useWorkspaceLockStore';
import { useWorkspaceQuery } from './hooks/useWorkspace';

function App() {
  const [showEnvPanel, setShowEnvPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCookies, setShowCookies] = useState(false);
  const { setResult, setActiveRequestId } = useActiveRequestStore();
  const activeRequest = useActiveRequestFromCollection(useActiveRequestStore((s) => s.activeRequestId));
  const { data: envData } = useEnvironmentQuery();
  const { data: workspace } = useWorkspaceQuery();
  const { setStatus, openModal } = useWorkspaceLockStore();

  useEffect(() => {
    LiteAPI.getWorkspaceStatus()
      .then(({ locked, legacy }) => setStatus(locked, legacy))
      .catch(() => setStatus(false, false));
  }, [workspace?.path, setStatus]);

  const loadHistoryItem = async (res: RequestResult) => {
    setResult(res);
    if (activeRequest && activeRequest.id === res.request_id) return;
    // If the request ID exists in collection, select it; otherwise just set result.
    setActiveRequestId(res.request_id);
  };

  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden flex flex-col">
      {/* Top Header */}
      <div className="h-12 border-b border-border flex items-center px-4 bg-card select-none justify-between">
        <div className="font-bold text-lg tracking-tight text-primary flex items-center gap-2">
          <img
            src="/lf_logo.png"
            alt="LiteFetch logo"
            className="h-7 w-7 rounded-sm shadow-sm"
          />
          LiteFetch
        </div>
        <div className="flex items-center gap-2">
          <ImportPostmanButton />
          <button
            className="px-3 py-1.5 text-sm rounded bg-muted hover:bg-secondary transition-colors font-medium"
            onClick={() => openModal()}
            type="button"
          >
            Workspace
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-muted hover:bg-secondary transition-colors font-medium"
            onClick={() => setShowEnvPanel(true)}
            type="button"
          >
            Environments
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-muted hover:bg-secondary transition-colors font-medium"
            onClick={() => setShowCookies(true)}
            type="button"
          >
            Cookies
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-muted hover:bg-secondary transition-colors font-medium"
            onClick={() => setShowHistory(true)}
            type="button"
          >
            History
          </button>
        </div>
      </div>

      {/* Main Workspace: Sidebar + vertical split */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={22} minSize={16} maxSize={30}>
            <CollectionSidebar />
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
          <Panel defaultSize={78} minSize={50}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={60} minSize={30}>
                <RequestEditor />
              </Panel>
              <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />
              <Panel defaultSize={40} minSize={10}>
                <ResponseViewer />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Footer */}
      <div className="h-6 border-t border-border bg-card flex items-center justify-center px-4">
        <div className="text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} JTech Minds LLC
        </div>
      </div>

      <EnvironmentPanel open={showEnvPanel} onClose={() => setShowEnvPanel(false)} />
      <CookieManager open={showCookies} onClose={() => setShowCookies(false)} />
      <HistoryDrawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        onLoad={loadHistoryItem}
      />
      <WorkspacePassphraseModal />
    </div>
  );
}

export default App;
