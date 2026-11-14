// @ts-nocheck
import React from 'react';

export class ErrorBoundary extends React.Component {
  static getDerivedStateFromError(error) {
    return;
  }

  componentDidCatch(error, errorInfo) {}

  render() {
    return this.props.children;
  }
}
