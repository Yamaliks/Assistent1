import type { LaunchDetails, ModeAction } from '../domain/modes.ts';
import { targetError } from '../domain/commands.ts';
import { isTauri, invoke } from '@tauri-apps/api/core';
export type LaunchOutcome = 'launched' | 'already-running' | 'state-unknown';
export interface LaunchReport { outcome: LaunchOutcome; message: string; details?: LaunchDetails }
export class LaunchError extends Error { readonly details?: LaunchDetails; constructor(message: string, details?: LaunchDetails) { super(message); this.details = details; } }
function report(value: LaunchReport | LaunchOutcome | void): LaunchReport {
  if (typeof value === 'object') {
    if (!value || !['launched', 'already-running', 'state-unknown'].includes(value.outcome) || typeof value.message !== 'string') throw new LaunchError('Получен некорректный результат службы запуска.');
    return value;
  }
  if (value !== undefined && !['launched', 'already-running', 'state-unknown'].includes(value)) throw new LaunchError('Получен неизвестный статус запуска.');
  return { outcome: value ?? 'launched', message: value === 'already-running' ? 'Уже работает' : value === 'state-unknown' ? 'Не удалось определить состояние' : 'Запущено' };
}
export interface SystemServices {
  execute(action: ModeAction, minimized?: boolean, skipIfRunning?: boolean): Promise<LaunchReport>;
  isProgramRunning(path: string): Promise<boolean>;
  // A later implementation must request explicit confirmation before closing a program.
  requestProgramClose(path: string): Promise<'cancelled' | 'confirmed'>;
}
export function createSystemServices(launch: (kind: 'program' | 'website' | 'folder' | 'browser', target: string, minimized?: boolean, skipIfRunning?: boolean) => Promise<void | LaunchOutcome | LaunchReport>): SystemServices {
  return {
  async execute(action, minimized = false, skipIfRunning = false) {
    if (action.kind === 'browser') { return report(await launch('browser', '', minimized, true)); }
    if (action.kind !== 'program' && action.kind !== 'website' && action.kind !== 'folder') throw new Error('Это системное действие пока недоступно');
    const target = action.kind === 'website' ? action.url : action.path;
    const error = targetError(action.kind, target);
    if (error) throw new Error(error);
    return report(await launch(action.kind, target, action.kind === 'program' ? minimized : undefined, action.kind === 'program' ? skipIfRunning : undefined));
  },
  async isProgramRunning() { throw new Error('Проверка процессов пока недоступна'); },
  async requestProgramClose() { return 'cancelled'; },
  };
}
export const systemServices = createSystemServices(async (kind, target, minimized, skipIfRunning) => {
  if (!isTauri()) throw new Error('Запуск доступен только в Windows-приложении Tauri, не в браузере.');
  try { return await invoke<LaunchReport>('execute_action', { action: kind === 'browser' ? { kind, minimized: minimized ?? false } : kind === 'program' ? { kind, target, minimized: minimized ?? false, skip_if_running: skipIfRunning ?? false } : { kind, target } }); }
  catch (error) { if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') throw new LaunchError(error.message, 'details' in error ? error.details as LaunchDetails : undefined); throw new LaunchError(typeof error === 'string' ? error : 'Не удалось выполнить действие.'); }
});
