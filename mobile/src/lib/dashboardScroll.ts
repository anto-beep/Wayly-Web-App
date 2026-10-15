// Lets the global header logo scroll the dashboard back to the top even when
// the dashboard is already mounted (tapping the logo from the dashboard).
let scrollFn: (() => void) | null = null;

export function registerDashboardScroll(fn: (() => void) | null): void {
  scrollFn = fn;
}

export function scrollDashboardToTop(): void {
  scrollFn?.();
}
