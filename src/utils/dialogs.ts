/**
 * App-wide confirm / prompt dialogs that fit the app (and work inside phone wrappers), replacing the browser's
 * window.confirm / window.prompt boxes:
 *
 *   if (!(await confirmDialog({ title: 'Delete this?', message: '...' }))) return;
 *   const reason = await promptDialog({ title: 'Why?', multiline: true });   // null = cancelled
 *
 * <DialogHost /> (mounted once in App) shows them. If no host is mounted (tests, or very early start-up) the
 * old browser boxes are used instead, so a confirmation is never silently skipped.
 */
export const DIALOG_EVENT = 'app-dialog';

export interface DialogOptions {
  title: string;
  message?: string;
  /** Extra lines shown as a list, e.g. what will be deleted. */
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  /** Confirm stays disabled until this word is typed exactly (case-insensitive), e.g. "RESET". */
  typeToConfirm?: string;
  /** Optional extra button, e.g. "Download backup first". */
  extraAction?: { label: string; onClick: () => void | Promise<void> };
}

export interface PromptOptions extends DialogOptions {
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
}

export type DialogRequest =
  | { kind: 'confirm'; options: DialogOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

let hostCount = 0;
export function registerDialogHost(): () => void {
  hostCount += 1;
  return () => {
    hostCount = Math.max(0, hostCount - 1);
  };
}

function hostMounted(): boolean {
  return typeof window !== 'undefined' && hostCount > 0;
}

export function confirmDialog(options: DialogOptions): Promise<boolean> {
  if (!hostMounted()) {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return Promise.resolve(false);
    const text = [options.title, options.message, ...(options.details || [])].filter(Boolean).join('\n\n');
    return Promise.resolve(window.confirm(text));
  }
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<DialogRequest>(DIALOG_EVENT, { detail: { kind: 'confirm', options, resolve } }));
  });
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  if (!hostMounted()) {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return Promise.resolve(null);
    const text = [options.title, options.message].filter(Boolean).join('\n');
    return Promise.resolve(window.prompt(text, options.defaultValue || ''));
  }
  return new Promise<string | null>((resolve) => {
    window.dispatchEvent(new CustomEvent<DialogRequest>(DIALOG_EVENT, { detail: { kind: 'prompt', options, resolve } }));
  });
}
