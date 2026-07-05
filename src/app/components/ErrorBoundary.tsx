import React from 'react';
import { AlertTriangle } from 'lucide-react';
import * as Sentry from '@sentry/react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message
        ? this.state.error.message.length > 200
          ? this.state.error.message.slice(0, 200) + '...'
          : this.state.error.message
        : 'An unexpected error occurred.';

      return (
        <div className="h-full w-full bg-[#111B21] flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-[#E9EDEF] text-lg font-semibold">Something went wrong</h2>
          <p className="text-[#8696A0] text-sm max-w-xs">{errorMessage}</p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[#4d91fb] text-white rounded-full text-sm font-medium"
            >
              Reload App
            </button>
            {window.history.length > 1 && (
              <button
                onClick={() => window.history.back()}
                className="px-6 py-2 bg-[#233138] text-[#E9EDEF] rounded-full text-sm font-medium"
              >
                Go Back
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
