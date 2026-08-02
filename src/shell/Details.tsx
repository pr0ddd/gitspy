import { useTranslation } from 'react-i18next';
import type { Session } from '../session';

type Props = {
  session: Session | null;
  onCopy: (text: string) => void;
};

const shortHash = (hash: string) => hash.slice(0, 8);

export function Details({ session, onCopy }: Props) {
  const { t, i18n } = useTranslation();

  const index = session?.selected ?? null;
  if (!session || index === null) {
    return (
      <aside className="details">
        <div className="details-empty">{t('details.pickCommit')}</div>
      </aside>
    );
  }

  const { meta } = session;
  const hash = meta.hash[index];
  if (!hash) {
    return (
      <aside className="details">
        <div className="details-empty">{t('details.loading')}</div>
      </aside>
    );
  }

  const when = new Date(meta.time[index] * 1000);
  const labels = session.refsByCommit.get(index) ?? [];

  return (
    <aside className="details">
      <header className="details-header">
        <span className="details-title">{t('details.commit')}</span>
        <button className="hash" onClick={() => onCopy(hash)} title={t('details.copyHash')}>
          {shortHash(hash)}
        </button>
      </header>

      <div className="details-body">
        <p className="subject">{meta.subject[index]}</p>
        {meta.body[index] ? <pre className="body">{meta.body[index]}</pre> : null}

        <dl className="fields">
          <dt>{t('details.author')}</dt>
          <dd>
            {meta.author[index]} <span className="dim">{meta.email[index]}</span>
          </dd>
          <dt>{t('details.date')}</dt>
          <dd>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(when)}</dd>
        </dl>

        {labels.length ? (
          <div className="chips">
            {labels.map((ref) => (
              <span key={`${ref.kind}:${ref.name}`} className={`chip ${ref.kind}`}>
                {ref.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <section className="details-files">
        <header>{t('details.files')}</header>
        <p className="planned-note">{t('details.filesPlanned')}</p>
      </section>
    </aside>
  );
}
