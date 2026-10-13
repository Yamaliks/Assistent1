import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Command, FolderOpen, Globe, Monitor, MoreHorizontal, Plus, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import { applicationName, type ApplicationConfig } from '../domain/applications';
import { targetError, type UserCommand } from '../domain/commands';
import { modeTemplate, moveAction, type Mode, type ModeAction } from '../domain/modes';
import { ApplicationEditor } from './ApplicationsPage';

export function ModeEditor({ mode, applications, commands, onApplications, onSave, onClose }: {
  mode: Mode; applications: ApplicationConfig[]; commands: UserCommand[];
  onApplications: (apps: ApplicationConfig[]) => boolean; onSave: (mode: Mode) => boolean; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(mode));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restore, setRestore] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const change = (id: string, patch: Partial<ModeAction>) => setDraft(current => ({ ...current, actions: current.actions.map(action => action.id === id ? { ...action, ...patch } as ModeAction : action) }));
  function add(kind: 'application' | 'website' | 'folder' | 'command') {
    const base = { id: crypto.randomUUID(), label: '', active: true };
    let action: ModeAction;
    if (kind === 'application') action = { ...base, kind, applicationId: applications[0].id };
    else if (kind === 'command') {
      if (!commands.length) { setError('Сначала создайте команду в разделе «Команды».'); return; }
      action = { ...base, kind, commandId: commands[0].id };
    } else if (kind === 'website') action = { ...base, kind, label: 'Новый сайт', url: '' };
    else action = { ...base, kind, label: 'Новая папка', path: '' };
    setDraft(current => ({ ...current, actions: [...current.actions, action] })); setEditingId(action.id); setAdding(false); setError('');
  }
  function addApplication(actionId: string) {
    if (!newName.trim()) { setError('Укажите название нового приложения.'); return; }
    const app: ApplicationConfig = { id: crypto.randomUUID(), name: newName.trim(), path: '', useDefaultBrowser: false };
    if (onApplications([...applications, app])) { change(actionId, { applicationId: app.id }); setNewName(''); setError(''); }
  }
  function save() {
    for (const action of draft.actions) {
      const invalid = action.kind === 'website' ? targetError('website', action.url) : action.kind === 'folder' ? targetError('folder', action.path) : undefined;
      const emptyOptional = action.active === false && ((action.kind === 'website' && !action.url.trim()) || (action.kind === 'folder' && !action.path.trim()));
      if ((!emptyOptional && invalid) || (['website', 'folder'].includes(action.kind) && !action.label.trim())) { setError(invalid ?? 'Укажите название действия.'); return; }
    }
    if (onSave({ ...draft, name: draft.name.trim() })) onClose();
  }
  return <section className="mode-editor" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.querySelectorAll('details[open]').forEach(details => details.removeAttribute('open')); setEditingId(null); setAdding(false); } }}>
    <div className="editor-toolbar"><button className="secondary" onClick={onClose}><ArrowLeft size={16} />Все режимы</button><button className="text-button" onClick={() => setRestore(true)}><RotateCcw size={16} />Восстановить шаблон</button></div>
    {restore && <div className="notice confirmation" role="alert"><p>Заменить список действий шаблоном? Ваши действия в этом режиме будут удалены. Общие пути приложений сохранятся.</p><div className="form-actions"><button className="secondary" onClick={() => setRestore(false)}>Отмена</button><button className="primary" onClick={() => { setDraft({ ...draft, actions: modeTemplate(draft.icon, draft.id) }); setEditingId(null); setRestore(false); }}>Восстановить</button></div></div>}
    <p className="editor-intro">Настройте приложения и добавьте свои действия. Запуск целого режима пока недоступен.</p>
    {!draft.actions.length && <div className="panel empty-actions"><h2>Добавьте первое действие</h2><p>{draft.icon === 'night' ? 'Настройки громкости и ночного света пока не поддерживаются. Можно добавить приложение, сайт или папку.' : 'Выберите приложение, сайт, папку или свою команду.'}</p></div>}
    <div className="action-stack">{draft.actions.map((action, index) => {
      const app = action.kind === 'application' ? applications.find(app => app.id === action.applicationId) : undefined;
      const command = action.kind === 'command' ? commands.find(command => command.id === action.commandId) : undefined;
      const title = app ? applicationName(app) : command?.name ?? action.label;
      const Icon = action.kind === 'application' ? Monitor : action.kind === 'website' ? Globe : action.kind === 'folder' ? FolderOpen : action.kind === 'command' ? Command : Settings2;
      const target = action.kind === 'website' ? action.url : action.kind === 'folder' ? action.path : command?.target ?? '';
      const ready = action.kind === 'command' ? !!command : action.kind === 'website' || action.kind === 'folder' ? !targetError(action.kind, target) : false;
      return <section className={`action-card ${action.active === false ? 'inactive' : ''}`} key={action.id}>
        <div className="action-card-header"><div className="action-title"><span className="mode-icon"><Icon size={20} /></span><div><h3>{title || 'Действие'}</h3>{action.active === false && <small>Отключено</small>}</div></div>
          <div className="action-controls"><button type="button" className={`toggle ${action.active !== false ? 'on' : ''}`} role="switch" aria-label={`Включить ${title}`} aria-checked={action.active !== false} onClick={() => change(action.id, { active: action.active === false })}><span /></button>
            <details className="action-menu"><summary aria-label={`Действия ${title}`}><MoreHorizontal size={20} /></summary><div className="action-menu-items">
              <button disabled={index === 0} onClick={() => setDraft({ ...draft, actions: moveAction(draft.actions, action.id, -1) })}><ArrowUp size={16} />Переместить выше</button>
              <button disabled={index === draft.actions.length - 1} onClick={() => setDraft({ ...draft, actions: moveAction(draft.actions, action.id, 1) })}><ArrowDown size={16} />Переместить ниже</button>
              <button className="danger" onClick={() => setDraft({ ...draft, actions: draft.actions.filter(item => item.id !== action.id) })}><Trash2 size={16} />Удалить действие</button>
            </div></details>
          </div>
        </div>
        {action.kind === 'application' && <>
          {app && <ApplicationEditor embedded key={`${app.id}:${app.path}:${app.useDefaultBrowser}`} app={app} name={applicationName(app)} onSave={next => onApplications(applications.map(item => item.id === app.id ? next : item))} />}
          <details className="advanced" open={editingId === action.id ? true : undefined}><summary>Другое приложение</summary>
            <label>Выберите приложение<select value={action.applicationId} onChange={e => change(action.id, { applicationId: e.target.value })}>{applications.map(app => <option key={app.id} value={app.id}>{applicationName(app)}</option>)}</select></label>
            <div className="new-application"><label>Или добавьте своё<input maxLength={48} value={newName} placeholder="Название приложения" onChange={e => setNewName(e.target.value)} /></label><button className="secondary" onClick={() => addApplication(action.id)}>Добавить приложение</button></div>
          </details>
        </>}
        {(action.kind === 'website' || action.kind === 'folder' || action.kind === 'command') && <>
          <p className="action-description">{action.kind === 'website' ? 'Сайт' : action.kind === 'folder' ? 'Папка Windows' : 'Моя команда'}</p>
          <div className="action-config-row"><span className={`action-status ${ready ? 'ready' : ''}`}>{ready ? 'Готово' : 'Не настроено'}</span><span className="path-preview" title={target}>{action.kind === 'folder' ? target.split(/[\\/]/).pop() || 'Укажите папку' : target || 'Укажите адрес'}</span><button className={ready ? 'secondary' : 'primary'} aria-expanded={editingId === action.id} onClick={() => setEditingId(editingId === action.id ? null : action.id)}>{ready ? 'Изменить' : 'Настроить'}</button></div>
          {editingId === action.id && <div className="action-edit-fields">{action.kind === 'command' ? <><label>Моя команда<select value={action.commandId} onChange={e => change(action.id, { commandId: e.target.value })}>{commands.map(command => <option key={command.id} value={command.id}>{command.name}</option>)}</select></label><p className="field-help">Параметры изменяются в разделе «Команды».</p></> : <div className="form-grid"><label>Название<input autoFocus maxLength={100} value={action.label} onChange={e => change(action.id, { label: e.target.value })} /></label><label>{action.kind === 'website' ? 'Адрес сайта' : 'Путь к папке'}<input maxLength={4096} spellCheck={false} placeholder={action.kind === 'website' ? 'https://example.com' : 'Полный путь Windows'} value={target} onChange={e => change(action.id, action.kind === 'website' ? { url: e.target.value } : { path: e.target.value })} /></label></div>}</div>}
        </>}
        {['program', 'volume', 'night-light'].includes(action.kind) && <p className="field-help">Сохранённое действие старого формата. Выполнение недоступно.</p>}
      </section>;
    })}</div>
    <div className="add-action-area"><button className="secondary add-action-button" aria-expanded={adding} onClick={() => setAdding(!adding)}><Plus size={18} />Добавить действие</button>
      {adding && <div className="action-type-picker">{([{ kind: 'application', title: 'Приложение', Icon: Monitor }, { kind: 'website', title: 'Сайт', Icon: Globe }, { kind: 'folder', title: 'Папка', Icon: FolderOpen }, { kind: 'command', title: 'Моя команда', Icon: Command }] as const).map(({ kind, title, Icon }) => <button className="secondary" key={kind} onClick={() => add(kind)}><Icon size={18} />{title}</button>)}</div>}
    </div>
    <details className="advanced mode-metadata"><summary>Дополнительно — название и фраза режима</summary><div className="form-grid"><label>Название<input maxLength={48} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Шаблон и иконка<select value={draft.icon} onChange={e => setDraft({ ...draft, icon: e.target.value as Mode['icon'] })}><option value="game">Игра</option><option value="work">Работа</option><option value="rest">Отдых</option><option value="night">Ночь</option></select></label><label className="full-width">Описание<input maxLength={120} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><label className="full-width">Фраза в панели команд<input maxLength={100} value={draft.phrase} onChange={e => setDraft({ ...draft, phrase: e.target.value })} /></label></div></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="editor-save"><span>Действия сохранятся после нажатия «Сохранить».</span><div className="form-actions"><button className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={!draft.name.trim()} onClick={save}>Сохранить режим</button></div></div>
  </section>;
}
