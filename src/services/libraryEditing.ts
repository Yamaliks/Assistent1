import { applicationName, type ApplicationConfig } from '../domain/applications.ts';
import { normalizeCommand } from '../domain/commands.ts';
import type { Mode, ModeAction } from '../domain/modes.ts';
import type { Site } from '../domain/sites.ts';
import type { Settings } from './settingsStorage.ts';
export const normalizeExe = (path: string) => path.trim().replace(/\//g, '\\').replace(/\\+/g, '\\').toLocaleLowerCase('ru-RU');
export function normalizeUrl(url: string): string {
  try { return new URL(url.trim()).href; } catch { return url.trim(); }
}
export function duplicateApplication(apps: ApplicationConfig[], next: ApplicationConfig): ApplicationConfig | undefined {
  return apps.find(app => app.id !== next.id && (next.path
    ? !!app.path && normalizeExe(app.path) === normalizeExe(next.path)
    : normalizeCommand(applicationName(app)) === normalizeCommand(applicationName(next))));
}
export function duplicateSite(sites: Site[], next: Site): Site | undefined {
  return next.url ? sites.find(site => site.id !== next.id && !!site.url && normalizeUrl(site.url) === normalizeUrl(next.url)) : undefined;
}
// One storage write commits both the shared item and its reference. Existing duplicates are retained.
export function addLibraryAction(settings: Settings, draft: Mode, item: ApplicationConfig | Site, actionId: string): { settings: Settings; mode: Mode } {
  const application = 'path' in item;
  const existing = application
    ? settings.applications.find(app => app.id === item.id) ?? duplicateApplication(settings.applications, item)
    : settings.sites.find(site => site.id === item.id) ?? duplicateSite(settings.sites, item);
  const selected = existing ?? item;
  const duplicate = draft.actions.some(action => application ? action.kind === 'application' && action.applicationId === selected.id : action.kind === 'site' && action.siteId === selected.id);
  const action: ModeAction = application
    ? { id: actionId, kind: 'application', label: '', applicationId: selected.id, active: true }
    : { id: actionId, kind: 'site', label: '', siteId: selected.id, active: true };
  const mode = { ...draft, actions: duplicate ? draft.actions : [...draft.actions, action] };
  return { mode, settings: { ...settings,
    applications: application && !existing ? [...settings.applications, item] : settings.applications,
    sites: !application && !existing ? [...settings.sites, item] : settings.sites,
    modes: settings.modes.map(saved => saved.id === mode.id ? mode : saved),
  } };
}

export function commandLibrary(settings: Pick<Settings, 'applications' | 'sites'>, command: import('../domain/commands.ts').UserCommand, include: boolean, itemId: string): Pick<Settings, 'applications' | 'sites'> {
  const result = { applications: settings.applications, sites: settings.sites };
  if (!include || command.kind === 'folder') return result;
  if (command.kind === 'program') {
    const app = { id: itemId, name: command.name, path: command.target, useDefaultBrowser: false };
    if (!duplicateApplication(settings.applications, app)) result.applications = [...settings.applications, app];
  } else {
    const site = { id: itemId, name: command.name, url: command.target };
    if (!duplicateSite(settings.sites, site)) result.sites = [...settings.sites, site];
  }
  return result;
}
