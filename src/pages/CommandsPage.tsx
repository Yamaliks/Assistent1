import { useState, type FormEvent } from 'react';
import { FolderOpen, Globe, MoreHorizontal, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { normalizeCommand, targetError, type LaunchKind, type UserCommand } from '../domain/commands';
import { applicationName, type ApplicationConfig } from '../domain/applications';
import type { Site } from '../domain/sites';
import type { Mode } from '../domain/modes';
import { commandLibrary, duplicateApplication, duplicateSite, normalizeExe, normalizeUrl } from '../services/libraryEditing';
import { pickApplicationExe } from '../services/applicationPicker';
import { desktop } from '../services/windows';

export const commandIcons = { program: Play, website: Globe, folder: FolderOpen };
export const commandLabels = { program: 'Открыть приложение', website: 'Открыть сайт', folder: 'Открыть папку' };
export function CommandsPage({ commands, modes, applications, sites, onSave, onRun, busy }: {
  commands: UserCommand[]; modes: Mode[]; applications: ApplicationConfig[]; sites: Site[];
  onSave: (commands: UserCommand[], applications: ApplicationConfig[], sites: Site[]) => boolean;
  onRun: (command: UserCommand) => void; busy: boolean;
}) {
  const [draft, setDraft] = useState<UserCommand | null>(null);
  const [error, setError] = useState(''); const [removeId, setRemoveId] = useState<string | null>(null);
  const [includeLibrary, setIncludeLibrary] = useState(false); const [picking, setPicking] = useState(false);
  function edit(command?: UserCommand) {
    setError(''); setRemoveId(null); setIncludeLibrary(false);
    setDraft(command ? { ...command } : { id: crypto.randomUUID(), name: '', phrase: '', kind: 'program', target: '' });
  }
  async function chooseExe() {
    setPicking(true); setError('');
    try { const path = await pickApplicationExe(); if (path !== null) setDraft(current => current ? { ...current, target: path } : current); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setPicking(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    const next = { ...draft, name: draft.name.trim(), phrase: draft.phrase.trim(), target: draft.target.trim() };
    const invalid = targetError(next.kind, next.target);
    if (!next.name || invalid) { setError(invalid ?? 'Укажите название'); return; }
    const aliases = [next.name, next.phrase].filter(Boolean).map(normalizeCommand);
    const occupied = ['настройки', 'режимы', 'команды', ...modes.flatMap(mode => [mode.name, mode.phrase]), ...commands.filter(item => item.id !== next.id).flatMap(item => [item.name, item.phrase])].filter(Boolean).map(normalizeCommand);
    if (aliases.some(alias => occupied.includes(alias))) { setError('Название или фраза уже используются. Выберите другое название.'); return; }
    const library = commandLibrary({ applications, sites }, next, includeLibrary, crypto.randomUUID());
    if (onSave(commands.some(item => item.id === next.id) ? commands.map(item => item.id === next.id ? next : item) : [...commands, next], library.applications, library.sites)) setDraft(null);
  }
  const libraryMatch = !draft ? undefined : draft.kind === 'program'
    ? duplicateApplication(applications, { id: '', path: draft.target.trim(), useDefaultBrowser: false })
    : draft.kind === 'website' ? duplicateSite(sites, { id: '', name: draft.name, url: draft.target }) : undefined;
  const selectedId = !draft ? '' : draft.kind === 'program'
    ? applications.find(app => app.path && normalizeExe(app.path) === normalizeExe(draft.target))?.id ?? ''
    : sites.find(site => site.url && normalizeUrl(site.url) === normalizeUrl(draft.target))?.id ?? '';
  return <>
    <div className="editor-toolbar"><p className="editor-intro">Команды работают самостоятельно. Введите название в быстрой панели или нажмите «Запустить».</p><button className="primary" onClick={() => edit()}><Plus size={18} />Создать команду</button></div>
    {!desktop && <p className="field-help">Запуск и выбор EXE доступны в Windows-приложении. Здесь можно настроить команды вручную.</p>}
    {removeId && <div className="notice confirmation" role="alert"><p>Удалить команду? Программы и файлы не затрагиваются. {modes.some(mode => mode.actions.some(action => action.kind === 'command' && action.commandId === removeId)) && 'Она используется в режимах: связанные действия тоже будут удалены.'}</p><div className="form-actions"><button className="secondary" onClick={() => setRemoveId(null)}>Отмена</button><button className="primary" onClick={() => { if (onSave(commands.filter(item => item.id !== removeId), applications, sites)) setRemoveId(null); }}>Удалить</button></div></div>}
    {draft && <section className="panel command-editor"><h2>{commands.some(item => item.id === draft.id) ? 'Изменить команду' : 'Новая команда'}</h2><form onSubmit={submit}>
      <div className="form-grid"><label>Название<input autoFocus required maxLength={48} value={draft.name} placeholder="Например: Открой музыку" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Действие<select value={draft.kind} onChange={e => { setDraft({ ...draft, kind: e.target.value as LaunchKind, target: '' }); setIncludeLibrary(false); }}>{Object.entries(commandLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
      {draft.kind !== 'folder' && <label className="full-width">{draft.kind === 'program' ? 'Приложение из моей библиотеки' : 'Сайт из моей библиотеки'}<select value={selectedId} onChange={e => { const item = draft.kind === 'program' ? applications.find(app => app.id === e.target.value) : sites.find(site => site.id === e.target.value); setDraft({ ...draft, target: item ? 'path' in item ? item.path : item.url : '' }); setIncludeLibrary(false); }}><option value="">{draft.kind === 'program' ? 'Или выберите EXE ниже' : 'Или укажите адрес ниже'}</option>{draft.kind === 'program' ? applications.map(app => <option key={app.id} value={app.id} disabled={!app.path}>{applicationName(app)}{!app.path ? ' — путь не настроен' : ''}</option>) : sites.map(site => <option key={site.id} value={site.id} disabled={!site.url}>{site.name}</option>)}</select></label>}
      <label className="full-width">{draft.kind === 'website' ? 'Адрес сайта' : draft.kind === 'folder' ? 'Путь к папке Windows' : 'EXE-файл'}<div className="path-input-row"><input required maxLength={4096} spellCheck={false} value={draft.target} placeholder={draft.kind === 'website' ? 'https://example.com' : 'Полный путь Windows'} onChange={e => setDraft({ ...draft, target: e.target.value })} />{draft.kind === 'program' && <button type="button" className="secondary" disabled={!desktop || picking} onClick={() => { void chooseExe(); }}><FolderOpen size={16} />Выбрать EXE</button>}</div></label></div>
      {draft.kind !== 'folder' && <>{libraryMatch ? <p className="field-help">Элемент уже есть в библиотеке: «{'path' in libraryMatch ? applicationName(libraryMatch) : libraryMatch.name}». Копия не создаётся.</p> : <label className="checkbox-label mt-4"><input type="checkbox" checked={includeLibrary} onChange={e => setIncludeLibrary(e.target.checked)} />Также сохранить в моей библиотеке</label>}</>}
      <details className="advanced"><summary>Дополнительно</summary><label>Другая фраза для командной палитры<input maxLength={100} value={draft.phrase} onChange={e => setDraft({ ...draft, phrase: e.target.value })} /></label><p className="field-help">EXE запускается без аргументов. Существование пути проверяется при запуске.</p></details>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions mt-4"><button type="button" className="secondary" disabled={picking} onClick={() => setDraft(null)}>Отмена</button><button className="primary" disabled={picking}>Сохранить команду</button></div>
    </form></section>}
    {!commands.length && <section className="panel"><p>Команд пока нет. Создайте первую — режим для этого не нужен.</p></section>}
    <div className="action-stack">{commands.map(command => { const Icon = commandIcons[command.kind]; return <section className="action-card" key={command.id}><div className="action-card-header"><div className="action-title"><span className="mode-icon"><Icon size={20} /></span><div><h3>{command.name}</h3><p>{commandLabels[command.kind]}</p></div></div><details className="action-menu"><summary aria-label={`Действия команды ${command.name}`}><MoreHorizontal size={20} /></summary><div className="action-menu-items"><button onClick={() => edit(command)}><Pencil size={16} />Изменить</button><button className="danger" onClick={() => { setRemoveId(command.id); setDraft(null); }}><Trash2 size={16} />Удалить</button></div></details></div><div className="action-config-row"><span className="path-preview" title={command.target}>{command.kind === 'website' ? command.target : command.target.split(/[\\/]/).pop()}</span><button className="secondary" disabled={busy} onClick={() => onRun(command)}><Play size={16} />Запустить</button></div></section>; })}</div>
  </>;
}
