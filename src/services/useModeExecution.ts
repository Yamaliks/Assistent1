import { useState } from 'react';
import type { Mode, ModeRun } from '../domain/modes';
import type { Settings } from './settingsStorage';
import { modeRunner, type ModeProgress } from './modeEngine';
export function useModeExecution(onFinish: (result: ModeRun) => boolean, notify: (message: string) => void) {
  const [runs, setRuns] = useState<Record<string, ModeProgress | ModeRun>>({});
  async function run(mode: Mode, settings: Settings) {
    if (modeRunner.isRunning(mode.id)) return;
    setRuns(current => ({ ...current, [mode.id]: { modeId: mode.id, status: 'running', current: '', results: [] } }));
    try {
      const result = await modeRunner.run(mode, settings, progress => setRuns(current => ({ ...current, [mode.id]: progress })));
      setRuns(current => ({ ...current, [mode.id]: result }));
      notify(onFinish(result) ? result.summary : `${result.summary} Не удалось сохранить итог.`);
    } catch (error) {
      setRuns(current => { const next = { ...current }; delete next[mode.id]; return next; });
      notify(error instanceof Error ? error.message : 'Не удалось запустить режим.');
    }
  }
  return { runs, run };
}
