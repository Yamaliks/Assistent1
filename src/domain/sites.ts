import { targetError } from './commands.ts';
import { modeTemplate, type ModeIcon, type ModeAction } from './modes.ts';
import type { ApplicationConfig } from './applications.ts';
export interface Site { id: string; name: string; url: string }
export function isSiteList(value: unknown): value is Site[] {
  return Array.isArray(value) && value.every(site => site && typeof site.id === 'string' && !!site.id
    && typeof site.name === 'string' && !!site.name.trim() && site.name.length <= 100
    && typeof site.url === 'string' && (!site.url || !targetError('website', site.url)))
    && new Set(value.map(site => site.id)).size === value.length;
}
// Preserve action IDs/activity; move inline URLs into one shared library exactly once.
export function shareSites(actions: ModeAction[], sites: Site[], prefix: string): ModeAction[] {
  return actions.map(action => {
    if (action.kind !== 'website') return action;
    const name = action.label.trim().slice(0, 100) || 'Сайт';
    let site = sites.find(site => site.name === name && site.url === action.url);
    if (!site) {
      let id = `site:${prefix}:${action.id}`;
      while (sites.some(item => item.id === id)) id += ':site';
      site = { id, name, url: action.url }; sites.push(site);
    }
    return { id: action.id, kind: 'site', label: action.label, ...(action.active === undefined ? {} : { active: action.active }), siteId: site.id };
  });
}

export function libraryModeTemplate(icon: ModeIcon, modeId: string, applications: ApplicationConfig[], sites: Site[]): { actions: ModeAction[]; sites: Site[] } {
  const nextSites = [...sites];
  const actions = modeTemplate(icon, modeId).filter(action => action.kind !== 'application' || applications.some(app => app.id === action.applicationId))
    .map(action => {
      const existing = action.kind === 'website' ? sites.find(site => site.name === action.label) : undefined;
      return existing ? { id: action.id, kind: 'site' as const, label: action.label, active: action.active, siteId: existing.id } : action;
    });
  return { actions: shareSites(actions, nextSites, modeId), sites: nextSites };
}
