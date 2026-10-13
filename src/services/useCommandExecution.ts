import { useRef, useState } from 'react';
import type { UserCommand } from '../domain/commands';
import type { ApplicationConfig } from '../domain/applications';
import { normalizeExe } from './libraryEditing';
import { executeUserCommand } from './modeEngine';
export function useCommandExecution(notify: (message: string) => void, applications: ApplicationConfig[] = []) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run(command: UserCommand) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    notify(`«${command.name}»: отправка запроса…`);
    try { notify(await executeUserCommand(command, undefined, false, command.kind === 'program' && applications.some(app => app.skipIfRunning && app.path && normalizeExe(app.path) === normalizeExe(command.target)))); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось выполнить команду.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return { run, busy };
}
