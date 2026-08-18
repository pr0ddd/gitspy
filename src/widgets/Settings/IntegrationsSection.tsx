import { HostCard } from '@/widgets/HostConnect';
import { HOSTS } from '@/entities/repo';
import { SettingRow } from './SettingRow';
export function IntegrationsSection() {
  return (
    <div className="space-y-7">
      {HOSTS.map((host) => (
        <SettingRow key={host.id} label={host.label}>
          <HostCard host={host} />
        </SettingRow>
      ))}
    </div>
  );
}
