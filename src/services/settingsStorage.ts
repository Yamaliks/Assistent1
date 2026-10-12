import { defaultModes, isModeList, type Mode } from '../domain/modes.ts';
import { isCommandList, type UserCommand } from '../domain/commands.ts';
import { applicationName, defaultApplications, isApplicationList, type ApplicationConfig } from '../domain/applications.ts';

export const STORAGE_KEY = 'assistent1.settings.v1';
export interface Settings { modes: Mode[]; compactHints: boolean; commands: UserCommand[]; applications: ApplicationConfig[] }
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function freshSettings(): Settings {
  return { modes: structuredClone(defaultModes), compactHints: true, commands: [], applications: defaultApplications() };
}
export function loadSettings(storage: StoragePort): { settings: Settings; warning?: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { settings: freshSettings() };
    const data = JSON.parse(raw);
    if (![1, 2, 3].includes(data.version) || !isModeList(data.modes) || typeof data.compactHints !== 'boolean'
      || (data.version >= 2 && !isCommandList(data.commands))
      || (data.applications !== undefined && !isApplicationList(data.applications))) throw new Error('Invalid settings');
    const settings: Settings = { modes: data.modes, compactHints: data.compactHints, commands: data.version === 1 ? [] : data.commands, applications: data.applications ?? defaultApplications() };
    migrateProgramActions(settings);
    if (!validReferences(settings) || !isApplicationList(settings.applications)) throw new Error('Invalid references');
    return { settings };
  } catch {
    return { settings: freshSettings(), warning: 'Не удалось прочитать настройки. Загружены примеры; исходные данные не перезаписаны.' };
  }
}
export function saveSettings(storage: StoragePort, settings: Settings): void {
  if (!isModeList(settings.modes) || !isCommandList(settings.commands) || !isApplicationList(settings.applications) || !validReferences(settings) || typeof settings.compactHints !== 'boolean') throw new Error('Некорректные настройки');
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, ...settings }));
}

function validReferences(settings: Settings): boolean {
  return settings.modes.every(mode => mode.actions.every(action =>
    action.kind === 'application' ? settings.applications.some(app => app.id === action.applicationId)
      : action.kind === 'command' ? settings.commands.some(command => command.id === action.commandId) : true));
}
// Older inline program paths are moved once into the existing application manager.
function migrateProgramActions(settings: Settings): void {
  settings.modes = settings.modes.map(mode => ({ ...mode, actions: mode.actions.map(action => {
    if (action.kind !== 'program') return action;
    let app = settings.applications.find(app => action.path ? app.path === action.path : applicationName(app).toLocaleLowerCase() === action.label.toLocaleLowerCase());
    if (!app) {
      let id = `legacy:${mode.id}:${action.id}`;
      while (settings.applications.some(item => item.id === id)) id += ':app';
      app = { id, name: action.label.trim().slice(0, 48) || 'Приложение', path: action.path, useDefaultBrowser: false };
      settings.applications.push(app);
    }
    return { id: action.id, kind: 'application' as const, label: action.label, active: action.active, applicationId: app.id };
  }) }));
}
