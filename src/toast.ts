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

export const notifyOperation = (operation: Operation, stage: 'started' | 'finished') => {
  const kind = operation.kind === 'pushSetUpstream' ? 'push' : operation.kind;
  const what = t(`operation.${kind}` as 'operation.fetchDryRun');
  return stage === 'started'
    ? toast.loading(t('operation.started', { what }), { id: kind })
    : toast.success(t('operation.finished', { what }), { id: kind });
};

export const dismissAll = () => toast.dismiss();
