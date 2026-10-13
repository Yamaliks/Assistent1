import { ActionResults } from './ActionResults';
import { BriefcaseBusiness, Gamepad2, Headphones, Moon, Play, Settings2, type LucideIcon } from 'lucide-react';
import type { Mode, ModeIcon, ModeRun } from '../domain/modes';
import type { ModeProgress } from '../services/modeEngine';
export const modeIcons: Record<ModeIcon, LucideIcon> = { game: Gamepad2, work: BriefcaseBusiness, rest: Headphones, night: Moon };
export function ModeCard({ mode, onSelect, onRun, run }: { mode: Mode; onSelect: (mode: Mode) => void; onRun: () => void; run?: ModeRun | ModeProgress }) {
  const Icon = modeIcons[mode.icon];
  return <section className="mode-card"><span className={`mode-icon ${mode.icon}`}><Icon size={23} /></span><h3>{mode.name}</h3><p>{mode.description}</p>
    <div className="mode-card-buttons"><button className="primary" disabled={run?.status === 'running'} onClick={onRun}><Play size={16} />{run?.status === 'running' ? 'Запускается' : 'Запустить'}</button><button className="secondary" onClick={() => onSelect(mode)}><Settings2 size={16} />Настроить</button></div>
    <p className="field-help">{run ? run.status === 'running' ? `Сейчас: ${run.current}` : run.summary : `${mode.actions.length} действий`}</p>
    {run && <details className="advanced"><summary>Результаты действий</summary><ActionResults results={run.results} /></details>}
  </section>;
}
