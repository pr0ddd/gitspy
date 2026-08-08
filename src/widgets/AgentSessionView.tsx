import { useTranslation } from 'react-i18next';
import { AgentComposer } from './agent/AgentComposer';
import { AgentFeed } from './agent/AgentFeed';

type Props = {
  id: number;
  repo: string;
};

export function AgentSessionView({ id, repo }: Props) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('agent.session')}
      className="bg-background flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <AgentFeed id={id} repo={repo} />
      <AgentComposer id={id} repo={repo} />
    </section>
  );
}
