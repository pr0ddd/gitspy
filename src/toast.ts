import { toast } from 'sonner';
import i18next from './i18n';
import { describeError } from './errors';

const t = i18next.t.bind(i18next);

export const notifyCopied = (value: string) =>
  toast.success(t('toast.copied'), { description: value });

export const notifyError = (error: unknown) => {
  const shown = describeError(error, i18next.getFixedT(null, 'errors'));
  return toast.error(shown.message, { description: shown.detail ?? undefined });
};

export const notifyOperation = (operation: string, stage: 'started' | 'finished') => {
  const what = t(`operation.${operation}` as 'operation.fetchDryRun');
  return stage === 'started'
    ? toast.loading(t('operation.started', { what }), { id: operation })
    : toast.success(t('operation.finished', { what }), { id: operation });
};

export const dismissAll = () => toast.dismiss();
