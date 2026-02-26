import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected UI error',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('UI crash captured by AppErrorBoundary', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded border border-destructive/30 bg-card p-6 space-y-3">
          <h1 className="text-lg font-semibold text-destructive">LiteFetch hit a UI error</h1>
          <p className="text-sm text-muted-foreground">
            The app encountered an unexpected error. Your data on disk is not deleted.
          </p>
          <pre className="text-xs bg-muted/50 border border-border rounded p-3 overflow-auto">{this.state.message}</pre>
          <button
            type="button"
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}
