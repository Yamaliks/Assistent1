import { useState, type FormEvent } from 'react';
import type { ModeIcon } from '../domain/modes';
const names = { game: 'Игра', work: 'Работа', rest: 'Отдых', night: 'Ночь' };
export function CreateModeForm({ onCreate, onClose }: { onCreate: (name: string, icon: ModeIcon, template: ModeIcon | 'empty') => boolean; onClose: () => void }) {
  const [name, setName] = useState(''); const [icon, setIcon] = useState<ModeIcon>('work'); const [template, setTemplate] = useState<ModeIcon | 'empty'>('empty');
  const submit = (event: FormEvent) => { event.preventDefault(); onCreate(name, icon, template); };
  return <section className="panel"><h2>Создать режим</h2><form onSubmit={submit}><div className="form-grid"><label>Название<input required autoFocus maxLength={48} value={name} placeholder="Учёба, Стрим, Мой вечер…" onChange={e => setName(e.target.value)} /></label><label>Начать с<select value={template} onChange={e => setTemplate(e.target.value as typeof template)}><option value="empty">Пустой режим</option>{Object.entries(names).map(([id, title]) => <option key={id} value={id}>Шаблон «{title}»</option>)}</select></label><label>Иконка<select value={icon} onChange={e => setIcon(e.target.value as ModeIcon)}>{Object.entries(names).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label></div><div className="form-actions mt-4"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary">Создать режим</button></div></form></section>;
}
