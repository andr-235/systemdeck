import { Component, type ErrorInfo, type ReactNode } from 'react';
import SystemErrorScreen from './components/SystemErrorScreen';

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

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <SystemErrorScreen
          title="Что-то пошло не так"
          message="Произошла непредвиденная ошибка. Попробуйте перезапустить приложение."
          buttonLabel="Перезапустить"
          onRetry={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
