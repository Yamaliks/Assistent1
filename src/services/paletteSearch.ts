import { applicationName } from '../domain/applications.ts';
import { normalizeCommand } from '../domain/commands.ts';
import type { Settings } from './settingsStorage.ts';
export interface PaletteItem { id: string; kind: 'mode' | 'command' | 'application' | 'site'; name: string; phrase: string }
export function searchPalette(settings: Settings, query: string): PaletteItem[] {
  const items: PaletteItem[] = [
    ...settings.modes.map(mode => ({ id: mode.id, kind: 'mode' as const, name: mode.name, phrase: mode.phrase })),
    ...settings.commands.map(command => ({ id: command.id, kind: 'command' as const, name: command.name, phrase: command.phrase })),
    ...settings.applications.map(app => ({ id: app.id, kind: 'application' as const, name: applicationName(app), phrase: '' })),
    ...settings.sites.map(site => ({ id: site.id, kind: 'site' as const, name: site.name, phrase: '' })),
  ];
  return items.filter(item => normalizeCommand(`${item.name} ${item.phrase}`).includes(normalizeCommand(query)));
}
