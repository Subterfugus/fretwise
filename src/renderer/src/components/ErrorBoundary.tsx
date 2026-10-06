import { Component, type ReactNode } from 'react'

/** Keeps one broken lesson/page from blanking the whole app; navigating elsewhere recovers (the parent re-keys it). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Page crashed:', error)
  }

  render() {
    if (this.state.error)
      return (
        <div className="page">
          <h2>Something went wrong on this page</h2>
          <p className="muted">{this.state.error.message}</p>
          <p className="muted">Use the sidebar to go somewhere else; your progress is safe.</p>
        </div>
      )
    return this.props.children
  }
}
