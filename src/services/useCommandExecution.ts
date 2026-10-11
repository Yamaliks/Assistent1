import { useRef, useState } from 'react';
import type { UserCommand } from '../domain/commands';
import { executeUserCommand } from './modeEngine';
export function useCommandExecution(notify: (message: string) => void) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run(command: UserCommand) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    notify(`«${command.name}»: отправка запроса…`);
    try { notify(await executeUserCommand(command)); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось выполнить команду.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return { run, busy };
}
