import { defaultModes, isModeList, type Mode } from '../domain/modes.ts';
import { isCommandList, type UserCommand } from '../domain/commands.ts';

export const STORAGE_KEY = 'assistent1.settings.v1';
export interface Settings { modes: Mode[]; compactHints: boolean; commands: UserCommand[] }
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function freshSettings(): Settings {
  return { modes: structuredClone(defaultModes), compactHints: true, commands: [] };
}
export function loadSettings(storage: StoragePort): { settings: Settings; warning?: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { settings: freshSettings() };
    const data = JSON.parse(raw);
    if (![1, 2].includes(data.version) || !isModeList(data.modes) || typeof data.compactHints !== 'boolean'
      || (data.version === 2 && !isCommandList(data.commands))) throw new Error('Invalid settings');
    return { settings: { modes: data.modes, compactHints: data.compactHints, commands: data.version === 1 ? [] : data.commands } };
  } catch {
    return { settings: freshSettings(), warning: 'Не удалось прочитать настройки. Загружены примеры; исходные данные не перезаписаны.' };
  }
}
export function saveSettings(storage: StoragePort, settings: Settings): void {
  if (!isModeList(settings.modes) || !isCommandList(settings.commands) || typeof settings.compactHints !== 'boolean') throw new Error('Некорректные настройки');
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...settings }));
}
