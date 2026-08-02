import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import * as ipc from '../ipc';
import { languageOf, monaco, setUpMonaco, THEME } from '../monaco';
import { notifyError } from '../toast';
import { Icon } from '../icons';
import type { ChangedFileView } from '../types';

type Props = {
  repo: string;
  commit: string;
  file: ChangedFileView;
  onClose: () => void;
};

export function DiffView({ repo, commit, file, onClose }: Props) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [inline, setInline] = useState(false);

  useEffect(() => {
    setUpMonaco();
    const element = host.current;
    if (!element) return;

    const created = monaco.editor.createDiffEditor(element, {
      theme: THEME,
      readOnly: true,
      renderSideBySide: !inline,
      automaticLayout: true,
      fontSize: 12,
      lineHeight: 18,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
    });
    editor.current = created;

    return () => {
      created.getModel()?.original.dispose();
      created.getModel()?.modified.dispose();
      created.dispose();
      editor.current = null;
    };
  }, [inline]);

  useEffect(() => {
    let cancelled = false;

    ipc
      .diffSides(repo, commit, file.path, file.oldPath ?? null)
      .then((sides) => {
        if (cancelled || !editor.current) return;
        const language = languageOf(file.path);
        const previous = editor.current.getModel();
        editor.current.setModel({
          original: monaco.editor.createModel(sides.before, language),
          modified: monaco.editor.createModel(sides.after, language),
        });
        previous?.original.dispose();
        previous?.modified.dispose();
      })
      .catch(notifyError);

    return () => {
      cancelled = true;
    };
  }, [repo, commit, file.path, file.oldPath]);

  return (
    <div className="bg-surface flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="bg-card border-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground truncate font-mono text-xs">
          {file.oldPath ? `${file.oldPath} → ` : ''}
          {file.path}
        </span>

        <div className="border-input ml-4 flex h-6 shrink-0 items-center overflow-hidden rounded-md border">
          <Button
            variant={inline ? 'ghost' : 'default'}
            size="sm"
            className="h-full rounded-none px-2 text-xs"
            onClick={() => setInline(false)}
          >
            {t('diff.sideBySide')}
          </Button>
          <Button
            variant={inline ? 'default' : 'ghost'}
            size="sm"
            className="h-full rounded-none px-2 text-xs"
            onClick={() => setInline(true)}
          >
            {t('diff.inline')}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 shrink-0"
          onClick={onClose}
          title={t('diff.close')}
        >
          <Icon.close className="size-3.5" />
        </Button>
      </header>

      {file.binary ? (
        <p className="text-muted-foreground p-6 text-center">{t('diff.binary')}</p>
      ) : (
        <div ref={host} className="min-h-0 flex-1" />
      )}
    </div>
  );
}
