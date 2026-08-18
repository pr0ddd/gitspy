import { toast } from 'sonner';
import i18next from '@/shared/config/i18n';
import { describeError } from '@/shared/api/errors';
import type { Operation, OperationOutcome } from '@/shared/api/types';

const t = i18next.t.bind(i18next);

const GLANCED = 3000;
const READ = 5000;
const STUDIED = 10000;

export type Where = {
  readonly branch: string | null;
  readonly upstream: string | null;
};

export const notifyCopied = (value: string) =>
  toast.info(t('toast.copied'), { description: value });

export const notifyError = (error: unknown) => {
  const shown = describeError(error, i18next.getFixedT(null, 'errors'));
  return toast.error(shown.message, {
    description: shown.detail ?? undefined,
    duration: STUDIED,
  });
};

const outcomeKind = (operation: Operation) =>
  operation.kind === 'fetchInto' && operation.remote === '.' ? 'fastForward' : operation.kind;

const BRINGS_COMMITS: ReadonlySet<ReturnType<typeof outcomeKind>> = new Set([
  'pull',
  'pullFfOnly',
  'pullRebase',
  'merge',
  'fastForward',
]);

const GLANCED_AT: ReadonlySet<ReturnType<typeof outcomeKind>> = new Set([
  'push',
  'pushBranch',
  'pushSetUpstream',
  'pushForceWithLease',
  'checkout',
  'checkoutTracking',
  'branch',
  'branchAt',
  'branchRename',
  'rebase',
  'tagAt',
  'annotatedTagAt',
]);

const remoteOf = (upstream: string | null): string | null =>
  upstream && upstream.includes('/') ? upstream.slice(0, upstream.indexOf('/')) : null;

const broughtNothing = (operation: Operation, outcome: OperationOutcome): boolean => {
  const kind = outcomeKind(operation);
  if (!BRINGS_COMMITS.has(kind)) return false;
  if (kind === 'fastForward') return !outcome.stdout.trim() && !outcome.stderr.trim();
  return /already up[- ]to[- ]date|is up to date\./i.test(outcome.stdout);
};

const branchThatDidNotMove = (operation: Operation, where: Where): string | null => {
  if (operation.kind === 'merge') return operation.branch;
  if (operation.kind === 'fetchInto') return operation.from;
  return where.upstream;
};

const detailOf = (operation: Operation, where: Where): string | undefined => {
  switch (operation.kind) {
    case 'push':
    case 'pushForceWithLease': {
      const remote = remoteOf(where.upstream);
      return where.branch && remote
        ? t('toast.pushedHint', { branch: where.branch, remote })
        : undefined;
    }
    case 'pushBranch':
    case 'pushSetUpstream':
      return t('toast.pushedHint', { branch: operation.branch, remote: operation.remote });
    case 'merge':
      return where.branch
        ? t('toast.mergedHint', { from: operation.branch, into: where.branch })
        : undefined;
    case 'checkout':
      return operation.branch;
    case 'checkoutTracking':
      return operation.local;
    case 'branch':
    case 'branchAt':
    case 'tagAt':
    case 'annotatedTagAt':
      return operation.name;
    case 'branchRename':
      return t('toast.renamedHint', { from: operation.from, to: operation.to });
    case 'pushDelete':
      return `${operation.remote}/${operation.branch}`;
    default:
      return undefined;
  }
};

const NOWHERE: Where = { branch: null, upstream: null };

export const notifyOperation = (
  operation: Operation,
  outcome?: OperationOutcome,
  where: Where = NOWHERE,
) => {
  if (outcome && broughtNothing(operation, outcome)) {
    const branch = branchThatDidNotMove(operation, where);
    toast.info(t('toast.alreadyUpToDate'), {
      description: branch ? t('toast.alreadyUpToDateHint', { branch }) : undefined,
      duration: READ,
    });
  }
  const kind = outcomeKind(operation);
  const description = detailOf(operation, where);
  return toast.success(doneTitle(operation, description !== undefined), {
    description,
    duration: GLANCED_AT.has(kind) ? GLANCED : READ,
  });
};

const doneTitle = (operation: Operation, hasDetail: boolean): string => {
  if (operation.kind === 'branchDelete') {
    return t('toast.done.branchDelete', { name: operation.name });
  }
  if (operation.kind === 'merge' && !hasDetail) return t('toast.done.mergeUnnamed');
  return t(`toast.done.${outcomeKind(operation)}` as 'toast.done.pull');
};

const failTitle = (operation: Operation): string =>
  operation.kind === 'branchDelete'
    ? t('toast.fail.branchDelete', { name: operation.name })
    : t(`toast.fail.${outcomeKind(operation)}` as 'toast.fail.pull');

export const notifyCheckedOut = (ref: string) =>
  toast.success(t('toast.done.checkout'), { description: ref, duration: GLANCED });

export const notifyDeleted = (path: string) =>
  toast.info(t('toast.deleted', { path }), { duration: READ });

export const notifyCloned = (name: string) =>
  toast.success(t('toast.cloned', { name }), { duration: READ });

export const notifyRepoCreated = (name: string) =>
  toast.success(t('toast.repoCreated'), { description: name, duration: READ });

export const notifyHostConnected = (label: string) =>
  toast.success(t('toast.hostConnected', { host: label }), { duration: READ });

export const notifyOperationFailed = (operation: Operation, error: unknown) => {
  const shown = describeError(error, i18next.getFixedT(null, 'errors'));
  const description = [shown.message, shown.detail].filter(Boolean).join('\n');
  return toast.error(failTitle(operation), { description, duration: STUDIED });
};

export const notifyNotARepository = () =>
  toast.error(t('toast.dropNotRepo'), {
    description: t('toast.dropNotRepoHint'),
    duration: STUDIED,
  });

export const dismissAll = () => toast.dismiss();
