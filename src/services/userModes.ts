import type { Mode, ModeIcon } from '../domain/modes.ts';
import { libraryModeTemplate } from '../domain/sites.ts';
import { normalizeCommand } from '../domain/commands.ts';
import type { Settings } from './settingsStorage.ts';
export function createUserMode(settings: Settings, name: string, icon: ModeIcon, template: ModeIcon | 'empty', id: string): Settings {
  name = name.trim();
  if (!name || name.length > 48) throw new Error('Укажите название режима до 48 символов.');
  if (settings.modes.some(mode => mode.id === id || normalizeCommand(mode.name) === normalizeCommand(name))) throw new Error('Такой режим уже есть. Выберите другое название.');
  const contents = template === 'empty' ? { actions: [], sites: settings.sites } : libraryModeTemplate(template, id, settings.applications, settings.sites);
  const mode: Mode = { id, name, icon, template, description: '', phrase: '', actions: contents.actions };
  return { ...settings, sites: contents.sites, modes: [...settings.modes, mode] };
}
export function deleteUserMode(settings: Settings, id: string): Settings {
  return { ...settings, modes: settings.modes.filter(mode => mode.id !== id) };
}
