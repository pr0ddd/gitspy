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
import { HOVER_FILL, NavItem } from '@/shared/ui/parts';
import { directoryFromUrl } from '@/shared/lib/paths';
import { notifyError } from '@/shared/ui/toast';
import { cn } from '@/shared/lib/utils';
import { GIT } from '@/shared/config/vocabulary';
import { readPref } from '@/shared/lib/prefs';
import { SETTINGS } from '@/shared/config/settingsModel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { HOSTS, HostCard } from '@/widgets/HostConnect';
import type {
  CloneStepView,
  ConnectionView,
  RepoListingView,
  TemplateCatalogView,
} from '@/shared/api/types';

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

function ownerOf(fullName: string): string {
  return fullName.split('/')[0] ?? '';
}

function RepoPicker({
  repos,
  chosen,
  onPick,
}: {
  repos: RepoListingView[];
  chosen: RepoListingView | null;
  onPick: (repo: RepoListingView | null) => void;
}) {
  const { t } = useTranslation();
  const [needle, setNeedle] = useState('');

  const shown = needle.trim()
    ? repos.filter((repo) => repo.fullName.toLowerCase().includes(needle.trim().toLowerCase()))
    : repos;
  const owners = [...new Set(shown.map((repo) => ownerOf(repo.fullName)))];

  if (chosen) {
    return (
      <div className="border-input flex h-8 w-full items-center gap-2 rounded-md border px-3 text-xs">
        {chosen.private ? (
          <Icon.private className="text-faint size-3 shrink-0" />
        ) : (
          <Icon.web className="text-faint size-3 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{chosen.fullName}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onPick(null)}
          aria-label={t('repoDialog.clearPick')}
        >
          <Icon.close className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      <Input
        value={needle}
        onChange={(e) => setNeedle(e.target.value)}
        placeholder={t('repoDialog.searchRemotes')}
        className="h-8 text-xs"
      />
      <div className="h-72 overflow-y-auto rounded-md border">
        {owners.map((owner) => (
          <div key={owner}>
            <div className="text-faint text-2xs sticky top-0 flex h-6 items-center bg-card px-3 tracking-wide uppercase">
              {owner}
            </div>
            {shown
              .filter((repo) => ownerOf(repo.fullName) === owner)
              .map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => onPick(repo)}
                  className={cn(
                    HOVER_FILL,
                    'flex h-8 w-full items-center gap-2 px-3 text-left text-xs',
                  )}
                >
                  {repo.private ? (
                    <Icon.private className="text-faint size-3 shrink-0" />
                  ) : (
                    <Icon.web className="text-faint size-3 shrink-0" />
                  )}
                  <span className="truncate">{repo.fullName}</span>
                </button>
              ))}
          </div>
        ))}
        {shown.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            {t('repoDialog.noRepos')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  mode: 'clone' | 'init';
  url: string;
  onOpenChange: (open: boolean) => void;
  onCloned: (path: string) => void;
};

function TemplatePick({
  value,
  choices,
  onPick,
  ariaLabel,
}: {
  value: string;
  choices: ReadonlyArray<{ key: string; label: string }>;
  onPick: (key: string) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const chosen = choices.find((c) => c.key === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-64 justify-between font-normal"
          aria-label={ariaLabel}
        >
          <span className="truncate">{chosen ? chosen.label : t('repoDialog.none')}</span>
          <Icon.chevron className="size-3 rotate-90 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onPick}>
          <DropdownMenuRadioItem value="">{t('repoDialog.none')}</DropdownMenuRadioItem>
          {choices.map((choice) => (
            <DropdownMenuRadioItem key={choice.key} value={choice.key}>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-x-4">
      <span className="text-muted-foreground flex min-h-8 items-center justify-end text-right text-sm">
        {label}
      </span>
      <div className="flex min-h-8 min-w-0 items-center">{children}</div>
    </div>
  );
}

export function RepoDialog({ open, mode, url, onOpenChange, onCloned }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('url');
  const [address, setAddress] = useState(url);
  const [parent, setParent] = useState('');
  const [name, setName] = useState(directoryFromUrl(url));
  const [shallow, setShallow] = useState(false);
  const [step, setStep] = useState<CloneStepView | null>(null);
  const [links, setLinks] = useState<ConnectionView[]>([]);
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
    const pull = () =>
      ipc
        .connections()
        .then(setLinks)
        .catch(() => undefined);
    void pull();
    const stop = ipc.onHostConnected(() => void pull());
    return () => void stop.then((off) => off());
  }, [open, url, mode]);

  const connection = links.find((c) => c.id === tab) ?? null;

  useEffect(() => {
    setPicked(null);
    setRepos([]);
    setNamespaces([]);
    setNamespace('');
    if (!connection) return;
    let alive = true;
    if (mode === 'clone') {
      ipc
        .hostRepos(connection.id, false)
        .then((found) => alive && setRepos(found))
        .catch(notifyError);
    } else {
      ipc
        .hostNamespaces(connection.id)
        .then((found) => {
          if (!alive) return;
          setNamespaces(found);
          setNamespace(found[0] ?? '');
        })
        .catch(notifyError);
    }
    return () => {
      alive = false;
    };
  }, [connection?.id, mode]);

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
          return;
        }
        const folder = name.trim();
        setStep({ stage: 'progress.counting', percent: 0, overall: 0 });
        const path = await ipc.cloneRepo(created.cloneUrl, parent, folder, false, setStep);
        await ipc.seedRepo(path, wanted || null, gitignore || null, license || null, true);
        onOpenChange(false);
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
      <DialogContent className="flex h-140 gap-0 overflow-hidden p-0 sm:max-w-4xl">
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
            {mode === 'init' ? t('repoDialog.initTitle') : GIT.clone}
          </DialogTitle>

          {mode === 'init' && tab !== 'local' && !connection ? (
            <div className="flex flex-1 flex-col justify-center gap-3">
              <p className="text-muted-foreground text-sm">{t('settings.connectHint')}</p>
              <div>
                <HostCard
                  host={HOSTS.find((h) => h.id === tab)!}
                  seeded={null}
                  onDisconnected={() => undefined}
                />
              </div>
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
          ) : tab !== 'url' && !connection ? (
            <div className="flex flex-1 flex-col justify-center gap-3">
              <p className="text-muted-foreground text-sm">{t('settings.connectHint')}</p>
              <div>
                <HostCard
                  host={HOSTS.find((h) => h.id === tab)!}
                  seeded={null}
                  onDisconnected={() => undefined}
                />
              </div>
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

          <div className="mt-auto">
            {step ? (
              <div className="space-y-2">
                <Progress value={step.overall} />
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span>{knownStage(step.stage) ? t(knownStage(step.stage)!) : ''}</span>
                  <span className="tabular-nums">{step.overall}%</span>
                </div>
              </div>
            ) : mode === 'init' ? (
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
                  {GIT.clone}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
