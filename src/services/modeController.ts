import type { ActionResult, ModeRun } from '../domain/modes.ts';
import type { Settings } from './settingsStorage.ts';
import { createModeRunner, type ModeProgress } from './modeEngine.ts';
import type { SwitchSnapshot } from './modeSwitching.ts';
export type ModeStates = Record<string, ModeProgress | ModeRun>;
// Both windows send IDs to this one owner; never execute paths supplied by a peer.
export function createModeController(getSettings: () => Settings, publish: (states: ModeStates) => void, persist: (run: ModeRun) => boolean, notify: (message: string) => void, runner = createModeRunner(), confirmSwitch: (previous: SwitchSnapshot, next: SwitchSnapshot) => Promise<boolean | { proceed: boolean; results: ActionResult[] }> = async () => true) {
  let states: ModeStates = {};
  let active: SwitchSnapshot | undefined;
  let switching = false;
  const put = (id: string, state: ModeRun | ModeProgress) => { states = { ...states, [id]: state }; publish(states); };
  return {
    snapshot: () => states,
    async run(id: string) {
      if (runner.isRunning(id) || switching) { notify('Дождитесь завершения запуска или подтверждения переключения.'); return; }
      const settings = getSettings(); const mode = settings.modes.find(mode => mode.id === id);
      if (!mode) { notify('Режим не найден.'); return; }
      switching = true;
      try {
        const next = structuredClone({ mode, settings });
        const decision = active && active.mode.id !== id ? await confirmSwitch(active, next) : true;
        if (decision === false || (typeof decision === 'object' && !decision.proceed)) { notify('Переключение отменено.'); return; }
        const closed = typeof decision === 'object' ? decision.results : [];
        const launched = await runner.run(next.mode, next.settings, progress => put(id, { ...progress, results: [...closed, ...progress.results] }));
        const closeErrors = closed.filter(result => result.status === 'error').length;
        const result: ModeRun = { ...launched, results: [...closed, ...launched.results], ...(closeErrors ? { status: 'errors', summary: `${launched.summary} Не закрыто приложений: ${closeErrors}.` } : {}) };
        active = next;
        const saved = persist(result); put(id, result);
        notify(saved ? result.summary : `${result.summary} Не удалось сохранить итог.`);
        return result;
      } catch (error) { notify(error instanceof Error ? error.message : String(error)); }
      finally { switching = false; }
    },
  };
}
