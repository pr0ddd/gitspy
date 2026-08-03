import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import type { MenuAction, MenuItem as Item, MenuSection } from './menuItems';

type NativeEntry = MenuItem | PredefinedMenuItem | Submenu;

const nativeItem = async (
  item: Item,
  label: (key: string, params?: Record<string, string>) => string,
  onAction: (action: MenuAction) => void,
): Promise<NativeEntry> => {
  if (item.children) {
    const children: NativeEntry[] = [];
    for (const child of item.children) {
      children.push(await nativeItem(child, label, onAction));
    }
    return Submenu.new({ text: label(item.label, item.params), items: children });
  }
  return MenuItem.new({
    id: item.id,
    text: label(item.label, item.params),
    action: () => {
      if (item.action) onAction(item.action);
    },
  });
};

export async function showNativeMenu(
  sections: MenuSection[],
  label: (key: string, params?: Record<string, string>) => string,
  onAction: (action: MenuAction) => void,
): Promise<void> {
  const items: NativeEntry[] = [];
  for (const [at, section] of sections.entries()) {
    if (at > 0) items.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    for (const item of section) {
      items.push(await nativeItem(item, label, onAction));
    }
  }
  const menu = await Menu.new({ items });
  await menu.popup();
}
