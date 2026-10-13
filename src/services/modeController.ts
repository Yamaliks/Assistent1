import type { ModeRun } from '../domain/modes.ts';
import type { Settings } from './settingsStorage.ts';
import { createModeRunner, type ModeProgress } from './modeEngine.ts';
export type ModeStates = Record<string, ModeProgress | ModeRun>;
// Both windows send IDs to this one owner; never execute paths supplied by a peer.
export function createModeController(getSettings: () => Settings, publish: (states: ModeStates) => void, persist: (run: ModeRun) => boolean, notify: (message: string) => void, runner = createModeRunner()) {
  let states: ModeStates = {};
  const put = (id: string, state: ModeRun | ModeProgress) => { states = { ...states, [id]: state }; publish(states); };
  return {
    snapshot: () => states,
    async run(id: string) {
      if (runner.isRunning(id)) return;
      const settings = getSettings(); const mode = settings.modes.find(mode => mode.id === id);
      if (!mode) { notify('Режим не найден.'); return; }
      try {
        const result = await runner.run(mode, settings, progress => put(id, progress));
        const saved = persist(result); put(id, result);
        notify(saved ? result.summary : `${result.summary} Не удалось сохранить итог.`);
      } catch (error) { notify(error instanceof Error ? error.message : String(error)); }
    },
  };
}
