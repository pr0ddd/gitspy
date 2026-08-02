import type { TFunction } from 'i18next';

export type ErrorView = {
  code: string;
  params: Record<string, string>;
  detail?: string;
};

export type ShownError = {
  message: string;
  detail: string | null;
};

const isErrorView = (value: unknown): value is ErrorView =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { code?: unknown }).code === 'string';

export function describeError(error: unknown, t: TFunction<'errors'>): ShownError {
  if (!isErrorView(error)) {
    return { message: t('unknown'), detail: String(error) };
  }
  return {
    message: t(error.code as 'unknown', { ...error.params, defaultValue: t('unknown') }),
    detail: error.detail ?? null,
  };
}
