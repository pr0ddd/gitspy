export type CspViolation = { directive: string; blocked: string; source: string };

export type CspSubject = { name: string; ok: boolean; detail: string };

export type CspFindings = {
  enforced: boolean;
  subjects: CspSubject[];
  violations: CspViolation[];
};

const TAG = 'CSP';

const subjectLine = (subject: CspSubject): string =>
  `${TAG} ${subject.name} ${subject.ok ? 'ok' : 'fail'} ${subject.detail}`.trimEnd();

const violationLine = (violation: CspViolation): string =>
  `${TAG} violation directive=${violation.directive} blocked=${violation.blocked} source=${violation.source}`;

export const reportOf = (findings: CspFindings): string[] => {
  const clean = findings.violations.length === 0;
  const carried = findings.subjects.every((subject) => subject.ok);
  return [
    `${TAG} policy enforced=${findings.enforced ? 'yes' : 'no'}`,
    ...findings.subjects.map(subjectLine),
    ...findings.violations.map(violationLine),
    clean ? `${TAG} clean` : `${TAG} violations=${findings.violations.length}`,
    `${TAG} RESULT ${clean && carried ? 'ok' : 'fail'}`,
  ];
};
