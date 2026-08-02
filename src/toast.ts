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

export const notifyPlanned = (what: string) => toast.info(what);

export const dismissAll = () => toast.dismiss();
