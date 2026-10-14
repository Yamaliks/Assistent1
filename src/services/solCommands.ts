import { applicationName } from '../domain/applications.ts';
import type { Settings } from './settingsStorage.ts';
export type SolIntent = { kind: 'hello' | 'stop' | 'commands' | 'unknown' | 'ambiguous' | 'ignored' } | { kind: 'mode' | 'application' | 'site' | 'command'; id: string };
export const speechText = (text: string) => text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const aliases: Record<string, string[]> = { steam: ['стим'], discord: ['дискорд'], telegram: ['телеграм', 'телеграмм'], youtube: ['ютуб', 'ютьюб'], 'яндекс музыка': ['яндекс музыку'] };
function names(name: string) { const key = speechText(name); return [key, ...(aliases[key] ?? [])]; }
function modeNames(name: string) {
  const key = speechText(name);
  const variants: Record<string, string[]> = { игра: ['игру', 'игровой', 'игровой режим'], работа: ['работу', 'рабочий', 'рабочий режим'], отдых: ['режим отдыха'], ночь: ['ночной', 'ночной режим'] };
  return [key, ...(variants[key] ?? [])];
}
export function routeSol(input: string, settings: Settings, wakeOnly = false): SolIntent {
  let text = speechText(input); const wake = /^(сол|соль|sol)(?:\s|$)/.test(text);
  if (wakeOnly && !wake) return { kind: 'ignored' };
  text = text.replace(/^(сол|соль|sol)(?:\s|$)/, '').trim();
  if (['привет', 'здравствуй', 'здравствуйте'].includes(text)) return { kind: 'hello' };
  if (['стоп', 'остановись', 'перестань слушать', 'до встречи'].includes(text)) return { kind: 'stop' };
  if (['покажи команды', 'открой команды', 'список команд'].includes(text)) return { kind: 'commands' };
  const matches: SolIntent[] = [];
  const modeName = text.replace(/^(включи|запусти|активируй)\s+/, '').replace(/^режим\s+/, '').replace(/\s+режим$/, '');
  if (/^(включи|запусти|активируй)\s/.test(text)) for (const mode of settings.modes) {
    if (modeNames(mode.name).includes(modeName) || modeNames(mode.name).includes(text.replace(/^(включи|запусти|активируй)\s+/, '')) || (mode.phrase && speechText(mode.phrase) === text)) matches.push({ kind: 'mode', id: mode.id });
  }
  const target = text.replace(/^(открой|открыть|запусти)\s+/, '');
  if (/^(открой|открыть|запусти)\s/.test(text)) {
    for (const app of settings.applications) if (names(applicationName(app)).includes(target)) matches.push({ kind: 'application', id: app.id });
    for (const site of settings.sites) if (names(site.name).includes(target)) matches.push({ kind: 'site', id: site.id });
  }
  for (const command of settings.commands) if ([speechText(command.name), command.phrase ? speechText(command.phrase) : '', ...names(command.name)].includes(text) || names(command.name).includes(target)) matches.push({ kind: 'command', id: command.id });
  return matches.length > 1 ? { kind: 'ambiguous' } : matches[0] ?? { kind: 'unknown' };
}
export interface VoiceSettings { enabled: boolean; replies: boolean; volume: number; brief: boolean; deviceId: string; wake: boolean }
export const defaultVoiceSettings = (): VoiceSettings => ({ enabled: false, replies: false, volume: 70, brief: false, deviceId: '', wake: false });
export function isVoiceSettings(value: unknown): value is VoiceSettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as VoiceSettings;
  return ['enabled', 'replies', 'brief', 'wake'].every(key => typeof v[key as keyof VoiceSettings] === 'boolean') && typeof v.volume === 'number' && Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 100 && typeof v.deviceId === 'string' && v.deviceId.length <= 512;
}
