import type { Operation, PathOperation } from '@/types';

export type Confirmation =
  | { kind: 'operation'; operation: Operation }
  | { kind: 'pathOperation'; operation: PathOperation }
  | { kind: 'deleteFile'; path: string }
  | { kind: 'pushRejected'; branch: string; upstream: string | null };

export type Effect =
  | { kind: 'run'; operation: Operation }
  | { kind: 'runPath'; operation: PathOperation }
  | { kind: 'deleteFile'; path: string };

export type Choice = {
  label: string;
  tone: 'default' | 'destructive';
  effect: Effect;
};

export type ConfirmText = {
  message: string;
  params?: Record<string, string>;
  choices: Choice[];
};

const SHORT_HASH = 8;

const single = (
  message: string,
  params: Record<string, string>,
  effect: Effect,
  label = `${message}Action`,
): ConfirmText => ({ message, params, choices: [{ label, tone: 'destructive', effect }] });

const ofOperation = (operation: Operation): ConfirmText | null => {
  const run: Effect = { kind: 'run', operation };
  switch (operation.kind) {
    case 'branchDelete':
      return single('confirm.branchDelete', { name: operation.name }, run);
    case 'pushDelete':
      return single(
        'confirm.pushDelete',
        { branch: operation.branch, remote: operation.remote },
        run,
      );
    case 'drop':
      return single('confirm.drop', { hash: operation.hash.slice(0, SHORT_HASH) }, run);
    case 'reset':
      return operation.mode === 'hard'
        ? single('confirm.resetHard', { hash: operation.hash.slice(0, SHORT_HASH) }, run)
        : null;
    case 'discardAll':
      return single('confirm.discardAll', {}, run);
    default:
      return null;
  }
};

const ofPathOperation = (operation: PathOperation): ConfirmText | null => {
  if (operation.kind !== 'discard') return null;
  const run: Effect = { kind: 'runPath', operation };
  return operation.paths.length === 1
    ? single('confirm.discard', { path: operation.paths[0] }, run)
    : single('confirm.discardMany', { count: String(operation.paths.length) }, run);
};

export const isDangerous = (operation: Operation): boolean => ofOperation(operation) !== null;

export const isDangerousPath = (operation: PathOperation): boolean =>
  ofPathOperation(operation) !== null;

export function confirmationOf(confirmation: Confirmation): ConfirmText {
  switch (confirmation.kind) {
    case 'operation': {
      const text = ofOperation(confirmation.operation);
      if (!text) throw new Error(`operation ${confirmation.operation.kind} needs no confirmation`);
      return text;
    }
    case 'pathOperation': {
      const text = ofPathOperation(confirmation.operation);
      if (!text)
        throw new Error(`path operation ${confirmation.operation.kind} needs no confirmation`);
      return text;
    }
    case 'deleteFile':
      return single(
        'confirm.deleteFile',
        { path: confirmation.path },
        {
          kind: 'deleteFile',
          path: confirmation.path,
        },
      );
    case 'pushRejected':
      return {
        message: confirmation.upstream ? 'confirm.pushRejected' : 'confirm.pushRejectedNoUpstream',
        params: { branch: confirmation.branch, upstream: confirmation.upstream ?? '' },
        choices: [
          {
            label: 'confirm.pushRejectedPull',
            tone: 'default',
            effect: { kind: 'run', operation: { kind: 'pull' } },
          },
          {
            label: 'confirm.pushRejectedForce',
            tone: 'destructive',
            effect: { kind: 'run', operation: { kind: 'pushForceWithLease' } },
          },
        ],
      };
  }
}
