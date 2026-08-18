import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as pickDirectory } from '@tauri-apps/plugin-dialog';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Progress } from '@/shared/ui/progress';
import { Icon, type IconName } from '@/shared/ui/icons';
import * as ipc from '@/shared/api/ipc';
import { NavItem } from '@/shared/ui/parts';
import { directoryFromUrl } from '@/shared/lib/paths';
import { notifyCloned, notifyError, notifyRepoCreated } from '@/shared/ui/toast';

import { readPref } from '@/shared/lib/prefs';
import { SETTINGS } from '@/shared/config/settingsModel';

import { HostCard } from '@/widgets/HostConnect';
import { HOSTS, repoName } from '@/entities/repo';
import { mergeNamespaces, namespacesKnownUpFront } from '@/entities/hosts';
import { noteHostError, useConnections, useHostRejected } from '@/features/hosts';
import type { CloneStepView, RepoListingView, TemplateCatalogView } from '@/shared/api/types';
import { RepoPicker } from './RepoPicker';
import { TemplatePick } from './TemplatePick';
import { Row } from './Row';
const STAGES = [
  'progress.counting',
  'progress.compressing',
  'progress.writing',
  'progress.receiving',
  'progress.resolving',
  'progress.updating',
] as const;

const knownStage = (stage: string) => STAGES.find((known) => known === stage);

const URL_TAB: { key: string; label: string; icon: IconName } = {
  key: 'url',
  label: 'repoDialog.withUrl',
  icon: 'web',
};

type Props = {
  open: boolean;
  mode: 'clone' | 'init';
  url: string;
  onOpenChange: (open: boolean) => void;
  onCloned: (path: string) => void;
};

