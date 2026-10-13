import { targetError } from './commands.ts';
export const applicationDefinitions = [
  { id: 'steam', name: 'Steam' }, { id: 'discord', name: 'Discord' },
  { id: 'telegram', name: 'Telegram' }, { id: 'vpn', name: 'VPN' },
  { id: 'browser', name: 'Браузер' },
] as const;
export type ApplicationId = string;
export interface ApplicationConfig { id: ApplicationId; name?: string; path: string; useDefaultBrowser: boolean; skipIfRunning?: boolean }
export function defaultApplications(): ApplicationConfig[] {
  return applicationDefinitions.map(({ id }) => ({ id, path: '', useDefaultBrowser: id === 'browser' }));
}
export function isApplicationList(value: unknown): value is ApplicationConfig[] {
  return Array.isArray(value) && new Set(value.map(item => item?.id)).size === value.length
    && value.every(item => typeof item?.id === 'string' && !!item.id
      && (item.name === undefined ? applicationDefinitions.some(app => app.id === item.id) : typeof item.name === 'string' && !!item.name.trim() && item.name.length <= 48)
      && (item.skipIfRunning === undefined || typeof item.skipIfRunning === 'boolean')
      && typeof item.path === 'string' && typeof item.useDefaultBrowser === 'boolean'
      && (!item.useDefaultBrowser || (item.id === 'browser' && item.path === ''))
      && (!item.path || !targetError('program', item.path)));
}

export function applicationName(app: ApplicationConfig): string {
  return app.name ?? applicationDefinitions.find(item => item.id === app.id)?.name ?? app.id;
}
