import { test } from 'node:test';
import { RuleTester } from 'eslint';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./fsd-public-api.cjs');

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: {} },
  },
});

test('slice facades are guarded', () => {
  tester.run('fsd-public-api', rule, {
    valid: [
      {
        filename: '/repo/src/widgets/GraphView.tsx',
        code: "import { drawFrame } from '@/entities/graph';",
      },
      {
        filename: '/repo/src/entities/graph/render.ts',
        code: "import { visible } from '@/entities/graph/scene';",
      },
      {
        filename: '/repo/src/widgets/Toolbar.tsx',
        code: "import { laneColour } from '@/theme';",
      },
    ],
    invalid: [
      {
        filename: '/repo/src/widgets/GraphView.tsx',
        code: "import { drawFrame } from '@/entities/graph/render';",
        output: "import { drawFrame } from '@/entities/graph';",
        errors: [{ messageId: 'deep' }],
      },
      {
        filename: '/repo/src/app/App.tsx',
        code: "import { useOperations } from '@/features/repo/repoActions';",
        output: "import { useOperations } from '@/features/repo';",
        errors: [{ messageId: 'deep' }],
      },
    ],
  });
});
