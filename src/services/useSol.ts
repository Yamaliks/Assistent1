import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, emitTo, listen } from '@tauri-apps/api/event';
import { createVoiceCapture, type VoiceStatus } from './voiceService';
import { defaultVoiceSettings, routeSol } from './solCommands';
import { applicationName } from '../domain/applications';
import { systemServices } from './systemServices';
import { launchUserCommand } from './modeEngine';
import { normalizeExe } from './libraryEditing';
import type { ModeRun } from '../domain/modes';
import type { Settings } from './settingsStorage';
import { desktop, showMain } from './windows';
export interface SolState { status: VoiceStatus; phrase: string; message: string }
export function useSol(owner: boolean, getSettings: () => Settings, runMode: (id: string) => Promise<ModeRun | undefined>) {
  const [state, setState] = useState<SolState>({ status: 'off', phrase: '', message: '' });
  const latest = useRef({ getSettings, runMode }); latest.current = { getSettings, runMode };
  const [audioError, setAudioError] = useState('');
  const audio = useRef<{ context?: AudioContext; source?: AudioBufferSourceNode; finish?: () => void; generation: number }>({ generation: 0 });
  const commandGeneration = useRef(0);
  const set = (patch: Partial<SolState>) => setState(current => { const next = { ...current, ...patch }; if (desktop && owner) void emit('sol-state', next).catch(() => {}); return next; });
  const stopAudio = () => { mutedUntil.current = performance.now() + 400; audio.current.generation++; try { audio.current.source?.stop(); } catch { /* A source waiting for context.resume() has not started yet. */ } audio.current.source = undefined; audio.current.finish?.(); audio.current.finish = undefined; const old = audio.current.context; audio.current.context = undefined; if (old) void old.close().catch(() => {}); };
  const mutedUntil = useRef(0);
  async function speak(id: string, test = false) {
    const config = latest.current.getSettings().voice ?? defaultVoiceSettings();
    if ((!config.replies && !test) || (!test && config.brief && ['listening', 'opening', 'mode'].includes(id))) return;
    stopAudio(); const own = audio.current.generation;
    try {
      mutedUntil.current = Infinity; // Includes asynchronous synthesis/decoding, not just playback.
      const bytes = await invoke<number[]>('sol_audio', { id }); if (own !== audio.current.generation) return;
      const context = new AudioContext(); audio.current.context = context;
      const buffer = await context.decodeAudioData(Uint8Array.from(bytes).buffer); if (own !== audio.current.generation) { await context.close(); return; }
      const gain = context.createGain(); gain.gain.value = config.volume / 100;
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(gain).connect(context.destination); audio.current.source = source;
      await context.resume();
      if (own !== audio.current.generation) return;
      const ended = new Promise<void>(resolve => {
        audio.current.finish = resolve;
        source.onended = () => { if (audio.current.context === context) { mutedUntil.current = performance.now() + 400; audio.current.source = undefined; audio.current.context = undefined; audio.current.finish = undefined; void context.close(); } resolve(); };
      });
      source.start(); setAudioError(''); await ended;
    } catch (error) { if (own === audio.current.generation) { stopAudio(); setAudioError(`Ответ SOL недоступен: ${String(error)}`); } }
  }
  const speakRef = useRef(speak); speakRef.current = speak;
  const [capture] = useState<ReturnType<typeof createVoiceCapture>>(() => createVoiceCapture((status, error) => set({ status, ...(error ? { message: error } : {}) }), async phrase => {
    const command = ++commandGeneration.current;
    set({ phrase, message: '' }); const settings = latest.current.getSettings(); const voice = settings.voice ?? defaultVoiceSettings();
    if (!voice.enabled) return;
    const intent = routeSol(phrase, settings, voice.wake);
    if (intent.kind === 'ignored') return;
    if (intent.kind === 'stop') { await capture.stop(); set({ message: 'Прослушивание остановлено.' }); void speakRef.current('goodbye'); return; }
    if (intent.kind === 'hello') { set({ message: 'Привет. SOL на связи.' }); void speakRef.current('hello'); return; }
    if (intent.kind === 'commands') { await showMain('commands'); set({ message: 'Открыт список команд.' }); return; }
    if (intent.kind === 'unknown' || intent.kind === 'ambiguous') { set({ message: intent.kind === 'ambiguous' ? 'Несколько совпадений. Уточните название; ничего не запущено.' : 'Не понял команду. Ничего не запущено.' }); void speakRef.current('unknown'); return; }
    try {
      if (intent.kind === 'mode') {
        const mode = settings.modes.find(mode => mode.id === intent.id)!;
        set({ message: `Переключение: ${mode.name}. Закрытие требует отдельного подтверждения.` }); await speakRef.current('mode');
        if (command !== commandGeneration.current) return;
        const result = await latest.current.runMode(mode.id); // Existing shared owner and confirmation dialog.
        if (command !== commandGeneration.current) return;
        // The real ModeRun/notice owns the result; do not invent a success here.

        set({ message: result?.summary ?? 'Запуск отменён или не выполнен.' });
        void speakRef.current(result ? result.status === 'errors' ? 'errors' : 'done' : 'cancelled');
        return;
      }
      await speakRef.current('opening');
      if (command !== commandGeneration.current) return;
      let report;
      if (intent.kind === 'application') {
        const app = settings.applications.find(item => item.id === intent.id)!;
        set({ message: `Открываю: ${applicationName(app)}` });
        report = await systemServices.execute(app.useDefaultBrowser ? { id: app.id, kind: 'browser', label: applicationName(app) } : { id: app.id, kind: 'program', path: app.path, label: applicationName(app) }, false, app.useDefaultBrowser || !!app.skipIfRunning);
      } else if (intent.kind === 'site') {
        const site = settings.sites.find(item => item.id === intent.id)!;
        report = await systemServices.execute({ id: site.id, kind: 'website', label: site.name, url: site.url });
      } else if (intent.kind === 'command') {
        const command = settings.commands.find(item => item.id === intent.id)!;
        report = await launchUserCommand(command, systemServices, false, command.kind === 'program' && settings.applications.some(app => app.skipIfRunning && app.path && normalizeExe(app.path) === normalizeExe(command.target)));
      }
      if (!report || command !== commandGeneration.current) return;
      set({ message: report.message }); void speakRef.current(report.outcome === 'state-unknown' ? 'errors' : 'done');
    } catch (error) { if (command === commandGeneration.current) { set({ message: String(error) }); void speakRef.current('errors'); } }
  }, () => performance.now() >= mutedUntil.current));
  useEffect(() => {
    if (!owner) return;
    if (!getSettings().voice?.enabled) { commandGeneration.current++; void capture.stop(); stopAudio(); }
    if (!getSettings().voice?.replies) stopAudio();
  }, [owner, getSettings().voice?.enabled, getSettings().voice?.replies, capture]);
  useEffect(() => {
    let disposed = false; const cleanups: (() => void)[] = [];
    if (desktop) {
      const registrations = owner ? [listen('sol-stop', () => { commandGeneration.current++; void capture.stop(); stopAudio(); }), listen('sol-status-request', () => setState(current => { void emit('sol-state', current); return current; }))] : [listen<SolState>('sol-state', event => setState(event.payload))];
      for (const registration of registrations) void registration.then(cleanup => { if (disposed) cleanup(); else cleanups.push(cleanup); }).catch(error => { if (!disposed) set({ message: `Синхронизация SOL недоступна: ${String(error)}` }); });
      if (!owner) void emitTo('main', 'sol-status-request').catch(error => set({ message: String(error) }));
    }
    const unload = () => { commandGeneration.current++; void capture.stop(); stopAudio(); };
    window.addEventListener('pagehide', unload);
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()); window.removeEventListener('pagehide', unload); if (owner) unload(); };
  }, [owner, capture]);
  async function start() { if (!owner) { await showMain('voice'); return; } const config = latest.current.getSettings().voice ?? defaultVoiceSettings(); if (!config.enabled) { set({ message: 'Сначала включите голосовое управление SOL.' }); return; } set({ message: 'Подготовка микрофона и локальной модели…' }); await capture.start(config.deviceId, config.wake); }
  return { state, audioError, start, stop: async () => { if (!owner && desktop) { await emitTo('main', 'sol-stop'); return; } commandGeneration.current++; await capture.stop(); stopAudio(); }, testVoice: () => speak('hello', true) };
}
