import type { Mode } from '../domain/modes.ts';
import { applicationName } from '../domain/applications.ts';
import { normalizeExe } from './libraryEditing.ts';
import type { Settings } from './settingsStorage.ts';
export interface CloseTarget { id: string; name: string; path: string }
export interface CloseCandidate { id: string; name: string; windows: number }
export interface ClosePlan { token: string; candidates: CloseCandidate[]; warnings: string[]; previousName?: string; nextName?: string }
export interface SwitchSnapshot { mode: Mode; settings: Settings }
// A remembered mode is only a source of targets, never proof of running processes.
export function modePrograms({ mode, settings }: SwitchSnapshot): CloseTarget[] {
  const browsers = settings.applications.filter(app => app.id === 'browser' || app.useDefaultBrowser).map(app => normalizeExe(app.path));
  const result: CloseTarget[] = [];
  for (const action of mode.actions) {
    if (action.active === false) continue;
    let item: CloseTarget | undefined;
    if (action.kind === 'application') {
      const app = settings.applications.find(app => app.id === action.applicationId);
      if (app && app.id !== 'browser' && !app.useDefaultBrowser) item = { id: app.id, name: applicationName(app), path: app.path };
    } else if (action.kind === 'program') item = { id: action.id, name: action.label, path: action.path };
    else if (action.kind === 'command') {
      const command = settings.commands.find(command => command.id === action.commandId);
      if (command?.kind === 'program') item = { id: `command:${command.id}`, name: command.name, path: command.target };
    }
    if (!item?.path || browsers.includes(normalizeExe(item.path)) || /(?:^|[\\/])(chrome|msedge|firefox|browser|opera|brave|vivaldi|iexplore)\.exe$/i.test(item.path)) continue;
    if (!result.some(old => normalizeExe(old.path) === normalizeExe(item!.path))) result.push(item);
  }
  return result;
}
export function switchTargets(previous: SwitchSnapshot, next: SwitchSnapshot) {
  const required = modePrograms(next);
  return { previous: modePrograms(previous).filter(old => !required.some(item => item.id === old.id || normalizeExe(item.path) === normalizeExe(old.path))), next: required };
}
