import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Activity, ArrowRight, AudioLines, Check, ChevronRight, Command, Home, Keyboard, LayoutGrid, Mic, Monitor, Plus, Search, Settings2, ShieldCheck, Sparkles, X, type LucideIcon } from 'lucide-react';
import { modeTemplate, removeCommandActions, type Mode } from './domain/modes';
import { ModeEditor } from './pages/ModeEditor';
import type { UserCommand } from './domain/commands';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { CommandsPage, commandIcons, commandLabels } from './pages/CommandsPage';
import { useCommandExecution } from './services/useCommandExecution';
import { ModeCard, modeIcons } from './components/ModeCard';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY, type Settings } from './services/settingsStorage';
import { routeCommand } from './services/commandRouter';
import { planMode } from './services/modeEngine';
import { desktop, hidePalette, showMain, showPalette } from './services/windows';

type Page = 'home' | 'modes' | 'applications' | 'commands' | 'history' | 'voice' | 'settings';
const navigation: { id: Page; title: string; icon: LucideIcon }[] = [
  { id: 'home', title: 'Главная', icon: Home }, { id: 'modes', title: 'Режимы', icon: LayoutGrid },
  { id: 'applications', title: 'Приложения', icon: Monitor },
  { id: 'commands', title: 'Команды', icon: Command }, { id: 'history', title: 'История', icon: Activity },
  { id: 'voice', title: 'Голос', icon: Mic }, { id: 'settings', title: 'Настройки', icon: Settings2 },
];
function isPage(value: unknown): value is Page { return navigation.some(item => item.id === value); }
function useSettings() {
  const [initial] = useState(() => { try { return loadSettings(localStorage); } catch { return { settings: freshSettings(), warning: 'Локальное хранилище недоступно.' }; } });
  const [settings, setSettings] = useState(initial.settings);
  const [message, setMessage] = useState(initial.warning ?? '');
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) { const loaded = loadSettings(localStorage); setSettings(loaded.settings); if (loaded.warning) setMessage(loaded.warning); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  function update(next: Settings) {
    try { saveSettings(localStorage, next); setSettings(next); setMessage('Настройки сохранены на этом устройстве.'); return true; }
    catch { setMessage('Не удалось сохранить настройки. Проверьте доступ к локальному хранилищу.'); return false; }
  }
  return { settings, update, message, setMessage };
}
export function App() {
  const params = new URLSearchParams(window.location.search);
  const palette = params.get('window') === 'palette';
  const initialPage = params.get('page');
  const [page, setPage] = useState<Page>(isPage(initialPage) ? initialPage : 'home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { settings, update, message, setMessage } = useSettings();
  const execution = useCommandExecution(setMessage);
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
  if (palette) return <Palette modes={settings.modes} commands={settings.commands} hints={settings.compactHints} message={message} notify={setMessage} reportError={reportError} />;
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
          <section className="hero"><div><span className="hero-label"><Sparkles size={15} /> Меньше рутины, больше вашего</span><h2>Один режим.<br />Ваш привычный порядок.</h2><p>Настройте отдельные команды для приложений, сайтов и папок.<br className="desktop-break" /> Переключение режимов появится на следующем этапе.</p><button className="primary" onClick={() => setPage('modes')}>Мои режимы <ArrowRight size={16} /></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-center"><AudioLines size={46} strokeWidth={1.4} /></div><span className="orbit-icon orbit-game"><LayoutGrid size={19} /></span><span className="orbit-icon orbit-work"><Monitor size={19} /></span><span className="orbit-icon orbit-voice"><Mic size={19} /></span></div></section>
          <div className="section-heading"><h2>Ваши режимы <span>{settings.modes.length.toString().padStart(2, '0')}</span></h2><button className="text-button" onClick={() => setPage('modes')}>Все режимы <ArrowRight size={15} /></button></div>
          <div className="mode-grid">{settings.modes.map(mode => <ModeCard key={mode.id} mode={mode} onSelect={select} />)}</div>
          <div className="home-bottom"><button className="shortcut-card" onClick={() => { void showPalette().catch(reportError); }}><Keyboard size={22} /><div><strong>Всегда под рукой</strong><p>{desktop ? "Откройте быструю панель из любого приложения" : "В браузере панель открывается только кнопкой"}</p></div><kbd>Ctrl + Alt + Space</kbd></button><div className="voice-summary"><Mic size={21} /><div><strong>Голос — следующий шаг</strong><p>Локальное распознавание ещё не подключено</p></div></div></div>
        </>}
        {page === 'modes' && <><PageHeading title={selected?.name ?? 'Режимы'} description="Выберите режим и настройте приложения под себя." />{!selected && <><div className="mode-grid">{settings.modes.map(mode => <ModeCard key={mode.id} mode={mode} onSelect={select} />)}</div><details className="new-mode-picker"><summary className="secondary"><Plus size={18} />Создать режим</summary><div className="action-type-picker">{(['game', 'work', 'rest', 'night'] as const).map(icon => <button className="secondary" key={icon} onClick={() => { const id = crypto.randomUUID(); const mode: Mode = { id, name: { game: 'Игра', work: 'Работа', rest: 'Отдых', night: 'Ночь' }[icon], description: '', phrase: '', icon, actions: modeTemplate(icon, id) }; if (update({ ...settings, modes: [...settings.modes, mode] })) setSelectedId(id); }}>{ { game: 'Игра', work: 'Работа', rest: 'Отдых', night: 'Ночь' }[icon]}</button>)}</div></details></>}{selected && <ModeEditor key={selected.id} mode={selected} applications={settings.applications} commands={settings.commands} onApplications={applications => update({ ...settings, applications })} onClose={() => setSelectedId(null)} onSave={mode => update({ ...settings, modes: settings.modes.map(item => item.id === mode.id ? mode : item) })} />}</>}
        {page === 'applications' && <><PageHeading title="Приложения" description="Настройте приложения для будущих режимов." /><ApplicationsPage applications={settings.applications} onSave={applications => update({ ...settings, applications })} /></>}
        {page === 'commands' && <><PageHeading title="Команды" description="Приложения, сайты и папки — по вашему запросу." /><CommandsPage commands={settings.commands} modes={settings.modes} onSave={commands => update({ ...settings, commands, modes: removeCommandActions(settings.modes, new Set(commands.map(command => command.id))) })} onRun={command => { void execution.run(command); }} busy={execution.busy} /></>}
        {page === 'history' && <><PageHeading title="История" description="Здесь будут результаты выполнения команд." /><EmptyState icon={Activity} title="Пока без событий" text="История выполнения пока не записывается. Журнал появится вместе с движком режимов." /></>}
        {page === 'voice' && <><PageHeading title="Голос" description="Ассистент, который будет понимать вас без облака." /><section className="panel voice-panel"><span className="large-icon"><Mic size={30} /></span><span className="badge">В разработке · Этап 6</span><h2>Ваш голос останется на устройстве</h2><p>Планируется локальное распознавание русской речи, например Vosk.<br />Микрофон сейчас не используется.</p><button className="primary" disabled>Распознавание не подключено</button></section><div className="settings-grid"><InfoCard title="Язык" text="Русский · планируется" icon={AudioLines} /><InfoCard title="Фраза активации" text="Будет доступна на этапе 7" icon={Mic} /></div></>}
        {page === 'settings' && <><PageHeading title="Настройки" description="Простые настройки, прозрачные возможности." /><section className="panel"><h2>Интерфейс</h2><div className="setting-row"><div><strong>Тема Graphite Purple</strong><p>Тёмная палитра с мягким фиолетовым акцентом</p></div><span className="badge"><Check size={13} />Включена</span></div><div className="setting-row"><div><strong>Подсказки в быстрой панели</strong><p>Показывать примеры доступных команд</p></div><button className={`toggle ${settings.compactHints ? 'on' : ''}`} role="switch" aria-checked={settings.compactHints} aria-label="Подсказки в быстрой панели" onClick={() => update({ ...settings, compactHints: !settings.compactHints })}><span /></button></div></section><section className="panel"><h2>Windows и данные</h2><div className="setting-row"><div><strong>Быстрая панель</strong><p>{desktop ? 'Глобальная горячая клавиша в Tauri' : 'В браузере доступно только открытие кнопкой'}</p></div><kbd>Ctrl + Alt + Space</kbd></div><div className="setting-row"><div><strong>Автозапуск Windows</strong><p>Будет добавлен на этапе 5</p></div><span className="badge">Недоступно</span></div><div className="setting-row"><div><strong>Хранение настроек</strong><p>Локальное хранилище WebView · версия схемы 3</p></div><ShieldCheck size={20} className="text-accent" /></div></section></>}
        <footer className="page-footer"><span>Создано для вашего ритма</span><span>Локально. Спокойно. Под вашим контролем.</span></footer>
      </main>
    </div>
    {message && <div className="toast" role="status"><span>{message}</span><button className="icon-button" aria-label="Закрыть уведомление" onClick={() => setMessage('')}><X size={16} /></button></div>}
  </div>;
}
function PageHeading({ title, description }: { title: string; description: string }) { return <div className="page-heading"><div><span className="eyebrow">Assistent1 / Ваше пространство</span><h1>{title}</h1><p>{description}</p></div></div>; }
function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <section className="panel empty-state"><span className="large-icon"><Icon size={28} /></span><h2>{title}</h2><p>{text}</p></section>; }
function InfoCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <section className="panel info-card"><Icon size={21} /><div><h3>{title}</h3><p>{text}</p></div></section>; }
function Palette({ modes, commands, hints, message, notify, reportError }: { modes: Mode[]; commands: UserCommand[]; hints: boolean; message: string; notify: (message: string) => void; reportError: (error: unknown) => void }) {
  const [query, setQuery] = useState('');
  const execution = useCommandExecution(notify);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { void hidePalette().catch(reportError); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [reportError]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (execution.busy) return;
    const command = routeCommand(query, modes, commands);
    if (command.kind === 'action') { const action = commands.find(item => item.id === command.commandId); if (action) void execution.run(action); }
    else if (command.kind === 'mode') notify(planMode(modes.find(mode => mode.id === command.modeId)!).message);
    else if (command.kind === 'navigate') { void showMain(command.page).then(hidePalette).catch(reportError); }
    else if (command.kind === 'ambiguous') notify('Найдено несколько совпадений. Выберите карточку команды или измените её фразу.');
    else notify('Команда не найдена. Введите название или фразу сохранённой команды.');
  };
  const filteredCommands = commands.filter(command => `${command.name} ${command.phrase}`.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));
  const filtered = modes.filter(mode => `${mode.name} ${mode.phrase}`.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));
  return <div className="palette-shell"><header className="palette-header"><div className="palette-drag" data-tauri-drag-region><span className="brand-mark small"><AudioLines size={18} /></span><strong>Assistent1</strong><span className="badge">Быстрая панель</span></div><button className="icon-button" aria-label="Скрыть панель" onClick={() => { void hidePalette().catch(reportError); }}><X size={18} /></button></header><form className="palette-input" onSubmit={submit}><Search size={22} /><input autoFocus aria-label="Команда" placeholder="Что хотите сделать?" value={query} onChange={e => setQuery(e.target.value)} /><button className="icon-button" aria-label="Найти команду"><ArrowRight size={19} /></button></form><div className="palette-body"><div className="palette-section-title">КОМАНДЫ <span>{execution.busy ? 'Выполняется…' : desktop ? 'Windows' : 'Запуск только в Tauri'}</span></div><div className="palette-modes">{filteredCommands.map(command => { const Icon = commandIcons[command.kind]; return <button key={command.id} disabled={execution.busy} onClick={() => { void execution.run(command); }}><span className="mode-icon"><Icon size={20} /></span><span><strong>{command.name}</strong><small>{commandLabels[command.kind]}</small></span><ChevronRight size={15} /></button>; })}</div>{!filteredCommands.length && <p className="palette-hint">Нет команд. Добавьте их в разделе «Команды».</p>}<div className="palette-section-title palette-mode-title">ВАШИ РЕЖИМЫ <span>Просмотр</span></div><div className="palette-modes">{filtered.map(mode => { const Icon = modeIcons[mode.icon]; return <button key={mode.id} onClick={() => notify(planMode(mode).message)}><span className={`mode-icon ${mode.icon}`}><Icon size={20} /></span><span><strong>{mode.name}</strong><small>{mode.actions.length ? `${mode.actions.length} действий · черновик` : 'Не настроен'}</small></span><ChevronRight size={15} /></button>; })}</div>{!filtered.length && <p className="text-muted">Режимы не найдены.</p>}{hints && <p className="palette-hint">Введите название или фразу команды. Режимы — только просмотр; голос пока недоступен.</p>}{message && <p className="palette-message" role="status">{message}</p>}</div><footer className="palette-footer"><span><span className="tiny-dot" /> {execution.busy ? "Отправка запроса" : "Готов к вводу"}</span><button className="text-button" onClick={() => { void showMain().then(hidePalette).catch(reportError); }}>Открыть приложение <ArrowUpRightIcon /></button><kbd>Esc</kbd></footer></div>;
}
function ArrowUpRightIcon() { return <ArrowRight size={14} className="-rotate-45" />; }
