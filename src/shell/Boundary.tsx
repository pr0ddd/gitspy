import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('gitspy: отрисовка сорвалась', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="bg-surface text-foreground flex h-full flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-lg font-semibold tracking-tight">Отрисовка сорвалась</h1>
        <pre className="bg-fill-1 text-destructive max-w-2xl overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
          {error.message}
        </pre>
        <button
          className="bg-primary text-primary-foreground h-8 rounded-md px-3 text-sm font-medium"
          onClick={() => this.setState({ error: null })}
        >
          Попробовать снова
        </button>
      </div>
    );
  }
}
