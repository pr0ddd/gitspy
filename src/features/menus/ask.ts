export type Ask =
  | { kind: 'branch' }
  | { kind: 'stash' }
  | { kind: 'branchAt'; hash: string }
  | { kind: 'tagAt'; hash: string }
  | { kind: 'annotatedTagAt'; hash: string }
  | { kind: 'renameBranch'; from: string }
  | { kind: 'editMessage'; full: string };
