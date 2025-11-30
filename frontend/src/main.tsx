import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { WorkspaceRuntimeProvider } from './providers/WorkspaceRuntimeProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceRuntimeProvider>
      <App />
    </WorkspaceRuntimeProvider>
  </StrictMode>,
);
