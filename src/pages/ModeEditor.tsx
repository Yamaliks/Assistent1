import { useState } from 'react';
import { ArrowDown, ArrowUp, Command, FolderOpen, Globe, Monitor, Plus, Settings2, Trash2, X } from 'lucide-react';
import { applicationName, type ApplicationConfig } from '../domain/applications';
import { targetError, type UserCommand } from '../domain/commands';
import { moveAction, type Mode, type ModeAction } from '../domain/modes';
import { ApplicationEditor } from './ApplicationsPage';

export function ModeEditor({ mode, applications, commands, onApplications, onSave, onClose }: {
  mode: Mode; applications: ApplicationConfig[]; commands: UserCommand[];
  onApplications: (apps: ApplicationConfig[]) => boolean; onSave: (mode: Mode) => boolean; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(mode));
  const [kind, setKind] = useState<'application' | 'website' | 'folder' | 'command'>('application');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const change = (id: string, patch: Partial<ModeAction>) => setDraft(current => ({ ...current, actions: current.actions.map(action => action.id === id ? { ...action, ...patch } as ModeAction : action) }));
  function add() {
    const base = { id: crypto.randomUUID(), label: '', active: true };
    let action: ModeAction;
    if (kind === 'application') action = { ...base, kind, applicationId: applications[0].id };
    else if (kind === 'command') {
      if (!commands.length) { setError('Сначала создайте команду в разделе «Команды».'); return; }
      action = { ...base, kind, commandId: commands[0].id };
    } else if (kind === 'website') action = { ...base, kind, label: 'Новый сайт', url: '' };
    else action = { ...base, kind, label: 'Новая папка', path: '' };
    setDraft(current => ({ ...current, actions: [...current.actions, action] })); setError('');
  }
  function addApplication(actionId: string) {
    if (!newName.trim()) { setError('Укажите название нового приложения.'); return; }
    const app: ApplicationConfig = { id: crypto.randomUUID(), name: newName.trim(), path: '', useDefaultBrowser: false };
    if (onApplications([...applications, app])) { change(actionId, { applicationId: app.id }); setNewName(''); setError(''); }
  }
  function save() {
    for (const action of draft.actions) {
      const invalid = action.kind === 'website' ? targetError('website', action.url) : action.kind === 'folder' ? targetError('folder', action.path) : undefined;
      if (invalid || (['website', 'folder'].includes(action.kind) && !action.label.trim())) { setError(invalid ?? 'Укажите название действия.'); return; }
    }
    if (onSave({ ...draft, name: draft.name.trim() })) onClose();
  }
  return <section className="panel editor"><div className="section-heading"><h2>Настройки режима</h2><button className="icon-button" aria-label="Закрыть редактор" onClick={onClose}><X size={18} /></button></div>
    <div className="form-grid"><label>Название<input maxLength={48} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Иконка<select value={draft.icon} onChange={e => setDraft({ ...draft, icon: e.target.value as Mode['icon'] })}><option value="game">Игра</option><option value="work">Работа</option><option value="rest">Отдых</option><option value="night">Ночь</option></select></label><label className="full-width">Описание<input maxLength={120} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><label className="full-width">Фраза для ввода в панели<input maxLength={100} value={draft.phrase} onChange={e => setDraft({ ...draft, phrase: e.target.value })} /></label></div>
    <p className="notice mt-4">Редактор действий. Выполнение целого режима пока недоступно. Пути приложений сохраняются отдельно и сразу обновляются во всех режимах.</p>
    {!draft.actions.length && <p className="text-muted">Действий пока нет. Добавьте нужные для этого режима.</p>}
    {draft.actions.map((action, index) => {
      const app = action.kind === 'application' ? applications.find(app => app.id === action.applicationId) : undefined;
      const command = action.kind === 'command' ? commands.find(command => command.id === action.commandId) : undefined;
      const title = app ? applicationName(app) : command?.name ?? action.label;
      const Icon = action.kind === 'application' ? Monitor : action.kind === 'website' ? Globe : action.kind === 'folder' ? FolderOpen : action.kind === 'command' ? Command : Settings2;
      return <section className="panel mt-4" key={action.id}>
        <div className="flex flex-wrap items-center gap-3 mb-4"><Icon size={20} className="text-accent" /><strong className="flex-1">{index + 1}. {title || 'Действие'}</strong>
          <button type="button" className={`toggle ${action.active !== false ? 'on' : ''}`} role="switch" aria-label={`Активность ${title}`} aria-checked={action.active !== false} onClick={() => change(action.id, { active: action.active === false })}><span /></button>
          <button className="icon-button" aria-label={`Вверх ${title}`} disabled={index === 0} onClick={() => setDraft({ ...draft, actions: moveAction(draft.actions, action.id, -1) })}><ArrowUp size={17} /></button>
          <button className="icon-button" aria-label={`Вниз ${title}`} disabled={index === draft.actions.length - 1} onClick={() => setDraft({ ...draft, actions: moveAction(draft.actions, action.id, 1) })}><ArrowDown size={17} /></button>
          <button className="icon-button" aria-label={`Удалить ${title}`} onClick={() => setDraft({ ...draft, actions: draft.actions.filter(item => item.id !== action.id) })}><Trash2 size={17} /></button>
        </div>
        {action.kind === 'application' && <>
          <label className="text-sm text-muted">Приложение<select className="mt-2 mb-4" value={action.applicationId} onChange={e => change(action.id, { applicationId: e.target.value })}>{applications.map(app => <option key={app.id} value={app.id}>{applicationName(app)}</option>)}</select></label>
          {app && <ApplicationEditor key={`${app.id}:${app.path}:${app.useDefaultBrowser}`} app={app} name={applicationName(app)} onSave={next => onApplications(applications.map(item => item.id === app.id ? next : item))} />}
          <details><summary className="text-muted cursor-pointer">Добавить новое приложение</summary><div className="flex gap-2 mt-3"><input aria-label="Название нового приложения" maxLength={48} value={newName} onChange={e => setNewName(e.target.value)} /><button className="secondary" onClick={() => addApplication(action.id)}>Добавить</button></div></details>
        </>}
        {(action.kind === 'website' || action.kind === 'folder') && <div className="form-grid"><label>Название<input maxLength={100} value={action.label} onChange={e => change(action.id, { label: e.target.value })} /></label><label>{action.kind === 'website' ? 'URL сайта' : 'Локальный путь'}<input maxLength={4096} spellCheck={false} placeholder={action.kind === 'website' ? 'https://example.com' : 'C:\\Documents'} value={action.kind === 'website' ? action.url : action.path} onChange={e => change(action.id, action.kind === 'website' ? { url: e.target.value } : { path: e.target.value })} /></label></div>}
        {action.kind === 'command' && <><label className="text-muted text-sm">Сохранённая команда<select className="mt-2" value={action.commandId} onChange={e => change(action.id, { commandId: e.target.value })}>{commands.map(command => <option key={command.id} value={command.id}>{command.name}</option>)}</select></label><p className="text-muted mt-3">{command?.target ?? 'Команда удалена — удалите действие или выберите другую.'}</p><p className="text-muted text-sm">Параметры изменяются в разделе «Команды».</p></>}
        {['program', 'volume', 'night-light'].includes(action.kind) && <p className="text-muted">Сохранённое действие старого формата. Выполнение недоступно.</p>}
      </section>;
    })}
    <div className="flex gap-3 mt-4"><select aria-label="Тип нового действия" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="application">Приложение</option><option value="website">Сайт</option><option value="folder">Папка</option><option value="command">Пользовательская команда</option></select><button className="secondary" onClick={add}><Plus size={16} />Добавить действие</button></div>
    {error && <p className="form-error mt-3" role="alert">{error}</p>}
    <div className="form-actions"><button className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={!draft.name.trim()} onClick={save}>Сохранить режим</button></div>
  </section>;
}
