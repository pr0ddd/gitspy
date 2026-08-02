import { useTranslation } from 'react-i18next';
import type { Session } from '../session';

const ACTIONS = ['undo', 'redo', 'pull', 'push', 'branch', 'stash', 'pop', 'terminal'] as const;

type Props = {
  session: Session | null;
  avatars: boolean;
  onAvatars: (on: boolean) => void;
};

export function Toolbar({ session, avatars, onAvatars }: Props) {
  const { t } = useTranslation();
  const head = session?.layout?.refs.find((r) => r.is_head);

  return (
    <div className="toolbar">
      <div className="toolbar-repo">
        <span className="field-label">{t('toolbar.repositoryLabel')}</span>
        <span className="field-value">{session?.name ?? '—'}</span>
      </div>
      <div className="toolbar-repo">
        <span className="field-label">{t('toolbar.branchLabel')}</span>
        <span className="field-value">{head?.name ?? '—'}</span>
      </div>

      <div className="toolbar-actions">
        {ACTIONS.map((action) => (
          <button key={action} className="action" disabled title={t('toolbar.notYet')}>
            {t(`toolbar.${action}` as 'toolbar.pull')}
          </button>
        ))}
      </div>

      <label className="toggle">
        <input type="checkbox" checked={avatars} onChange={(e) => onAvatars(e.target.checked)} />
        {t('graph.avatars')}
      </label>
    </div>
  );
}
