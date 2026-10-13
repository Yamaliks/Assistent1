import { useState, type FormEvent } from 'react';
import { FolderOpen, Globe, Plus, Trash2 } from 'lucide-react';
import { applicationName, type ApplicationConfig } from '../domain/applications';
import { targetError } from '../domain/commands';
import type { Mode } from '../domain/modes';
import type { Site } from '../domain/sites';
import { duplicateApplication, duplicateSite } from '../services/libraryEditing';
import { pickApplicationExe } from '../services/applicationPicker';
import { desktop } from '../services/windows';
import { ApplicationEditor } from './ApplicationsPage';

export function ApplicationCreator({ applications, onSave }: { applications: ApplicationConfig[]; onSave: (app: ApplicationConfig) => boolean }) {
  const [name, setName] = useState(''); const [path, setPath] = useState(''); const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<ApplicationConfig | null>(null); const [picking, setPicking] = useState(false);
  async function choose() { setPicking(true); try { const selected = await pickApplicationExe(); if (selected !== null) { setPath(selected); setDuplicate(null); } } catch (error) { setError(String(error)); } finally { setPicking(false); } }
  function submit(event: FormEvent) {
    event.preventDefault(); const app = { id: crypto.randomUUID(), name: name.trim(), path: path.trim(), useDefaultBrowser: false };
    const invalid = app.path ? targetError('program', app.path) : undefined;
    if (!app.name || invalid) { setError(invalid ?? 'Укажите название.'); return; }
    const existing = duplicateApplication(applications, app); if (existing) { setDuplicate(existing); return; }
    if (onSave(app)) { setName(''); setPath(''); setError(''); }
  }
  return <form className="action-edit-fields" onSubmit={submit}><div className="form-grid"><label>Название приложения<input required maxLength={48} value={name} onChange={e => { setName(e.target.value); setDuplicate(null); }} /></label><label>Путь к EXE (можно настроить позже)<input maxLength={4096} value={path} spellCheck={false} onChange={e => { setPath(e.target.value); setDuplicate(null); }} /></label></div>
    {duplicate && <div className="notice confirmation" role="alert"><p>В библиотеке уже есть «{applicationName(duplicate)}». Выберите существующее приложение.</p><button type="button" className="secondary" onClick={() => { if (onSave(duplicate)) setDuplicate(null); }}>Выбрать существующее</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions mt-4"><button type="button" className="secondary" disabled={!desktop || picking} onClick={() => { void choose(); }}><FolderOpen size={16} />Выбрать EXE</button><button className="primary" disabled={picking}><Plus size={16} />Добавить приложение</button></div></form>;
}
export function SiteEditor({ site, sites, onSave, onClose }: { site: Site; sites: Site[]; onSave: (site: Site) => boolean; onClose: () => void }) {
  const [draft, setDraft] = useState({ ...site }); const [error, setError] = useState(''); const [duplicate, setDuplicate] = useState<Site | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault(); const next = { ...draft, name: draft.name.trim(), url: draft.url.trim() };
    const invalid = targetError('website', next.url);
    if (!next.name || invalid) { setError(invalid ?? 'Укажите название сайта.'); return; }
    const existing = duplicateSite(sites, next); if (existing && !sites.some(item => item.id === site.id)) { setDuplicate(existing); return; }
    if (onSave(next)) onClose();
  }
  return <form className="action-edit-fields" onSubmit={submit}><div className="form-grid"><label>Название<input required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Адрес сайта<input required maxLength={4096} placeholder="https://example.com" spellCheck={false} value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} /></label></div>
    {duplicate && <div className="notice confirmation" role="alert"><p>Этот адрес уже есть в библиотеке: «{duplicate.name}».</p><button type="button" className="secondary" onClick={() => { if (onSave(duplicate)) onClose(); }}>Выбрать существующий сайт</button></div>}{error && <p className="form-error" role="alert">{error}</p>}<p className="field-help">Изменения сайта действуют во всех режимах, где он выбран.</p><div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary">Сохранить сайт</button></div></form>;
}
export function LibraryPage({ applications, sites, modes, onApplications, onSites, onDelete }: {
  applications: ApplicationConfig[]; sites: Site[]; modes: Mode[];
  onApplications: (apps: ApplicationConfig[]) => boolean; onSites: (sites: Site[]) => boolean;
  onDelete: (kind: 'application' | 'site', id: string) => boolean;
}) {
  const [tab, setTab] = useState<'applications' | 'sites'>('applications');
  const [adding, setAdding] = useState(false); const [draft, setDraft] = useState<Site | null>(null);
  const [remove, setRemove] = useState<{ kind: 'application' | 'site'; id: string; name: string } | null>(null);
  const usedBy = remove ? modes.filter(mode => mode.actions.some(action => remove.kind === 'application' ? action.kind === 'application' && action.applicationId === remove.id : action.kind === 'site' && action.siteId === remove.id)) : [];
  return <>
    <div className="library-tabs" role="group" aria-label="Разделы библиотеки"><button className={tab === 'applications' ? 'primary' : 'secondary'} aria-pressed={tab === 'applications'} onClick={() => { setTab('applications'); setAdding(false); setDraft(null); }}>Приложения</button><button className={tab === 'sites' ? 'primary' : 'secondary'} aria-pressed={tab === 'sites'} onClick={() => { setTab('sites'); setAdding(false); setDraft(null); }}>Сайты</button></div>
    <p className="editor-intro">Добавьте один раз — выбирайте в любом режиме. Папки пока настраиваются внутри режима.</p>
    {remove && <div className="notice confirmation" role="alert"><p>Удалить «{remove.name}» из библиотеки?{usedBy.length ? ` Элемент используется в режимах: ${usedBy.map(mode => mode.name).join(', ')}. Связанные действия тоже будут удалены.` : ' Программы и файлы не затрагиваются.'}</p><div className="form-actions"><button className="secondary" onClick={() => setRemove(null)}>Отмена</button><button className="primary" onClick={() => { if (onDelete(remove.kind, remove.id)) setRemove(null); }}>Удалить</button></div></div>}
    <button className="secondary mb-6" onClick={() => tab === 'applications' ? setAdding(!adding) : setDraft({ id: crypto.randomUUID(), name: '', url: '' })}><Plus size={18} />{tab === 'applications' ? 'Добавить приложение' : 'Добавить сайт'}</button>
    {tab === 'applications' ? <>
      {adding && <section className="panel"><ApplicationCreator applications={applications} onSave={app => { const saved = onApplications(applications.some(item => item.id === app.id) ? applications : [...applications, app]); if (saved) setAdding(false); return saved; }} /><p className="field-help">После добавления выберите EXE в карточке или введите путь вручную.</p></section>}
      {!applications.length && <p className="editor-intro">Приложений пока нет. Добавьте первое.</p>}
      {applications.map(app => <ApplicationEditor applications={applications} key={`${app.id}:${app.path}:${app.name}:${app.useDefaultBrowser}`} app={app} name={applicationName(app)} editName onSave={next => onApplications(applications.map(item => item.id === app.id ? next : item))} onDelete={() => setRemove({ kind: 'application', id: app.id, name: applicationName(app) })} />)}
    </> : <>
      {draft && <section className="panel"><h2>{sites.some(site => site.id === draft.id) ? 'Изменить сайт' : 'Новый сайт'}</h2><SiteEditor sites={sites} key={draft.id} site={draft} onClose={() => setDraft(null)} onSave={next => onSites(sites.some(site => site.id === next.id) ? sites.map(site => site.id === next.id ? next : site) : [...sites, next])} /></section>}
      {!sites.length && <p className="editor-intro">Сайтов пока нет. Добавьте YouTube, Twitch или любой другой сайт.</p>}
      {sites.map(site => <section className="action-card" key={site.id}><div className="action-card-header"><div className="action-title"><span className="mode-icon"><Globe size={20} /></span><h3>{site.name}</h3></div><button className="icon-button" aria-label={`Удалить ${site.name}`} onClick={() => setRemove({ kind: 'site', id: site.id, name: site.name })}><Trash2 size={18} /></button></div><div className="action-config-row"><span className={`action-status ${site.url ? 'ready' : ''}`}>{site.url ? 'Готово' : 'Не настроено'}</span><span className="path-preview" title={site.url}>{site.url || 'Укажите адрес сайта'}</span><button className="secondary" onClick={() => setDraft(site)}>Изменить</button></div></section>)}
    </>}
  </>;
}
