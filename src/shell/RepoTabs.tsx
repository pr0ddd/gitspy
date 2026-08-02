import { useTranslation } from 'react-i18next';
import type { Session } from '../session';

type Props = {
  sessions: Session[];
  active: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onAdd: () => void;
};

export function RepoTabs({ sessions, active, onActivate, onClose, onAdd }: Props) {
  const { t } = useTranslation();

  return (
    <nav className="tabs">
      {sessions.map((session) => (
        <div
          key={session.path}
          className={session.path === active ? 'tab active' : 'tab'}
          onClick={() => onActivate(session.path)}
          title={session.path}
        >
          <span className="tab-mark" />
          <span className="tab-name">{session.name}</span>
          <button
            className="tab-close"
            title={t('repo.close')}
            onClick={(e) => {
              e.stopPropagation();
              onClose(session.path);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-add" title={t('repo.open')} onClick={onAdd}>
        +
      </button>
    </nav>
  );
}
