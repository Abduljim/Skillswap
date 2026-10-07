import { Component, type ReactNode } from 'react';

/**
 * Last line of defence for the call UI. A crash inside the call overlay used
 * to unmount the ENTIRE app (there was no boundary anywhere), which showed up
 * as "picking up a call gives a blank white page" with nothing on screen to
 * explain it. Now the crash is contained, named, and one tap returns to the
 * app.
 */
export class CallErrorBoundary extends Component<
  { label: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[calls] ${this.props.label} crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[100] bg-[#0d0f15] flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-white font-semibold mb-2">The {this.props.label} hit a problem</p>
          <p className="text-white/60 text-sm mb-4 break-words">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#fb4f1d] text-white text-sm font-semibold px-6 py-2.5 active:scale-95"
          >
            Return to the app
          </button>
        </div>
      </div>
    );
  }
}
