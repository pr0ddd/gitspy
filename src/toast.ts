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

export const operationLabel = (operation: Operation) => {
  const kind = operation.kind === 'pushSetUpstream' ? 'push' : operation.kind;
  return t('operation.started', { what: t(`operation.${kind}` as 'operation.fetchDryRun') });
};

const toastKind = (operation: Operation) =>
  operation.kind === 'pushSetUpstream' ? 'push' : operation.kind;

export const notifyOperation = (operation: Operation, stage: 'started' | 'finished') => {
  const kind = toastKind(operation);
  const what = t(`operation.${kind}` as 'operation.fetchDryRun');
  return stage === 'started'
    ? toast.loading(operationLabel(operation), { id: kind })
    : toast.success(t('operation.finished', { what }), { id: kind });
};

export const notifyOperationFailed = (operation: Operation, error: unknown) => {
  const kind = toastKind(operation);
  const what = t(`operation.${kind}` as 'operation.fetchDryRun');
  const shown = describeError(error, i18next.getFixedT(null, 'errors'));
  const description = [shown.message, shown.detail].filter(Boolean).join('\n');
  return toast.error(t('operation.failed', { what }), { id: kind, description });
};

export const dismissAll = () => toast.dismiss();
