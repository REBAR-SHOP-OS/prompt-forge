import { Component, ReactNode } from "react";

interface State {
  error: Error | null;
}

export default class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[RootErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error.message || "Unexpected error"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
