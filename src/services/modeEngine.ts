import type { Mode } from '../domain/modes.ts';
import type { UserCommand } from '../domain/commands.ts';
import { systemServices, type SystemServices } from './systemServices.ts';
export async function executeUserCommand(command: UserCommand, services: SystemServices = systemServices): Promise<string> {
  const base = { id: command.id, label: command.name };
  await services.execute(command.kind === 'website'
    ? { ...base, kind: 'website', url: command.target }
    : { ...base, kind: command.kind, path: command.target });
  return `«${command.name}»: запрос ${command.kind === 'program' ? 'запуска' : 'открытия'} отправлен Windows.`;
}
export interface ModePlan { modeId: string; actionCount: number; executable: false; message: string }
export function planMode(mode: Mode): ModePlan {
  return { modeId: mode.id, actionCount: mode.actions.length, executable: false,
    message: `«${mode.name}»: просмотр режима. Выполнение действий пока недоступно.` };
}
// Stage 3 will execute typed actions sequentially via SystemServices, never a shell string.
