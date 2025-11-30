import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type RuntimeContext = {
  queryClient: QueryClient;
  resetRuntime: () => QueryClient;
  workspaceKey: number;
};

const WorkspaceRuntimeContext = createContext<RuntimeContext | null>(null);

let workspaceCounter = 0;

const createRuntimeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 0,
        gcTime: 0,
      },
    },
  });

export const WorkspaceRuntimeProvider = ({ children }: { children: ReactNode }) => {
  const [runtime, setRuntime] = useState(() => ({
    queryClient: createRuntimeClient(),
    keyId: 0,
  }));

  const resetRuntime = () => {
    workspaceCounter += 1;
    const nextClient = createRuntimeClient();
    const nextKeyId = workspaceCounter;
    setRuntime({ queryClient: nextClient, keyId: nextKeyId });
    return nextClient;
  };

  const value = useMemo(
    () => ({
      queryClient: runtime.queryClient,
      resetRuntime,
      workspaceKey: runtime.keyId,
    }),
    [runtime.queryClient, runtime.keyId],
  );

  return (
    <WorkspaceRuntimeContext.Provider value={value}>
      <QueryClientProvider client={runtime.queryClient} key={`workspace-${runtime.keyId}`}>
        {children}
      </QueryClientProvider>
    </WorkspaceRuntimeContext.Provider>
  );
};

export const useWorkspaceRuntime = () => {
  const ctx = useContext(WorkspaceRuntimeContext);
  if (!ctx) throw new Error('useWorkspaceRuntime must be used within WorkspaceRuntimeProvider');
  return ctx;
};
