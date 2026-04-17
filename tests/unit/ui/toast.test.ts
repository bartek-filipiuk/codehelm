import { describe, it, expect, vi, beforeEach } from 'vitest';

const successMock = vi.fn<(msg: string, opts?: Record<string, unknown>) => string>();
const errorMock = vi.fn<(msg: string, opts?: Record<string, unknown>) => string>();
const infoMock = vi.fn<(msg: string, opts?: Record<string, unknown>) => string>();
const warningMock = vi.fn<(msg: string, opts?: Record<string, unknown>) => string>();
const dismissMock = vi.fn<(id?: string | number) => void>();

vi.mock('sonner', () => {
  const fn = ((_message: string, _opts?: unknown) => 'id-default') as unknown as {
    (message: string, opts?: unknown): string;
    success: typeof successMock;
    error: typeof errorMock;
    info: typeof infoMock;
    warning: typeof warningMock;
    dismiss: typeof dismissMock;
  };
  fn.success = successMock;
  fn.error = errorMock;
  fn.info = infoMock;
  fn.warning = warningMock;
  fn.dismiss = dismissMock;
  return { toast: fn };
});

beforeEach(() => {
  successMock.mockReset();
  errorMock.mockReset();
  infoMock.mockReset();
  warningMock.mockReset();
  dismissMock.mockReset();
  successMock.mockReturnValue('id-success');
  errorMock.mockReturnValue('id-error');
  infoMock.mockReturnValue('id-info');
  warningMock.mockReturnValue('id-warning');
});

describe('toast wrapper', () => {
  it('toastSuccess uses default 3000 ms duration', async () => {
    const { toastSuccess, TOAST_DURATION_MS } = await import('@/lib/ui/toast');
    expect(TOAST_DURATION_MS).toBe(3000);
    toastSuccess('Saved');
    expect(successMock).toHaveBeenCalledTimes(1);
    const call = successMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe('Saved');
    expect(call![1]).toEqual({ duration: 3000 });
  });

  it('toastError forwards id, description, and custom duration', async () => {
    const { toastError } = await import('@/lib/ui/toast');
    toastError('Boom', { id: 'save', description: 'network', duration: 5000 });
    const call = errorMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe('Boom');
    expect(call![1]).toEqual({ id: 'save', description: 'network', duration: 5000 });
  });

  it('toastWarning forwards action callback', async () => {
    const { toastWarning } = await import('@/lib/ui/toast');
    const onClick = vi.fn();
    toastWarning('Conflict', { action: { label: 'Reload', onClick } });
    const call = warningMock.mock.calls[0];
    expect(call).toBeDefined();
    const opts = call![1] as { action?: { label: string; onClick: () => void } };
    expect(opts.action).toBeDefined();
    expect(opts.action!.label).toBe('Reload');
    opts.action!.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('toastInfo falls through to sonner.info when available', async () => {
    const { toastInfo } = await import('@/lib/ui/toast');
    toastInfo('Hello');
    expect(infoMock).toHaveBeenCalledTimes(1);
  });

  it('dismissToast forwards id', async () => {
    const { dismissToast } = await import('@/lib/ui/toast');
    dismissToast('claim-id');
    expect(dismissMock).toHaveBeenCalledWith('claim-id');
  });
});
