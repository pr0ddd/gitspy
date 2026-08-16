// Custom ESLint rule: enforces FSD layer direction inside src/.
// Ranks, low -> high: foundation(0) entity(1) feature(2) widget(3) app(4).
// A file may import a STRICTLY lower rank or its own slice (same
// entities/<x> / features/<x> directory). Sideways (feature -> feature,
// entity -> entity across slices) and upward imports are errors.
// Widgets are the skeleton and compose one another; app is the top —
// same-layer imports are legal there.
//
// Classification by path under src/:
//   entities/<slice>/** -> entity   features/<slice>/** -> feature
//   widgets/**          -> widget   app/**              -> app
//   everything else under src/ (root files, components/ui, generated,
//   locales) -> foundation (rank 0).

const path = require('path');

const RANK = { foundation: 0, entity: 1, feature: 2, widget: 3, app: 4 };

function srcRelative(absPath) {
  const norm = absPath.split(path.sep).join('/');
  const at = norm.lastIndexOf('/src/');
  if (at === -1) return null;
  return norm.slice(at + '/src/'.length);
}

function classify(rel) {
  if (!rel) return null;
  const [top, slice] = rel.split('/');
  if (top === 'entities') return { layer: 'entity', slice: slice ?? null };
  if (top === 'features') return { layer: 'feature', slice: slice ?? null };
  if (top === 'widgets') return { layer: 'widget', slice: null };
  if (top === 'app') return { layer: 'app', slice: null };
  return { layer: 'foundation', slice: null };
}

function resolveImport(fromAbs, spec, srcRoot) {
  if (spec.startsWith('@/')) return `${srcRoot}/${spec.slice(2)}`;
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromAbs), spec);
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'imports flow strictly down the FSD layers' },
    schema: [],
    messages: {
      upward:
        '{{fromLayer}} "{{from}}" must not import {{toLayer}} "{{to}}": imports flow strictly down (foundation < entity < feature < widget < app)',
      sideways:
        'slice "{{from}}" must not import sibling slice "{{to}}": cross-slice reuse goes through a lower layer',
    },
  },
  create(context) {
    const fromAbs = context.filename;
    const rel = srcRelative(fromAbs);
    const from = classify(rel);
    if (!from) return {};
    const srcRoot = fromAbs
      .split(path.sep)
      .join('/')
      .slice(0, fromAbs.split(path.sep).join('/').lastIndexOf('/src/') + 4);

    const check = (node, spec) => {
      const targetAbs = resolveImport(fromAbs, spec, srcRoot);
      if (!targetAbs) return;
      const targetRel = srcRelative(targetAbs);
      if (!targetRel) return;
      const to = classify(targetRel);
      if (!to) return;

      const sameSlice = from.layer === to.layer && from.slice !== null && from.slice === to.slice;
      if (sameSlice) return;

      if (RANK[to.layer] > RANK[from.layer]) {
        context.report({
          node,
          messageId: 'upward',
          data: { fromLayer: from.layer, from: rel, toLayer: to.layer, to: targetRel },
        });
        return;
      }
      if (
        RANK[to.layer] === RANK[from.layer] &&
        (from.layer === 'entity' || from.layer === 'feature')
      ) {
        context.report({
          node,
          messageId: 'sideways',
          data: { from: rel, to: targetRel },
        });
      }
    };

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
    };
  },
};
