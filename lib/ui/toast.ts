import { toast as sonner } from 'sonner';

export const TOAST_DURATION_MS = 3000;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  description?: string;
  duration?: number;
  action?: ToastAction;
}

function baseOptions(opts?: ToastOptions) {
  const o: Record<string, unknown> = { duration: opts?.duration ?? TOAST_DURATION_MS };
  if (opts?.id !== undefined) o['id'] = opts.id;
  if (opts?.description !== undefined) o['description'] = opts.description;
  if (opts?.action !== undefined) {
    o['action'] = { label: opts.action.label, onClick: opts.action.onClick };
  }
  return o;
}

export function toastSuccess(message: string, opts?: ToastOptions): string | number {
  return sonner.success(message, baseOptions(opts));
}

export function toastError(message: string, opts?: ToastOptions): string | number {
  return sonner.error(message, baseOptions(opts));
}

export function toastInfo(message: string, opts?: ToastOptions): string | number {
  return sonner.info ? sonner.info(message, baseOptions(opts)) : sonner(message, baseOptions(opts));
}

export function toastWarning(message: string, opts?: ToastOptions): string | number {
  return sonner.warning
    ? sonner.warning(message, baseOptions(opts))
    : sonner(message, baseOptions(opts));
}

export function dismissToast(id?: string | number): void {
  sonner.dismiss(id);
}
