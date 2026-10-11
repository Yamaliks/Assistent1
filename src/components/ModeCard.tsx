import { ArrowUpRight, BriefcaseBusiness, Gamepad2, Headphones, Moon, type LucideIcon } from 'lucide-react';
import type { Mode, ModeIcon } from '../domain/modes';
export const modeIcons: Record<ModeIcon, LucideIcon> = { game: Gamepad2, work: BriefcaseBusiness, rest: Headphones, night: Moon };
export function ModeCard({ mode, onSelect }: { mode: Mode; onSelect: (mode: Mode) => void }) {
  const Icon = modeIcons[mode.icon];
  return <button className="mode-card" onClick={() => onSelect(mode)} aria-label={`Просмотреть режим ${mode.name}`}>
    <div className="flex items-start justify-between"><span className={`mode-icon ${mode.icon}`}><Icon size={23} /></span><ArrowUpRight size={17} className="text-muted" /></div>
    <h3>{mode.name}</h3><p>{mode.description}</p>
    <div className="card-footer"><span>{mode.actions.length ? `${mode.actions.length} действий` : 'Действия не настроены'}</span><span className="tiny-dot" /> <span>Черновик</span></div>
  </button>;
}
