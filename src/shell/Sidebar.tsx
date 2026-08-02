import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from '../session';
import type { RefKind, RefView } from '../types';

type Props = {
  session: Session | null;
  onPick: (commit: number) => void;
};

type Group = {
  key: string;
  title: string;
  entries: Entry[];
  planned?: boolean;
};

type Entry = {
  label: string;
  detail?: string;
  commit: number | null;
  isHead: boolean;
};

const fromRefs = (refs: RefView[], kind: RefKind): Entry[] =>
  refs
    .filter((r) => r.kind === kind)
    .map((r) => ({ label: r.name, commit: r.commit, isHead: r.is_head }));

const byRemote = (refs: RefView[]): Map<string, Entry[]> => {
  const grouped = new Map<string, Entry[]>();
  for (const ref of refs) {
    if (ref.kind !== 'remoteBranch') continue;
    const slash = ref.name.indexOf('/');
    const remote = slash === -1 ? ref.name : ref.name.slice(0, slash);
    const rest = slash === -1 ? ref.name : ref.name.slice(slash + 1);
    const list = grouped.get(remote);
    const entry: Entry = { label: rest, commit: ref.commit, isHead: false };
    if (list) list.push(entry);
    else grouped.set(remote, [entry]);
  }
  return grouped;
};

export function Sidebar({ session, onPick }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const refs = session?.layout?.refs ?? [];
  const remotes = useMemo(() => byRemote(refs), [refs]);

  const groups: Group[] = [
    { key: 'local', title: t('sidebar.local'), entries: fromRefs(refs, 'localBranch') },
    {
      key: 'remote',
      title: t('sidebar.remote'),
      entries: [...remotes].flatMap(([remote, entries]) =>
        entries.map((e) => ({ ...e, label: `${remote}/${e.label}` })),
      ),
    },
    {
      key: 'worktrees',
      title: t('sidebar.worktrees'),
      entries: (session?.worktrees ?? []).map((w) => ({
        label: w.name,
        detail: w.branch ?? undefined,
        commit: null,
        isHead: w.is_main,
      })),
    },
    { key: 'stashes', title: t('sidebar.stashes'), entries: fromRefs(refs, 'stash') },
    { key: 'tags', title: t('sidebar.tags'), entries: fromRefs(refs, 'tag') },
    { key: 'pullRequests', title: t('sidebar.pullRequests'), entries: [], planned: true },
    { key: 'issues', title: t('sidebar.issues'), entries: [], planned: true },
  ];

  const needle = filter.trim().toLowerCase();
  const visible = groups.map((group) => ({
    ...group,
    shown: needle
      ? group.entries.filter((e) => e.label.toLowerCase().includes(needle))
      : group.entries,
  }));

  return (
    <aside className="sidebar">
      <input
        className="filter"
        value={filter}
        placeholder={t('sidebar.filter')}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="sections">
        {visible.map((group) => {
          const isCollapsed = collapsed[group.key] ?? false;
          return (
            <section key={group.key} className={group.planned ? 'section planned' : 'section'}>
              <header
                onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !isCollapsed }))}
                title={group.planned ? t('sidebar.plannedHint') : undefined}
              >
                <span className={isCollapsed ? 'chevron' : 'chevron open'}>›</span>
                <span className="section-title">{group.title}</span>
                <span className="section-count">{group.entries.length}</span>
              </header>

              {isCollapsed ? null : (
                <ul>
                  {group.shown.map((entry) => (
                    <li
                      key={`${group.key}:${entry.label}`}
                      className={entry.isHead ? 'entry head' : 'entry'}
                      onClick={() => entry.commit !== null && onPick(entry.commit)}
                      title={entry.detail ?? entry.label}
                    >
                      <span className="entry-label">{entry.label}</span>
                      {entry.detail ? <span className="entry-detail">{entry.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
