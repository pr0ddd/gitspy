// Проверка правила направлений: законные импорты вниз проходят,
// вбок и вверх — падают. Запуск: node --test eslint-rules/*.test.mjs

import { test } from 'node:test';
import { RuleTester } from 'eslint';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./fsd-boundaries.cjs');

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

test('направление импортов охраняется', () => {
  tester.run('fsd-boundaries', rule, {
    valid: [
      {
        filename: '/repo/src/widgets/GraphView.tsx',
        code: "import { scene } from '@/entities/graph';",
      },
      {
        filename: '/repo/src/features/repo/repoActions.ts',
        code: "import { session } from '@/entities/repo';",
      },
      {
        filename: '/repo/src/entities/graph/render.ts',
        code: "import { laneColour } from '@/theme';",
      },
      {
        filename: '/repo/src/entities/graph/render.ts',
        code: "import { scene } from './scene';",
      },
      {
        filename: '/repo/src/app/App.tsx',
        code: "import { GraphView } from '@/widgets/GraphView';",
      },
      {
        filename: '/repo/src/widgets/DiffView.tsx',
        code: "import { DiffToolbar } from './DiffToolbar';",
      },
    ],
    invalid: [
      {
        filename: '/repo/src/entities/graph/scene.ts',
        code: "import { GraphView } from '@/widgets/GraphView';",
        errors: [{ messageId: 'upward' }],
      },
      {
        filename: '/repo/src/features/search/search.ts',
        code: "import { useReadyUpdate } from '@/features/updater';",
        errors: [{ messageId: 'sideways' }],
      },
      {
        filename: '/repo/src/entities/repo/session.ts',
        code: "import { chips } from '@/entities/graph';",
        errors: [{ messageId: 'sideways' }],
      },
      {
        filename: '/repo/src/ipc.ts',
        code: "import { session } from '@/entities/repo';",
        errors: [{ messageId: 'upward' }],
      },
    ],
  });
});
