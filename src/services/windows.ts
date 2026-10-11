import { isTauri, invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
export const desktop = isTauri();
export async function showPalette(): Promise<void> {
  if (desktop) await invoke('show_palette');
  else window.open('/?window=palette', 'assistent1-palette', 'width=560,height=520');
}
export async function showMain(page?: string): Promise<void> {
  if (desktop) await invoke('show_main', { page: page ?? null });
  else { window.open(page ? `/?page=${page}` : '/', 'assistent1-main'); }
}
export async function hidePalette(): Promise<void> {
  if (desktop) await getCurrentWindow().hide();
  else window.close();
}
