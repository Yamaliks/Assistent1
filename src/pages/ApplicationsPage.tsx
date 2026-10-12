import { useState, type FormEvent } from 'react';
import { FolderOpen, Monitor } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { applicationName, type ApplicationConfig } from '../domain/applications';
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
export function ApplicationEditor({ app, name, onSave }: { app: ApplicationConfig; name: string; onSave: (app: ApplicationConfig) => boolean }) {
  const [path, setPath] = useState(app.path);
  const [useDefault, setUseDefault] = useState(app.useDefaultBrowser);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : String(error));
  async function choose() {
    setBusy(true); setMessage('');
    try { const selected = await invoke<string | null>('pick_application_exe'); if (selected !== null) setPath(selected); }
    catch (error) { report(error); }
    finally { setBusy(false); }
  }
  async function check(target: string) {
    const error = targetError('program', target);
    if (error) throw new Error(error);
    if (desktop) { await invoke('check_application_exe', { path: target }); setMessage('EXE найден.'); }
    else setMessage('Формат пути корректен. Проверка существования доступна в Windows.');
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    const target = useDefault ? '' : path.trim();
    try { if (target) await check(target); onSave({ ...app, path: target, useDefaultBrowser: useDefault }); }
    catch (error) { report(error); }
    finally { setBusy(false); }
  }
  return <section className="panel"><div className="flex items-center gap-3 mb-4"><Monitor size={20} className="text-accent" /><h2>{name}</h2></div>
    <p className="text-muted text-sm mb-4">{app.useDefaultBrowser ? 'Браузер по умолчанию' : app.path || 'Не настроено'}</p>
    <form onSubmit={event => { void submit(event); }}>
      {app.id === 'browser' && <label className="flex items-center gap-3 mb-4"><input className="w-auto" type="checkbox" checked={useDefault} disabled={busy} onChange={e => { setUseDefault(e.target.checked); setMessage(''); }} />Использовать браузер по умолчанию</label>}
      <label className="text-muted text-sm" htmlFor={`app-${app.id}`}>Путь к EXE</label>
      <div className="flex flex-wrap gap-2 mt-2"><input className="flex-1 min-w-48" id={`app-${app.id}`} value={path} disabled={busy || useDefault} placeholder="C:\Apps\App.exe" spellCheck={false} onChange={e => { setPath(e.target.value); setMessage(''); }} />
        <button type="button" className="secondary" disabled={!desktop || busy || useDefault} onClick={() => { void choose(); }} aria-label={`Выбрать EXE для ${name}`}><FolderOpen size={16} />Выбрать EXE</button></div>
      <div className="form-actions mt-4"><button type="button" className="secondary" disabled={busy || useDefault || !path.trim()} onClick={() => { setBusy(true); void check(path.trim()).catch(report).finally(() => setBusy(false)); }}>Проверить</button><button className="primary" disabled={busy}>Сохранить</button></div>
      {message && <p className="mt-3 text-sm text-muted" role="status">{message}</p>}
    </form>
  </section>;
}
