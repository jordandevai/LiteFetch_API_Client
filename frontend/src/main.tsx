import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { WorkspaceRuntimeProvider } from './providers/WorkspaceRuntimeProvider';
import { AppErrorBoundary } from './components/layout/AppErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <WorkspaceRuntimeProvider>
        <App />
      </WorkspaceRuntimeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
