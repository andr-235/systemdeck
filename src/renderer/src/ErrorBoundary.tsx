import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Visible in devtools
    console.error('ErrorBoundary caught', error, info.componentStack);

    try {
      const api = (window as unknown as { api?: Window['api'] }).api;
      if (api?.reportRendererError) {
        void api.reportRendererError({
          scope: 'renderer',
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack ?? undefined,
        });
      }
    } catch {
      // reporting must not throw
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: 'sans-serif',
            gap: 12,
            padding: 24,
            textAlign: 'center',
          }}
          role="alert"
        >
          <h1>Что-то пошло не так</h1>
          <p>Произошла непредвиденная ошибка. Попробуйте перезапустить приложение.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="button" onClick={this.handleReload}>
              Перезапустить
            </button>
            <button type="button" onClick={this.handleReset}>
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
