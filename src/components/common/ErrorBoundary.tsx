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
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 sm:p-6 max-w-xl mx-auto my-8 bg-white border-2 border-rose-200 rounded-2xl shadow-lg text-slate-800">
          <div className="flex items-center gap-3 text-rose-600 mb-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {this.props.fallbackTitle || 'Something went wrong displaying this section'}
              </h2>
              <p className="text-xs text-slate-500">The module encountered an unexpected display error.</p>
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
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Display
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
