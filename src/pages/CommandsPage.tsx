import { useState, type FormEvent } from 'react';
import { Command, FolderOpen, Globe, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { normalizeCommand, targetError, type LaunchKind, type UserCommand } from '../domain/commands';
import type { Mode } from '../domain/modes';
import { desktop } from '../services/windows';

export const commandIcons = { program: Play, website: Globe, folder: FolderOpen };
export const commandLabels = { program: 'Приложение EXE', website: 'Сайт', folder: 'Папка' };
export function CommandsPage({ commands, modes, onSave, onRun, busy }: {
  commands: UserCommand[]; modes: Mode[]; onSave: (commands: UserCommand[]) => boolean;
  onRun: (command: UserCommand) => void; busy: boolean;
}) {
  const [draft, setDraft] = useState<UserCommand | null>(null);
  const [error, setError] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  function edit(command?: UserCommand) {
    setError(''); setRemoveId(null);
    setDraft(command ? { ...command } : { id: crypto.randomUUID(), name: '', phrase: '', kind: 'program', target: '' });
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    const next = { ...draft, name: draft.name.trim(), phrase: draft.phrase.trim(), target: draft.target.trim() };
    const invalid = targetError(next.kind, next.target);
    if (!next.name || invalid) { setError(invalid ?? 'Укажите название'); return; }
    const aliases = [next.name, next.phrase].filter(Boolean).map(normalizeCommand);
    const occupied = ['настройки', 'режимы', 'команды', ...modes.flatMap(mode => [mode.name, mode.phrase]), ...commands.filter(item => item.id !== next.id).flatMap(item => [item.name, item.phrase])].filter(Boolean).map(normalizeCommand);
    if (aliases.some(alias => occupied.includes(alias))) { setError('Название или фраза уже используются другой командой, режимом или навигацией.'); return; }
    if (onSave(commands.some(item => item.id === next.id) ? commands.map(item => item.id === next.id ? next : item) : [...commands, next])) setDraft(null);
  }
  return <>
    <section className="panel">
      <div className="section-heading"><h2>Пользовательские команды</h2><button className="primary" onClick={() => edit()}><Plus size={16} />Добавить команду</button></div>
      <p>Одна команда — одно действие. Название и фразу можно ввести в быстрой панели.</p>
      {!desktop && <div className="notice">В браузере можно настроить команды. Запуск доступен только в Windows-приложении.</div>}
      {!commands.length && <p className="commands-empty">Команд пока нет. Добавьте путь к установленному EXE, сайт или локальную папку.</p>}
      <div className="user-command-list">{commands.map(command => { const Icon = commandIcons[command.kind]; return <div className="user-command" key={command.id}>
        <span className="mode-icon"><Icon size={20} /></span><div className="command-details"><strong>{command.name}</strong><span>{command.target}</span><small>{command.phrase || commandLabels[command.kind]}</small></div>
        <button className="icon-button" aria-label={`Выполнить ${command.name}`} disabled={busy} onClick={() => onRun(command)}><Play size={17} /></button>
        <button className="icon-button" aria-label={`Изменить ${command.name}`} onClick={() => edit(command)}><Pencil size={17} /></button>
        <button className="icon-button" aria-label={`Удалить ${command.name}`} onClick={() => { setRemoveId(command.id); setDraft(null); }}><Trash2 size={17} /></button>
      </div>; })}</div>
      {removeId && <div className="notice" role="alert"><span>Удалить сохранённую команду? Программы и файлы не затрагиваются. {modes.some(mode => mode.actions.some(action => action.kind === 'command' && action.commandId === removeId)) && 'Команда используется в режимах: связанные действия тоже будут удалены.'}</span><button className="secondary" onClick={() => setRemoveId(null)}>Отмена</button><button className="primary" onClick={() => { if (onSave(commands.filter(item => item.id !== removeId))) setRemoveId(null); }}>Удалить команду</button></div>}
    </section>
    {draft && <section className="panel editor"><h2>{commands.some(item => item.id === draft.id) ? 'Изменить команду' : 'Новая команда'}</h2><form onSubmit={submit}>
      <div className="form-grid"><label>Название команды<input required maxLength={48} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Тип действия<select aria-label="Тип действия" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as LaunchKind, target: '' })}>{Object.entries(commandLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label className="full-width">{draft.kind === 'website' ? 'Адрес сайта' : 'Полный путь Windows'}<input required maxLength={4096} spellCheck={false} value={draft.target} placeholder={draft.kind === 'website' ? 'https://example.com' : draft.kind === 'program' ? 'C:\\Apps\\App.exe' : 'C:\\Users\\Имя\\Documents'} onChange={e => setDraft({ ...draft, target: e.target.value })} /></label>
        <label className="full-width">Фраза команды (необязательно)<input maxLength={100} value={draft.phrase} placeholder="Например: открой документы" onChange={e => setDraft({ ...draft, phrase: e.target.value })} /></label>
      </div><p className="command-help">EXE запускается без аргументов; сайты — через браузер по умолчанию, папки — через Windows. Существование пути проверяется при запуске.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setDraft(null)}>Отмена</button><button className="primary">Сохранить команду</button></div>
    </form></section>}
    <section className="panel"><h2>Режимы — пока просмотр</h2><div className="command-list">{modes.map(mode => <div key={mode.id}><span className="command-key"><Command size={16} />{mode.name}</span><span>{mode.phrase || 'Фраза не задана'}</span><span className="badge">Просмотр</span></div>)}</div></section>
  </>;
}
