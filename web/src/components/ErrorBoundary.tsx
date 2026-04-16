'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })

    // In production, send to error reporting service
    // Example: Sentry.captureException(error, { extra: errorInfo })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="glass-panel max-w-md w-full p-8 text-center">
            {/* Error Icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-danger/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-danger" />
            </div>

            {/* Title */}
            <h2 className="font-display text-xl font-bold text-white mb-2">
              Something went wrong
            </h2>

            {/* Description */}
            <p className="text-text-secondary font-body mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {/* Error details (dev mode) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-void rounded-lg text-left">
                <div className="text-danger text-xs font-mono mb-2">
                  {this.state.error.name}: {this.state.error.message}
                </div>
                {this.state.errorInfo && (
                  <pre className="text-text-tertiary text-xs font-mono overflow-auto max-h-32">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="btn-primary"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <a href="/" className="btn-secondary">
                <Home className="w-4 h-4" />
                Go Home
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * HOC wrapper for functional components
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}

/**
 * Hook for functional components to trigger error boundary
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null)

  const handleError = React.useCallback((err: Error) => {
    console.error('Error handled:', err)
    setError(err)
  }, [])

  const clearError = React.useCallback(() => {
    setError(null)
  }, [])

  if (error) {
    throw error // This will be caught by the nearest ErrorBoundary
  }

  return { handleError, clearError }
}
