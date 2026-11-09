import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    const msg = error?.message || String(error || '');
    const isStaleHookOrChunk =
      /Invalid hook call/i.test(msg) ||
      /Cannot read properties of null \(reading 'useState'\)/i.test(msg) ||
      /reading 'useState'/i.test(msg) ||
      /reading 'useMemo'/i.test(msg) ||
      /reading 'useReducer'/i.test(msg) ||
      /Failed to fetch dynamically imported module/i.test(msg) ||
      /Loading chunk/i.test(msg);

    if (typeof window !== 'undefined' && isStaleHookOrChunk) {
      const lastReload = Number(sessionStorage.getItem('last_chunk_reload') || '0');
      const now = Date.now();
      if (now - lastReload > 8000) {
        sessionStorage.setItem('last_chunk_reload', String(now));
        console.warn('[ErrorBoundary] Stale Vite bundle/hook instance detected. Reloading once to resync...');
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      const isModuleFetchError =
        this.state.error?.name === 'TypeError' ||
        /Failed to fetch dynamically imported module/i.test(this.state.error?.message || '') ||
        /Loading chunk/i.test(this.state.error?.message || '') ||
        /Invalid hook call/i.test(this.state.error?.message || '') ||
        /reading 'useState'/i.test(this.state.error?.message || '');

      return (
        <div className="p-4 sm:p-6 max-w-xl mx-auto my-8 bg-white border-2 border-rose-200 rounded-2xl shadow-lg text-slate-800">
          <div className="flex items-center gap-3 text-rose-600 mb-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isModuleFetchError
                  ? 'Application Reload Required'
                  : this.props.fallbackTitle || 'Something went wrong displaying this section'}
              </h2>
              <p className="text-xs text-slate-500">
                {isModuleFetchError
                  ? 'A new update was deployed or the connection reconnected. Please reload to load the latest version.'
                  : 'The module encountered an unexpected display error.'}
              </p>
            </div>
          </div>
          {this.state.error && (
            <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-rose-800 overflow-x-auto mb-4 whitespace-pre-wrap">
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload App
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-colors"
            >
              Retry Display
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
