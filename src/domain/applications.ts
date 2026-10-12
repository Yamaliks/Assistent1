import { targetError } from './commands.ts';
export const applicationDefinitions = [
  { id: 'steam', name: 'Steam' }, { id: 'discord', name: 'Discord' },
  { id: 'telegram', name: 'Telegram' }, { id: 'vpn', name: 'VPN' },
  { id: 'browser', name: 'Браузер' },
] as const;
export type ApplicationId = typeof applicationDefinitions[number]['id'];
export interface ApplicationConfig { id: ApplicationId; path: string; useDefaultBrowser: boolean }
export function defaultApplications(): ApplicationConfig[] {
  return applicationDefinitions.map(({ id }) => ({ id, path: '', useDefaultBrowser: id === 'browser' }));
}
export function isApplicationList(value: unknown): value is ApplicationConfig[] {
  return Array.isArray(value) && value.length === applicationDefinitions.length
    && applicationDefinitions.every(({ id }) => value.filter(item => item?.id === id).length === 1)
    && value.every(item => typeof item.path === 'string' && typeof item.useDefaultBrowser === 'boolean'
      && (!item.useDefaultBrowser || (item.id === 'browser' && item.path === ''))
      && (!item.path || !targetError('program', item.path)));
}
