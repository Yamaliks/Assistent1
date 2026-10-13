import { useEffect, useId, useState, type FormEvent } from 'react';
import { FolderOpen, Monitor, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { applicationName, type ApplicationConfig } from '../domain/applications';
import { duplicateApplication } from '../services/libraryEditing';
import { targetError } from '../domain/commands';
import { desktop } from '../services/windows';

export function ApplicationsPage({ applications, onSave }: { applications: ApplicationConfig[]; onSave: (applications: ApplicationConfig[]) => boolean }) {
  return <>
    <p className="text-muted mb-6">Укажите установленные приложения. Пустой путь означает, что приложение не настроено.</p>
    {!desktop && <div className="notice">Выбор файла и проверка его существования доступны в Windows-приложении. Ручной ввод и сохранение доступны здесь.</div>}
    {applications.map(app => {
      const { id } = app; const name = applicationName(app);
      return <ApplicationEditor key={`${id}:${app.path}:${app.useDefaultBrowser}`} app={app} name={name}
        onSave={next => onSave(applications.map(item => item.id === id ? next : item))} />;
    })}
  </>;
}
const appDescriptions: Record<string, string> = { steam: 'Игровая библиотека', discord: 'Общение', telegram: 'Сообщения', vpn: 'Запуск вашего VPN-приложения', browser: 'Интернет' };
export function ApplicationEditor({ app, name, onSave, applications = [], embedded = false, editName = false, onDelete }: { app: ApplicationConfig; name: string; onSave: (app: ApplicationConfig) => boolean; applications?: ApplicationConfig[]; embedded?: boolean; editName?: boolean; onDelete?: () => void }) {
  const inputId = useId();
  const [appName, setAppName] = useState(name);
  const [path, setPath] = useState(app.path);
  const [skipIfRunning, setSkipIfRunning] = useState(app.skipIfRunning ?? false);
  const [useDefault, setUseDefault] = useState(app.useDefaultBrowser);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [exists, setExists] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    if (desktop && app.path) invoke('check_application_exe', { path: app.path })
      .then(() => { if (!disposed) setExists(true); })
      .catch(() => { if (!disposed) { setExists(false); setMessage('Файл не найден или недоступен. Выберите EXE заново.'); } });
    return () => { disposed = true; };
  }, [app.path]);
  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : String(error));
  async function persist(target: string, defaultBrowser: boolean) {
    const nextPath = defaultBrowser ? '' : target.trim();
    if (nextPath) {
      const invalid = targetError('program', nextPath); if (invalid) throw new Error(invalid);
      if (desktop) await invoke('check_application_exe', { path: nextPath });
    }
    const duplicate = nextPath && duplicateApplication(applications, { ...app, path: nextPath });
    if (duplicate && nextPath !== app.path) throw new Error(`Этот EXE уже есть в библиотеке: «${applicationName(duplicate)}». Выберите существующее приложение при добавлении действия.`);
    if (editName && !appName.trim()) throw new Error('Укажите название приложения.');
    if (onSave({ ...app, ...(editName ? { name: appName.trim() } : {}), path: nextPath, useDefaultBrowser: defaultBrowser, skipIfRunning })) { setOpen(false); setMessage('Сохранено.'); }
    else throw new Error('Не удалось сохранить путь.');
  }
  async function choose() {
    setBusy(true); setMessage('');
    try { const selected = await invoke<string | null>('pick_application_exe'); if (selected !== null) { setPath(selected); setUseDefault(false); await persist(selected, false); } }
    catch (error) { report(error); setOpen(true); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await persist(path, useDefault); } catch (error) { report(error); }
    finally { setBusy(false); }
  }
  const ready = app.useDefaultBrowser || (!!app.path && exists !== false);
  return <div className={embedded ? 'application-settings' : 'action-card'}>
    {!embedded && <div className="action-card-header"><div className="action-title"><span className="mode-icon"><Monitor size={20} /></span><div><h3>{name}</h3><p>{appDescriptions[app.id] ?? 'Ваше приложение'}</p></div></div>{onDelete && <button className="icon-button" aria-label={`Удалить ${name}`} onClick={onDelete}><Trash2 size={18} /></button>}</div>}
    {embedded && <p className="action-description">{appDescriptions[app.id] ?? 'Ваше приложение'}</p>}
    <div className="action-config-row"><span className={`action-status ${ready ? 'ready' : ''}`}>{desktop && app.path && exists === null ? 'Проверяем файл…' : ready ? 'Готово' : 'Не настроено'}</span>
      <span className="path-preview" title={app.path || undefined}>{app.useDefaultBrowser ? 'Браузер по умолчанию' : app.path ? app.path.split(/[\\/]/).pop() : 'Выберите установленное приложение'}</span>
      {!app.path && !app.useDefaultBrowser && desktop && <button className="primary" disabled={busy} onClick={() => { void choose(); }}><FolderOpen size={16} />Выбрать EXE</button>}
      <button className="secondary" disabled={busy} aria-expanded={open} onClick={() => setOpen(!open)}>{ready ? 'Изменить' : 'Ввести путь'}</button>
    </div>
    {open && <form className="action-edit-fields" onSubmit={event => { void submit(event); }}>
      {editName && <label>Название приложения<input required maxLength={48} value={appName} onChange={e => setAppName(e.target.value)} /></label>}
      {app.id === 'browser' && <label className="checkbox-label"><input type="checkbox" checked={useDefault} disabled={busy} onChange={e => setUseDefault(e.target.checked)} />Использовать браузер по умолчанию</label>}
      <label className="checkbox-label"><input type="checkbox" checked={app.id === 'browser' && useDefault ? true : skipIfRunning} disabled={busy || (app.id === 'browser' && useDefault)} onChange={e => setSkipIfRunning(e.target.checked)} />Не запускать повторно, если уже работает</label>
      <p className="field-help">Проверяется полный путь EXE. Для браузера по умолчанию проверка всегда включена.</p><label htmlFor={inputId}>Путь к приложению</label><div className="path-input-row"><input id={inputId} value={path} disabled={busy || useDefault} placeholder="Полный путь к EXE" spellCheck={false} onChange={e => { setPath(e.target.value); setMessage(''); }} />
        <button type="button" className="secondary" disabled={!desktop || busy || useDefault} onClick={() => { void choose(); }}><FolderOpen size={16} />Выбрать EXE</button></div>
      <p className="field-help">Путь общий для всех режимов. При выборе файла он сохраняется сразу.{!desktop && ' Проверка файла доступна в Windows.'}</p>
      <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>Отмена</button><button className="primary" disabled={busy}>Сохранить путь</button></div>
    </form>}
    {message && <p className={exists === false ? 'form-error' : 'field-help'} role="status">{message}</p>}
  </div>;
}
