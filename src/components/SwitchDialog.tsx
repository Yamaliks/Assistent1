import { useState } from 'react';
import type { ClosePlan } from '../services/modeSwitching';
export function SwitchDialog({ plan, answer, stopSol }: { plan: ClosePlan; answer: (selected: string[] | null) => void; stopSol: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <div className="modal-backdrop"><section className="panel sol-dialog" role="dialog" aria-modal="true" aria-labelledby="switch-title" onKeyDown={event => { if (event.key === 'Escape') answer(null); }}>
    <h2 id="switch-title">Какие приложения закрыть?</h2><p className="field-help">«{plan.previousName}» → «{plan.nextName}». По умолчанию всё остаётся открытым. Несохранённые документы могут потребовать отдельного решения в приложении.</p>
    {plan.candidates.map(item => <label key={item.id} className="setting-row"><span><strong>{item.name}</strong><small className="field-help"> Окон: {item.windows}</small></span><select aria-label={`Действие для ${item.name}`} value={selected.includes(item.id) ? 'close' : 'keep'} onChange={e => setSelected(e.target.value === 'close' ? [...selected, item.id] : selected.filter(id => id !== item.id))}><option value="keep">Оставить</option><option value="close">Закрыть</option></select></label>)}
    <button className="text-button" onClick={stopSol}>Остановить микрофон SOL</button><div className="form-actions"><button autoFocus className="secondary" onClick={() => answer(null)}>Отмена</button><button className="secondary" onClick={() => answer([])}>Оставить всё</button><button className="primary" disabled={!selected.length} onClick={() => answer(selected)}>Закрыть выбранные</button></div>
  </section></div>;
}
