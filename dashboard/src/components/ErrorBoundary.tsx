import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div role="alert" style={{
                    padding: '24px',
                    margin: '16px',
                    border: '2px solid #ef4444',
                    backgroundColor: '#1b1b21',
                    color: '#e3e1ea',
                    fontFamily: "'JetBrains Mono', monospace",
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '12px',
                        color: '#ef4444',
                        fontWeight: 700,
                        textTransform: 'uppercase' as const,
                        fontSize: '11px',
                        letterSpacing: '0.1em',
                    }}>
                        ⚠ RENDER ERROR
                    </div>
                    <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#a78b7d' }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        aria-label="Retry"
                        style={{
                            padding: '8px 16px',
                            border: '2px solid #3f3f46',
                            backgroundColor: '#292930',
                            color: '#f97316',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '12px',
                            fontWeight: 700,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.05em',
                            cursor: 'pointer',
                        }}
                    >
                        Retry
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
