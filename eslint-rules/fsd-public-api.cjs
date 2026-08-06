// Custom ESLint rule: cross-slice imports of entities/* and features/*
// must target the slice ROOT ('@/entities/graph'), never a deep module
// ('@/entities/graph/scene'). A slice may restructure its internals
// without breaking consumers. `import type` is exempt: erased at compile
// time, and routing types through fat barrels risks type-import cycles.
// Autofix rewrites the deep path to the slice root.

const path = require('path');

function srcRelative(absPath) {
  const norm = absPath.split(path.sep).join('/');
  const at = norm.lastIndexOf('/src/');
  if (at === -1) return null;
  return norm.slice(at + '/src/'.length);
}

function sliceOf(rel) {
  if (!rel) return null;
  const [top, slice] = rel.split('/');
  if ((top === 'entities' || top === 'features') && slice) return `${top}/${slice}`;
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: { description: 'cross-slice imports go through the slice facade' },
    schema: [],
    messages: {
      deep: 'import the facade "@/{{slice}}" instead of its internals "{{spec}}"',
    },
  },
  create(context) {
    const fromRel = srcRelative(context.filename);
    const fromSlice = sliceOf(fromRel);

    const check = (node) => {
      if (!node.source) return;
      if (node.importKind === 'type' || node.exportKind === 'type') return;
      const spec = node.source.value;
      if (!spec.startsWith('@/')) return;
      const target = spec.slice(2);
      const targetSlice = sliceOf(target);
      if (!targetSlice) return;
      if (targetSlice === fromSlice) return;
      if (target === targetSlice) return;
      context.report({
        node,
        messageId: 'deep',
        data: { slice: targetSlice, spec },
        fix: (fixer) => fixer.replaceText(node.source, `'@/${targetSlice}'`),
      });
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
