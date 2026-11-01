/** Tiny app-wide toast: notify('Please enter a name') from anywhere; <ToastHost/> shows it. */
export type ToastKind = 'error' | 'success' | 'info';
export const TOAST_EVENT = 'app-toast';

export function notify(message: string, kind: ToastKind = 'error') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, kind } }));
}
