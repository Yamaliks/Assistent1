import type { ModeAction } from '../domain/modes.ts';
import { targetError } from '../domain/commands.ts';
import { isTauri, invoke } from '@tauri-apps/api/core';
export interface SystemServices {
  execute(action: ModeAction): Promise<void>;
  isProgramRunning(path: string): Promise<boolean>;
  // A later implementation must request explicit confirmation before closing a program.
  requestProgramClose(path: string): Promise<'cancelled' | 'confirmed'>;
}
export function createSystemServices(launch: (kind: 'program' | 'website' | 'folder', target: string) => Promise<void>): SystemServices {
  return {
  async execute(action) {
    if (action.kind !== 'program' && action.kind !== 'website' && action.kind !== 'folder') throw new Error('Это системное действие пока недоступно');
    const target = action.kind === 'website' ? action.url : action.path;
    const error = targetError(action.kind, target);
    if (error) throw new Error(error);
    await launch(action.kind, target);
  },
  async isProgramRunning() { throw new Error('Проверка процессов пока недоступна'); },
  async requestProgramClose() { return 'cancelled'; },
  };
}
export const systemServices = createSystemServices(async (kind, target) => {
  if (!isTauri()) throw new Error('Запуск доступен только в Windows-приложении Tauri, не в браузере.');
  try { await invoke('execute_action', { action: { kind, target } }); }
  catch (error) { throw new Error(typeof error === 'string' ? error : error instanceof Error ? error.message : 'Не удалось выполнить действие.'); }
});
