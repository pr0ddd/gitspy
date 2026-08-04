import { toast } from 'sonner';
import i18next from './i18n';
import { describeError } from './errors';
import type { Operation } from './types';

const t = i18next.t.bind(i18next);

export const notifyCopied = (value: string) =>
  toast.success(t('toast.copied'), { description: value });

export const notifyError = (error: unknown) => {
  const shown = describeError(error, i18next.getFixedT(null, 'errors'));
  return toast.error(shown.message, { description: shown.detail ?? undefined });
};

const whatOf = (operation: Operation) => {
  const kind = operation.kind === 'pushSetUpstream' ? 'push' : operation.kind;
  return t(`operation.${kind}` as 'operation.fetchDryRun');
};

export const notifyOperation = (operation: Operation) =>
  toast.success(t('operation.finished', { what: whatOf(operation) }));

export const notifyOperationFailed = (operation: Operation, error: unknown) => {
  const shown = describeError(error, i18next.getFixedT(null, 'errors'));
  const description = [shown.message, shown.detail].filter(Boolean).join('\n');
  return toast.error(t('operation.failed', { what: whatOf(operation) }), { description });
};

export const dismissAll = () => toast.dismiss();
