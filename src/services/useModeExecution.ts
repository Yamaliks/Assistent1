import { useEffect, useRef, useState } from 'react';
import { emit, emitTo, listen } from '@tauri-apps/api/event';
import type { ModeRun } from '../domain/modes';
import type { Settings } from './settingsStorage';
import { createModeController, type ModeStates } from './modeController';
import { desktop } from './windows';
export function useModeExecution(onFinish: (result: ModeRun) => boolean, notify: (message: string) => void, getSettings: () => Settings, owner: boolean) {
  const [runs, setRuns] = useState<ModeStates>({});
  const callbacks = useRef({ onFinish, notify, getSettings }); callbacks.current = { onFinish, notify, getSettings };
  const [controller] = useState(() => createModeController(() => callbacks.current.getSettings(), states => {
    setRuns(states); if (desktop) void emit('mode-state', states).catch(error => callbacks.current.notify(`Не удалось синхронизировать статус: ${error}`));
  }, result => callbacks.current.onFinish(result), message => {
    callbacks.current.notify(message); if (desktop) void emit('mode-notice', message).catch(() => {});
  }));
  useEffect(() => {
    if (!desktop) return;
    let disposed = false; const cleanups: (() => void)[] = [];
    const attach = async () => {
      const registrations = owner ? [
        listen<string>('mode-request', event => { void controller.run(event.payload); }),
        listen('mode-status-request', () => { void emit('mode-state', controller.snapshot()); }),
      ] : [
        listen<ModeStates>('mode-state', event => setRuns(event.payload)),
        listen<string>('mode-notice', event => callbacks.current.notify(event.payload)),
      ];
      const results = await Promise.allSettled(registrations);
      for (const result of results) if (result.status === 'fulfilled') { if (disposed) result.value(); else cleanups.push(result.value); }
      else callbacks.current.notify(`Не удалось подключить запуск между окнами: ${result.reason}`);
      if (!owner && !disposed) await emitTo('main', 'mode-status-request');
    };
    void attach().catch(error => callbacks.current.notify(String(error)));
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()); };
  }, [owner, controller]);
  async function run(id: string) {
    if (owner) await controller.run(id);
    else try { await emitTo('main', 'mode-request', id); } catch (error) { callbacks.current.notify(`Не удалось передать запуск: ${error}`); }
  }
  return { runs, run };
}
