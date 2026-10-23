import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DevPanelFallbackShell } from './dev-panel-fallback-shell';

type Props = { children: ReactNode; open: boolean };

type State = { failed: boolean };

export class DevPanelShellBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.open && !this.props.open) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[dev-panel]', error, info.componentStack);
    }
  }

  render() {
    if (this.state.failed) return <DevPanelFallbackShell />;
    return this.props.children;
  }
}
