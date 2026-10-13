import { useCallback, useEffect, useRef, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { Activity, ArrowRight, AudioLines, Check, ChevronRight, Command, Home, Keyboard, LayoutGrid, Mic, Monitor, Plus, Search, Settings2, ShieldCheck, Sparkles, X, type LucideIcon } from 'lucide-react';
import { removeLibraryActions, removeCommandActions, type Mode } from './domain/modes';
import { ModeEditor } from './pages/ModeEditor';
import { LibraryPage } from './pages/LibraryPage';
import { addLibraryAction } from './services/libraryEditing';
import { libraryModeTemplate } from './domain/sites';
import { CommandsPage } from './pages/CommandsPage';
import { useCommandExecution } from './services/useCommandExecution';
import { ModeCard } from './components/ModeCard';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY, type Settings } from './services/settingsStorage';
import { useModeExecution } from './services/useModeExecution';
import { Palette } from './pages/Palette';
import { desktop, showPalette } from './services/windows';

type Page = 'home' | 'modes' | 'applications' | 'commands' | 'history' | 'voice' | 'settings';
const navigation: { id: Page; title: string; icon: LucideIcon }[] = [
  { id: 'home', title: 'Главная', icon: Home }, { id: 'modes', title: 'Режимы', icon: LayoutGrid },
  { id: 'applications', title: 'Моя библиотека', icon: Monitor },
  { id: 'commands', title: 'Команды', icon: Command }, { id: 'history', title: 'История', icon: Activity },
  { id: 'voice', title: 'Голос', icon: Mic }, { id: 'settings', title: 'Настройки', icon: Settings2 },
];
function isPage(value: unknown): value is Page { return navigation.some(item => item.id === value); }
function useSettings() {
  const [initial] = useState(() => { try { return loadSettings(localStorage); } catch { return { settings: freshSettings(), warning: 'Локальное хранилище недоступно.' }; } });
  const [settings, setSettings] = useState(initial.settings);
  const currentSettings = useRef(initial.settings);
  const [message, setMessage] = useState(initial.warning ?? '');
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) { const loaded = loadSettings(localStorage); currentSettings.current = loaded.settings; setSettings(loaded.settings); if (loaded.warning) setMessage(loaded.warning); }
    };
    let disposed = false; let unlisten: (() => void) | undefined;
    if (desktop) void listen('settings-changed', () => { const loaded = loadSettings(localStorage); currentSettings.current = loaded.settings; setSettings(loaded.settings); }).then(cleanup => { if (disposed) cleanup(); else unlisten = cleanup; }).catch(error => setMessage(`Синхронизация настроек недоступна: ${error}`));
    window.addEventListener('storage', onStorage);
    return () => { disposed = true; unlisten?.(); window.removeEventListener('storage', onStorage); };
  }, []);
  function update(value: Settings | ((current: Settings) => Settings)) {
    try { const next = typeof value === 'function' ? value(currentSettings.current) : value; saveSettings(localStorage, next); currentSettings.current = next; setSettings(next); setMessage('Настройки сохранены на этом устройстве.'); if (desktop) void emit('settings-changed').catch(error => setMessage(`Настройки сохранены, синхронизация недоступна: ${error}`)); return true; }
    catch { setMessage('Не удалось сохранить настройки. Проверьте доступ к локальному хранилищу.'); return false; }
  }
  return { settings, update, message, setMessage, getSettings: () => currentSettings.current };
}
export function App() {
  const params = new URLSearchParams(window.location.search);
  const palette = params.get('window') === 'palette';
  const initialPage = params.get('page');
  const [page, setPage] = useState<Page>(isPage(initialPage) ? initialPage : 'home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { settings, update, message, setMessage, getSettings } = useSettings();
  const execution = useCommandExecution(setMessage);
  const modeExecution = useModeExecution(result => update(current => ({ ...current, modes: current.modes.map(mode => mode.id === result.modeId ? { ...mode, lastRun: result } : mode) })), setMessage, getSettings, !palette);
  const selected = settings.modes.find(mode => mode.id === selectedId);
  const select = (mode: Mode) => { setSelectedId(mode.id); setPage('modes'); };
  const reportError = useCallback((error: unknown) => setMessage(error instanceof Error ? error.message : 'Операция недоступна.'), [setMessage]);
  useEffect(() => {
    if (!desktop || palette) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    listen<string>('navigate', event => { if (isPage(event.payload)) setPage(event.payload); })
      .then(unlisten => { if (disposed) unlisten(); else cleanup = unlisten; }).catch(reportError);
    return () => { disposed = true; cleanup?.(); };
  }, [palette, reportError]);
  if (palette) return <Palette settings={settings} runs={modeExecution.runs} onRun={id => { void modeExecution.run(id); }} message={message} notify={setMessage} reportError={reportError} />;
  const title = navigation.find(item => item.id === page)!.title;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><AudioLines size={23} /></span><div>Assistent<span className="text-accent">1</span><small>Ваш личный ритм</small></div></div>
      <div className="nav-label">Пространство</div>
      <nav aria-label="Основная навигация">{navigation.map(({ id, title: label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setSelectedId(null); }} aria-current={page === id ? 'page' : undefined}><Icon size={19} /><span>{label}</span>{page === id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="privacy"><ShieldCheck size={17} /><span>Локальное приложение<small>Без облачных API</small></span></div><div className="version">Assistent1 <span>v0.1.1</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Пространство <ChevronRight size={14} /><span>{title}</span></div><button className="palette-launch" onClick={() => { void showPalette().catch(reportError); }}><Search size={16} />Быстрая панель <kbd>Ctrl Alt Space</kbd></button></header>
      <main className="main-content">
        {page === 'home' && <>
          <div className="page-heading"><div><span className="eyebrow">Ваш компьютер. Ваши правила.</span><h1>Всё начинается с режима<span className="text-accent">.</span></h1><p>Соберите своё пространство для работы, игры и отдыха.</p></div><span className="pill"><span className="tiny-dot" /> Интерфейс готов</span></div>
          <section className="hero"><div><span className="hero-label"><Sparkles size={15} /> Меньше рутины, больше вашего</span><h2>Один режим.<br />Ваш привычный порядок.</h2><p>Настройте отдельные команды для приложений, сайтов и папок.<br className="desktop-break" /> Запускайте сохранённые действия из редактора режима.</p><button className="primary" onClick={() => setPage('modes')}>Мои режимы <ArrowRight size={16} /></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-center"><AudioLines size={46} strokeWidth={1.4} /></div><span className="orbit-icon orbit-game"><LayoutGrid size={19} /></span><span className="orbit-icon orbit-work"><Monitor size={19} /></span><span className="orbit-icon orbit-voice"><Mic size={19} /></span></div></section>
          <div className="section-heading"><h2>Ваши режимы <span>{settings.modes.length.toString().padStart(2, '0')}</span></h2><button className="text-button" onClick={() => setPage('modes')}>Все режимы <ArrowRight size={15} /></button></div>
          <div className="mode-grid">{settings.modes.map(mode => <ModeCard key={mode.id} mode={mode} onSelect={select} run={modeExecution.runs[mode.id] ?? mode.lastRun} onRun={() => { void modeExecution.run(mode.id); }} />)}</div>
          <div className="home-bottom"><button className="shortcut-card" onClick={() => { void showPalette().catch(reportError); }}><Keyboard size={22} /><div><strong>Всегда под рукой</strong><p>{desktop ? "Откройте быструю панель из любого приложения" : "В браузере панель открывается только кнопкой"}</p></div><kbd>Ctrl + Alt + Space</kbd></button><div className="voice-summary"><Mic size={21} /><div><strong>Голос — следующий шаг</strong><p>Локальное распознавание ещё не подключено</p></div></div></div>
        </>}
        {page === 'modes' && <><PageHeading title={selected?.name ?? 'Режимы'} description="Режимы — наборы действий. Запускайте включённые действия по порядку." />{!selected && <><div className="mode-grid">{settings.modes.map(mode => <ModeCard key={mode.id} mode={mode} onSelect={select} run={modeExecution.runs[mode.id] ?? mode.lastRun} onRun={() => { void modeExecution.run(mode.id); }} />)}</div><details className="new-mode-picker"><summary className="secondary"><Plus size={18} />Создать режим</summary><div className="action-type-picker">{(['game', 'work', 'rest', 'night'] as const).map(icon => <button className="secondary" key={icon} onClick={() => { const id = crypto.randomUUID(); const template = libraryModeTemplate(icon, id, settings.applications, settings.sites); const mode: Mode = { id, name: { game: 'Игра', work: 'Работа', rest: 'Отдых', night: 'Ночь' }[icon], description: '', phrase: '', icon, actions: template.actions }; if (update({ ...settings, modes: [...settings.modes, mode], sites: template.sites })) setSelectedId(id); }}>{ { game: 'Игра', work: 'Работа', rest: 'Отдых', night: 'Ночь' }[icon]}</button>)}</div></details></>}{selected && <ModeEditor key={selected.id} mode={selected} applications={settings.applications} sites={settings.sites} commands={settings.commands} run={modeExecution.runs[selected.id] ?? selected.lastRun} onRun={mode => { const current = getSettings(); const saved = { ...mode, name: mode.name.trim() }; const next = { ...current, modes: current.modes.map(item => item.id === mode.id ? { ...saved, ...(item.lastRun ? { lastRun: item.lastRun } : {}) } : item) }; if (update(next)) void modeExecution.run(mode.id); }} onLibrary={mode => { if (!update(current => ({ ...current, modes: current.modes.map(item => item.id === mode.id ? { ...mode, ...(item.lastRun ? { lastRun: item.lastRun } : {}) } : item) }))) return false; setPage('applications'); return true; }} onAdd={(mode, item) => { const next = addLibraryAction(settings, mode, item, crypto.randomUUID()); return update(next.settings) ? next.mode : null; }} onTemplate={mode => { const template = libraryModeTemplate(mode.icon, mode.id, settings.applications, settings.sites); return update({ ...settings, sites: template.sites }) ? template.actions : null; }} onClose={() => setSelectedId(null)} onSave={mode => update(current => ({ ...current, modes: current.modes.map(item => item.id === mode.id ? { ...mode, ...(item.lastRun ? { lastRun: item.lastRun } : {}) } : item) }))} />}</>}
        {page === 'applications' && <>{selectedId && <button className="secondary mb-6" onClick={() => setPage('modes')}>Вернуться в режим</button>}<PageHeading title="Моя библиотека" description="Храните приложения и сайты здесь, выбирайте их в любых режимах." /><LibraryPage applications={settings.applications} sites={settings.sites} modes={settings.modes} onApplications={applications => update({ ...settings, applications })} onSites={sites => update({ ...settings, sites })} onDelete={(kind, id) => update({ ...settings, applications: kind === 'application' ? settings.applications.filter(app => app.id !== id) : settings.applications, sites: kind === 'site' ? settings.sites.filter(site => site.id !== id) : settings.sites, modes: removeLibraryActions(settings.modes, kind, id) })} /></>}
        {page === 'commands' && <><PageHeading title="Команды" description="Самостоятельные действия для запуска из командной палитры." /><CommandsPage applications={settings.applications} sites={settings.sites} commands={settings.commands} modes={settings.modes} onSave={(commands, applications, sites) => update({ ...settings, commands, applications, sites, modes: removeCommandActions(settings.modes, new Set(commands.map(command => command.id))) })} onRun={command => { void execution.run(command); }} busy={execution.busy} /></>}
        {page === 'history' && <><PageHeading title="История" description="Здесь будут результаты выполнения команд." /><EmptyState icon={Activity} title="Пока без событий" text="История выполнения пока не записывается. Журнал появится вместе с движком режимов." /></>}
        {page === 'voice' && <><PageHeading title="Голос" description="Ассистент, который будет понимать вас без облака." /><section className="panel voice-panel"><span className="large-icon"><Mic size={30} /></span><span className="badge">В разработке · Этап 6</span><h2>Ваш голос останется на устройстве</h2><p>Планируется локальное распознавание русской речи, например Vosk.<br />Микрофон сейчас не используется.</p><button className="primary" disabled>Распознавание не подключено</button></section><div className="settings-grid"><InfoCard title="Язык" text="Русский · планируется" icon={AudioLines} /><InfoCard title="Фраза активации" text="Будет доступна на этапе 7" icon={Mic} /></div></>}
        {page === 'settings' && <><PageHeading title="Настройки" description="Простые настройки, прозрачные возможности." /><section className="panel"><h2>Интерфейс</h2><div className="setting-row"><div><strong>Тема Graphite Purple</strong><p>Тёмная палитра с мягким фиолетовым акцентом</p></div><span className="badge"><Check size={13} />Включена</span></div><div className="setting-row"><div><strong>Подсказки в быстрой панели</strong><p>Показывать примеры доступных команд</p></div><button className={`toggle ${settings.compactHints ? 'on' : ''}`} role="switch" aria-checked={settings.compactHints} aria-label="Подсказки в быстрой панели" onClick={() => update({ ...settings, compactHints: !settings.compactHints })}><span /></button></div></section><section className="panel"><h2>Windows и данные</h2><div className="setting-row"><div><strong>Быстрая панель</strong><p>{desktop ? 'Глобальная горячая клавиша в Tauri' : 'В браузере доступно только открытие кнопкой'}</p></div><kbd>Ctrl + Alt + Space</kbd></div><div className="setting-row"><div><strong>Автозапуск Windows</strong><p>Будет добавлен на этапе 5</p></div><span className="badge">Недоступно</span></div><div className="setting-row"><div><strong>Хранение настроек</strong><p>Локальное хранилище WebView · версия схемы 4</p></div><ShieldCheck size={20} className="text-accent" /></div></section></>}
        <footer className="page-footer"><span>Создано для вашего ритма</span><span>Локально. Спокойно. Под вашим контролем.</span></footer>
      </main>
    </div>
    {message && <div className="toast" role="status"><span>{message}</span><button className="icon-button" aria-label="Закрыть уведомление" onClick={() => setMessage('')}><X size={16} /></button></div>}
  </div>;
}
function PageHeading({ title, description }: { title: string; description: string }) { return <div className="page-heading"><div><span className="eyebrow">Assistent1 / Ваше пространство</span><h1>{title}</h1><p>{description}</p></div></div>; }
function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <section className="panel empty-state"><span className="large-icon"><Icon size={28} /></span><h2>{title}</h2><p>{text}</p></section>; }
function InfoCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <section className="panel info-card"><Icon size={21} /><div><h3>{title}</h3><p>{text}</p></div></section>; }
