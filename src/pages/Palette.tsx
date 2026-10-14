import type { SolState } from '../services/useSol';
import { ActionResults } from '../components/ActionResults';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { ArrowRight, AudioLines, Globe, Monitor, Play, Search, X } from 'lucide-react';
import { modeIcons } from '../components/ModeCard';
import { commandIcons } from './CommandsPage';
import { normalizeCommand } from '../domain/commands';
import type { Settings } from '../services/settingsStorage';
import type { ModeStates } from '../services/modeController';
import { searchPalette, type PaletteItem } from '../services/paletteSearch';
import { useCommandExecution } from '../services/useCommandExecution';
import { systemServices } from '../services/systemServices';
import { routeCommand } from '../services/commandRouter';
import { desktop, hidePalette, showMain } from '../services/windows';
export function Palette({ sol, onStopSol, settings, runs, onRun, message, notify, reportError }: { sol: SolState; onStopSol: () => void; settings: Settings; runs: ModeStates; onRun: (id: string) => void; message: string; notify: (message: string) => void; reportError: (error: unknown) => void }) {
  const [query, setQuery] = useState(''); const input = useRef<HTMLInputElement>(null); const browserLock = useRef(false); const [browserBusy, setBrowserBusy] = useState(false);
  const execution = useCommandExecution(notify, settings.applications); const busy = execution.busy || browserBusy;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') void hidePalette().catch(reportError); };
    window.addEventListener('keydown', onKey); let disposed = false; const cleanups: (() => void)[] = [];
    if (desktop) for (const registration of [listen('switch-prompt', () => { void hidePalette().catch(reportError); }), listen('palette-focus', () => { input.current?.focus(); input.current?.select(); void emitTo('main', 'mode-status-request').catch(reportError); }), listen<string>('palette-error', event => notify(event.payload))]) void registration.then(cleanup => { if (disposed) cleanup(); else cleanups.push(cleanup); }).catch(reportError);
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()); window.removeEventListener('keydown', onKey); };
  }, [notify, reportError]);
  const items = searchPalette(settings, query);
  async function launch(item: PaletteItem) {
    if (busy || browserLock.current) return;
    if (item.kind === 'mode') { onRun(item.id); return; }
    if (item.kind === 'command') { const command = settings.commands.find(command => command.id === item.id); if (command) await execution.run(command); return; }
    if (item.kind === 'site') { const site = settings.sites.find(site => site.id === item.id); if (site) await execution.run({ id: site.id, name: site.name, phrase: '', kind: 'website', target: site.url }); return; }
    const app = settings.applications.find(app => app.id === item.id); if (!app) return;

    browserLock.current = true; setBrowserBusy(true);
    try { const outcome = await systemServices.execute(app.useDefaultBrowser ? { id: app.id, kind: 'browser', label: item.name } : { id: app.id, kind: 'program', label: item.name, path: app.path }, false, app.useDefaultBrowser || (app.skipIfRunning ?? false)); notify(outcome.outcome === 'state-unknown' ? `«${item.name}»: ${outcome.message}` : outcome.outcome === 'already-running' ? `«${item.name}»: уже работает.` : `«${item.name}»: запущено.`); }
    catch (error) { reportError(error); } finally { browserLock.current = false; setBrowserBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); const route = routeCommand(query, settings.modes, settings.commands);
    if (route.kind === 'navigate') { void showMain(route.page).then(hidePalette).catch(reportError); return; }
    const exact = items.filter(item => [item.name, item.phrase].filter(Boolean).some(alias => normalizeCommand(alias) === normalizeCommand(query)));
    if (exact.length > 1) { notify('Несколько совпадений. Выберите нужную карточку.'); return; }
    const item = exact[0] ?? items[0]; if (item) void launch(item); else notify('Ничего не найдено.');
  }
  return <div className="palette-shell"><header className="palette-header"><div className="palette-drag" data-tauri-drag-region><span className="brand-mark small"><AudioLines size={18} /></span><strong>Assistent1</strong></div><button className="icon-button" aria-label="Скрыть панель" onClick={() => { void hidePalette().catch(reportError); }}><X size={18} /></button></header>
    <form className="palette-input" onSubmit={submit}><Search size={20} /><input ref={input} autoFocus aria-label="Поиск режимов, команд, приложений и сайтов" placeholder="Что хотите открыть?" value={query} onChange={e => setQuery(e.target.value)} /><button className="icon-button" aria-label="Запустить выбранное"><Play size={18} /></button></form>
    <div className="palette-body"><div className="sol-indicator"><button className="text-button" onClick={() => { void showMain('voice').then(hidePalette).catch(reportError); }}>SOL · {sol.status === 'off' ? 'Настроить голос' : sol.status === 'listening' ? 'Микрофон активен' : sol.status === 'error' ? 'Ошибка' : 'Обработка'}</button>{sol.status !== 'off' && <button className="secondary" onClick={onStopSol}>Стоп</button>}</div>{sol.phrase && <p className="palette-hint">SOL: {sol.phrase} · {sol.message}</p>}<div className="palette-modes">{items.map(item => {
      const mode = item.kind === 'mode' ? settings.modes.find(mode => mode.id === item.id) : undefined;
      const run = mode ? runs[mode.id] ?? mode.lastRun : undefined;
      const command = item.kind === 'command' ? settings.commands.find(command => command.id === item.id) : undefined;
      const Icon = mode ? modeIcons[mode.icon] : command ? commandIcons[command.kind] : item.kind === 'site' ? Globe : Monitor;
      return <div key={`${item.kind}:${item.id}`} className="palette-result"><button disabled={busy || run?.status === 'running'} onClick={() => { void launch(item); }} aria-label={`Запустить ${item.name}`}><span className="mode-icon"><Icon size={20} /></span><span><strong>{item.name}</strong><small>{run ? run.status === 'running' ? 'Запускается' : run.status === 'errors' ? 'Есть ошибки' : 'Готово' : { mode: 'Режим · Запустить', command: 'Команда', application: 'Приложение', site: 'Сайт' }[item.kind]}</small></span><Play size={15} /></button>{run && <div className="field-help">{run.status === 'running' ? `Сейчас: ${run.current}` : run.summary}<details><summary>Результаты действий</summary><ActionResults results={run.results} /></details></div>}</div>;
    })}</div>{!items.length && <p className="palette-hint">Ничего не найдено.</p>}{message && <p className="palette-message" role="status">{message}</p>}</div>
    <footer className="palette-footer"><span>{busy ? 'Запускается' : 'Enter — запустить'}</span><button className="text-button" onClick={() => { void showMain().then(hidePalette).catch(reportError); }}>Главное окно<ArrowRight size={14} /></button><kbd>Esc</kbd></footer></div>;
}