export function RepoDialog({ open, mode, url, onOpenChange, onCloned }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('url');
  const [address, setAddress] = useState(url);
  const [parent, setParent] = useState('');
  const [name, setName] = useState(directoryFromUrl(url));
  const [shallow, setShallow] = useState(false);
  const [step, setStep] = useState<CloneStepView | null>(null);
  const [repos, setRepos] = useState<RepoListingView[]>([]);
  const [picked, setPicked] = useState<RepoListingView | null>(null);
  const [branch, setBranch] = useState('');
  const [gitignore, setGitignore] = useState('');
  const [license, setLicense] = useState('');
  const [catalog, setCatalog] = useState<TemplateCatalogView | null>(null);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [cloneAfter, setCloneAfter] = useState(true);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespace, setNamespace] = useState('');

  useEffect(() => {
    if (!open || mode !== 'init') return;
    let alive = true;
    ipc
      .templateCatalog()
      .then((found) => alive && setCatalog(found))
      .catch(() => alive && setCatalog({ gitignores: [], licenses: [] }));
    return () => {
      alive = false;
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    setTab(mode === 'init' ? 'local' : 'url');
    setBranch('');
    setGitignore('');
    setLicense('');
    setCreating(false);
    setDescription('');
    setIsPrivate(false);
    setCloneAfter(true);
    setAddress(url);
    setName(directoryFromUrl(url));
    setShallow(false);
    setStep(null);
    setPicked(null);
    ipc.defaultCloneDir().then(setParent).catch(notifyError);
  }, [open, url, mode]);

  const links = useConnections();
  const rejected = useHostRejected(tab);
  const hostTab = HOSTS.find((h) => h.id === tab) ?? null;
  const connection = rejected ? null : (links.find((c) => c.id === tab) ?? null);

  useEffect(() => {
    setPicked(null);
    setRepos([]);
    const upFront = namespacesKnownUpFront(connection);
    setNamespaces(upFront);
    setNamespace(upFront[0] ?? '');
    if (!connection) return;
    let alive = true;
    if (mode === 'clone') {
      ipc
        .hostRepos(connection.id, false)
        .then((found) => alive && setRepos(found))
        .catch((error: unknown) => {
          noteHostError(connection.id, error);
          notifyError(error);
        });
    } else {
      ipc
        .hostNamespaces(connection.id)
        .then((found) => {
          if (!alive) return;
          setNamespaces(mergeNamespaces(upFront, found));
        })
        .catch((error: unknown) => {
          noteHostError(connection.id, error);
          notifyError(error);
        });
    }
    return () => {
      alive = false;
    };
  }, [connection, mode]);

  const running = step !== null || creating;
  const cloningUrl = tab === 'url' ? address.trim() : (picked?.cloneUrl ?? '');

  const create = () => {
    if (!name.trim() || !parent) return;
    setCreating(true);
    const fallback = readPref<string>(SETTINGS.initBranch, '').trim();
    const wanted = branch.trim() || fallback;
    ipc
      .initRepo(`${parent}/${name.trim()}`, wanted || null, gitignore || null, license || null)
      .then((path) => {
        onOpenChange(false);
        notifyRepoCreated(repoName(path));
        onCloned(path);
      })
      .catch(notifyError)
      .finally(() => setCreating(false));
  };

  const createRemote = () => {
    if (!connection || !name.trim() || !namespace) return;
    setCreating(true);
    const fallback = readPref<string>(SETTINGS.initBranch, '').trim();
    const wanted = branch.trim() || fallback;
    ipc
      .hostCreateRepo(connection.id, namespace, name.trim(), description.trim(), isPrivate)
      .then(async (created) => {
        if (!cloneAfter) {
          onOpenChange(false);
          notifyRepoCreated(name.trim());
          return;
        }
        const folder = name.trim();
        setStep({ stage: 'progress.counting', percent: 0, overall: 0 });
        const path = await ipc.cloneRepo(created.cloneUrl, parent, folder, false, setStep);
        await ipc.seedRepo(path, wanted || null, gitignore || null, license || null, true);
        onOpenChange(false);
        notifyCloned(repoName(path));
        onCloned(path);
      })
      .catch(notifyError)
      .finally(() => {
        setCreating(false);
        setStep(null);
      });
  };

  const start = () => {
    if (!cloningUrl || !parent || !name.trim()) return;
    setStep({ stage: 'progress.counting', percent: 0, overall: 0 });
    ipc
      .cloneRepo(cloningUrl, parent, name.trim(), shallow, setStep)
      .then((path) => {
        onOpenChange(false);
        notifyCloned(repoName(path));
        onCloned(path);
      })
      .catch(notifyError)
      .finally(() => setStep(null));
  };

  const browse = () => {
    pickDirectory({ directory: true, defaultPath: parent })
      .then((chosen) => typeof chosen === 'string' && setParent(chosen))
      .catch(notifyError);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="flex h-160 max-h-dvh gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <aside className="bg-fill-1 flex w-52 shrink-0 flex-col gap-px border-r p-2">
          <NavItem
            icon={mode === 'init' ? 'folder' : URL_TAB.icon}
            label={
              mode === 'init' ? t('repoDialog.localOnly') : t(URL_TAB.label as 'repoDialog.withUrl')
            }
            active={tab === (mode === 'init' ? 'local' : 'url')}
            onClick={() => setTab(mode === 'init' ? 'local' : 'url')}
          />
          {HOSTS.map((host) => (
            <NavItem
              key={host.id}
              icon={host.icon}
              label={host.label}
              active={tab === host.id}
              onClick={() => setTab(host.id)}
            />
          ))}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5 p-6">
          <DialogTitle className="text-base font-semibold">
            {mode === 'init' ? t('repoDialog.initTitle') : t('repoDialog.clone')}
          </DialogTitle>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {hostTab && !connection ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <HostCard host={hostTab} />
              </div>
            ) : mode === 'init' ? (
              <div className="space-y-4">
                {tab !== 'local' ? (
                  <>
                    <Row label={t('repoDialog.account')}>
                      <TemplatePick
                        value={namespace}
                        choices={namespaces.map((n) => ({ key: n, label: n }))}
                        onPick={setNamespace}
                        ariaLabel={t('repoDialog.account')}
                      />
                    </Row>
                  </>
                ) : null}
                <Row label={t('repoDialog.name')}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={running}
                    className="h-8 text-xs"
                    aria-label={t('repoDialog.name')}
                  />
                </Row>
                {tab !== 'local' ? (
                  <>
                    <Row label={t('repoDialog.description')}>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={running}
                        className="h-8 text-xs"
                        aria-label={t('repoDialog.description')}
                      />
                    </Row>
                    <Row label={t('repoDialog.access')}>
                      <TemplatePick
                        value={isPrivate ? 'private' : 'public'}
                        choices={[
                          { key: 'public', label: t('repoDialog.public') },
                          { key: 'private', label: t('repoDialog.private') },
                        ]}
                        onPick={(key) => setIsPrivate(key === 'private')}
                        ariaLabel={t('repoDialog.access')}
                      />
                    </Row>
                    <Row label={t('repoDialog.cloneAfter')}>
                      <Checkbox
                        checked={cloneAfter}
                        onCheckedChange={(next) => setCloneAfter(next === true)}
                        disabled={running}
                        aria-label={t('repoDialog.cloneAfter')}
                      />
                    </Row>
                  </>
                ) : null}
                <Row label={tab === 'local' ? t('repoDialog.initIn') : t('repoDialog.where')}>
                  <div className="flex w-full gap-2">
                    <Input
                      value={parent}
                      onChange={(e) => setParent(e.target.value)}
                      disabled={running}
                      className="h-8 min-w-0 flex-1 text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={browse}
                      disabled={running}
                      className="shrink-0"
                    >
                      {t('clone.browse')}
                    </Button>
                  </div>
                </Row>
                <Row label={t('repoDialog.fullPath')}>
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    {parent}/{name.trim()}
                  </span>
                </Row>
                <Row label={t('repoDialog.branch')}>
                  <Input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder={readPref<string>(SETTINGS.initBranch, '').trim() || 'main'}
                    disabled={running}
                    className="h-8 w-64 text-xs"
                    aria-label={t('repoDialog.branch')}
                  />
                </Row>
                <Row label={t('repoDialog.gitignore')}>
                  <TemplatePick
                    value={gitignore}
                    choices={(catalog?.gitignores ?? []).map((n) => ({ key: n, label: n }))}
                    onPick={setGitignore}
                    ariaLabel={t('repoDialog.gitignore')}
                  />
                </Row>
                <Row label={t('repoDialog.license')}>
                  <TemplatePick
                    value={license}
                    choices={(catalog?.licenses ?? []).map((l) => ({ key: l.key, label: l.name }))}
                    onPick={setLicense}
                    ariaLabel={t('repoDialog.license')}
                  />
                </Row>
              </div>
            ) : (
              <div className="space-y-4">
                <Row label={t('repoDialog.where')}>
                  <div className="flex w-full gap-2">
                    <Input
                      value={parent}
                      onChange={(e) => setParent(e.target.value)}
                      disabled={running}
                      className="h-8 min-w-0 flex-1 text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={browse}
                      disabled={running}
                      className="shrink-0"
                    >
                      {t('clone.browse')}
                    </Button>
                  </div>
                </Row>

                {tab === 'url' ? (
                  <Row label="URL">
                    <Input
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        setName(directoryFromUrl(e.target.value));
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && start()}
                      placeholder="https://github.com/owner/repo.git"
                      disabled={running}
                      className="h-8 text-xs"
                    />
                  </Row>
                ) : (
                  <Row label={t('repoDialog.pick')}>
                    <RepoPicker
                      repos={repos}
                      chosen={picked}
                      onPick={(repo) => {
                        setPicked(repo);
                        if (repo) setName(repo.fullName.split('/')[1] ?? '');
                      }}
                    />
                  </Row>
                )}

                <Row label={t('repoDialog.fullPath')}>
                  <div className="flex w-full min-w-0 items-center gap-1.5">
                    <span className="text-muted-foreground shrink truncate font-mono text-xs">
                      {parent}/
                    </span>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={running}
                      placeholder={t('clone.directory')}
                      className="h-8 w-56 text-xs"
                    />
                  </div>
                </Row>

                <Row label={t('repoDialog.shallow')}>
                  <Checkbox
                    checked={shallow}
                    onCheckedChange={(next) => setShallow(next === true)}
                    disabled={running}
                    aria-label={t('repoDialog.shallow')}
                  />
                </Row>
              </div>
            )}
          </div>

          <div className="shrink-0">
            {step ? (
              <div className="space-y-2">
                <Progress value={step.overall} />
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span>{knownStage(step.stage) ? t(knownStage(step.stage)!) : ''}</span>
                  <span className="tabular-nums">{step.overall}%</span>
                </div>
              </div>
            ) : hostTab && !connection ? null : mode === 'init' ? (
              <div className="flex justify-end">
                <Button
                  onClick={tab === 'local' ? create : createRemote}
                  disabled={running || !name.trim() || (tab !== 'local' && !namespace)}
                >
                  <Icon.add className="size-3.5" />
                  {tab === 'local' ? t('repoDialog.create') : t('repoDialog.createAndClone')}
                </Button>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button onClick={start} disabled={!cloningUrl || !name.trim()}>
                  <Icon.clone className="size-3.5" />
                  {t('repoDialog.clone')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
