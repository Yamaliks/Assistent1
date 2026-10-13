import type { ModeAction } from '../domain/modes.ts';
import { targetError } from '../domain/commands.ts';
import { isTauri, invoke } from '@tauri-apps/api/core';
export type LaunchOutcome = 'launched' | 'already-running';
export interface SystemServices {
  execute(action: ModeAction, minimized?: boolean, skipIfRunning?: boolean): Promise<LaunchOutcome>;
  isProgramRunning(path: string): Promise<boolean>;
  // A later implementation must request explicit confirmation before closing a program.
  requestProgramClose(path: string): Promise<'cancelled' | 'confirmed'>;
}
export function createSystemServices(launch: (kind: 'program' | 'website' | 'folder' | 'browser', target: string, minimized?: boolean, skipIfRunning?: boolean) => Promise<void | LaunchOutcome>): SystemServices {
  return {
  async execute(action, minimized = false, skipIfRunning = false) {
    if (action.kind === 'browser') { return (await launch('browser', '', minimized, true)) ?? 'launched'; }
    if (action.kind !== 'program' && action.kind !== 'website' && action.kind !== 'folder') throw new Error('Это системное действие пока недоступно');
    const target = action.kind === 'website' ? action.url : action.path;
    const error = targetError(action.kind, target);
    if (error) throw new Error(error);
    return (await launch(action.kind, target, action.kind === 'program' ? minimized : undefined, action.kind === 'program' ? skipIfRunning : undefined)) ?? 'launched';
  },
  async isProgramRunning() { throw new Error('Проверка процессов пока недоступна'); },
  async requestProgramClose() { return 'cancelled'; },
  };
}
export const systemServices = createSystemServices(async (kind, target, minimized, skipIfRunning) => {
  if (!isTauri()) throw new Error('Запуск доступен только в Windows-приложении Tauri, не в браузере.');
  try { return await invoke<LaunchOutcome>('execute_action', { action: kind === 'browser' ? { kind, minimized: minimized ?? false } : kind === 'program' ? { kind, target, minimized: minimized ?? false, skip_if_running: skipIfRunning ?? false } : { kind, target } }); }
  catch (error) { throw new Error(typeof error === 'string' ? error : error instanceof Error ? error.message : 'Не удалось выполнить действие.'); }
});
