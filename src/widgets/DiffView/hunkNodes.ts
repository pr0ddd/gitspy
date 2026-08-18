export const HUNK_BAR_HEIGHT = 44;

export const hunkBarNode = (): HTMLDivElement => {
  const node = document.createElement('div');
  node.style.pointerEvents = 'auto';
  node.style.zIndex = '10';
  return node;
};

export const hunkMarginNode = (): HTMLDivElement => {
  const node = document.createElement('div');
  node.className = 'border-border h-full w-full border-b';
  return node;
};
