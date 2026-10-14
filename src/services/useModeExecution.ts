import { useEffect, useRef, useState } from 'react';
import { emit, emitTo, listen } from '@tauri-apps/api/event';
import type { ModeRun } from '../domain/modes';
import type { Settings } from './settingsStorage';
import { createModeController, type ModeStates } from './modeController';
import { desktop } from './windows';
import { showMain } from './windows';
import { invoke } from '@tauri-apps/api/core';
import { switchTargets, type ClosePlan } from './modeSwitching';
export function useModeExecution(onFinish: (result: ModeRun) => boolean, notify: (message: string) => void, getSettings: () => Settings, owner: boolean) {
  const [runs, setRuns] = useState<ModeStates>({});
  const [closeErrors, setCloseErrors] = useState<string[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<ClosePlan | null>(null);
  const switchAnswer = useRef<((answer: string[] | null) => void) | null>(null);
  const callbacks = useRef({ onFinish, notify, getSettings }); callbacks.current = { onFinish, notify, getSettings };
  const [controller] = useState(() => createModeController(() => callbacks.current.getSettings(), states => {
    setRuns(states); if (desktop) void emit('mode-state', states).catch(error => callbacks.current.notify(`Не удалось синхронизировать статус: ${error}`));
  }, result => callbacks.current.onFinish(result), message => {
    callbacks.current.notify(message); if (desktop) void emit('mode-notice', message).catch(() => {});
  }, undefined, async (previous, next) => {
    if (!desktop) throw new Error('Штатное переключение доступно в Windows-приложении.');
    setCloseErrors([]);
    const plan = await invoke<ClosePlan>('prepare_mode_switch', switchTargets(previous, next));
    if (plan.warnings.length) callbacks.current.notify(plan.warnings.join('\n'));
    let selected: string[] | null = [];
    if (plan.candidates.length) {
      await emitTo('palette', 'switch-prompt');
      await showMain();
      if (desktop) void emit('mode-notice', 'Подтвердите переключение в главном окне. По умолчанию приложения остаются открытыми.');
      selected = await new Promise<string[] | null>(resolve => { switchAnswer.current = resolve; setPendingSwitch({ ...plan, previousName: previous.mode.name, nextName: next.mode.name }); });
      setPendingSwitch(null); switchAnswer.current = null;
    }
    const results = await invoke<{ name: string; closed: boolean; message: string }[]>('confirm_mode_switch', { token: plan.token, selected: selected ?? [] });
    const errors = results.filter(result => !result.closed).map(result => `${result.name}: ${result.message}`);
    if (errors.length) { callbacks.current.notify(errors.join('\n')); }
    setCloseErrors([...plan.warnings, ...errors]);
    if (desktop) void emit('switch-errors', [...plan.warnings, ...errors]);
    return { proceed: selected !== null, results: results.map((result, index) => ({ actionId: `switch:${plan.token}:${index}`, name: `Закрытие · ${result.name}`, status: result.closed ? 'success' as const : 'error' as const, message: result.message })) };
  }));
  useEffect(() => {
    if (!desktop) return;
    let disposed = false; const cleanups: (() => void)[] = [];
    const attach = async () => {
      const registrations = owner ? [
        listen<string>('mode-request', event => { void controller.run(event.payload); }),
        listen('mode-status-request', () => { void emit('mode-state', controller.snapshot()); }),
      ] : [
        listen<string[]>('switch-errors', event => setCloseErrors(event.payload)),
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
    if (owner) return await controller.run(id);
    else try { await emitTo('main', 'mode-request', id); } catch (error) { callbacks.current.notify(`Не удалось передать запуск: ${error}`); }
  }
  return { runs, run, closeErrors, pendingSwitch, answerSwitch: (selected: string[] | null) => switchAnswer.current?.(selected) };
}
