export type ModeIcon = 'game' | 'work' | 'rest' | 'night';
export type ModeAction = { active?: boolean } & (
  | { id: string; kind: 'application'; label: string; applicationId: string }
  | { id: string; kind: 'command'; label: string; commandId: string }
  | { id: string; kind: 'program'; label: string; path: string }
  | { id: string; kind: 'website'; label: string; url: string }
  | { id: string; kind: 'folder'; label: string; path: string }
  | { id: string; kind: 'volume'; label: string; level: number }
  | { id: string; kind: 'night-light'; label: string; enabled: boolean });
export interface Mode {
  id: string;
  name: string;
  description: string;
  icon: ModeIcon;
  phrase: string;
  actions: ModeAction[];
}
// Examples describe intent; no installed programs or executable paths are assumed.
export const defaultModes: Mode[] = [
  { id: 'game', name: 'Игра', description: 'Время для следующего уровня', icon: 'game', phrase: 'Включи игровой режим', actions: [] },
  { id: 'work', name: 'Работа', description: 'Всё для спокойной концентрации', icon: 'work', phrase: 'Включи рабочий режим', actions: [] },
  { id: 'rest', name: 'Отдых', description: 'Сделайте паузу в своём ритме', icon: 'rest', phrase: 'Включи режим отдыха', actions: [] },
  { id: 'night', name: 'Ночь', description: 'Тише, мягче, ближе ко сну', icon: 'night', phrase: 'Включи ночной режим', actions: [] },
];
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
function isAction(value: unknown): value is ModeAction {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.label !== 'string' || (value.active !== undefined && typeof value.active !== 'boolean')) return false;
  switch (value.kind) {
    case 'application': return typeof value.applicationId === 'string' && !!value.applicationId;
    case 'command': return typeof value.commandId === 'string' && !!value.commandId;
    case 'program': case 'folder': return typeof value.path === 'string';
    case 'website': return typeof value.url === 'string';
    case 'volume': return typeof value.level === 'number' && Number.isFinite(value.level) && value.level >= 0 && value.level <= 100;
    case 'night-light': return typeof value.enabled === 'boolean';
    default: return false;
  }
}
export function isModeList(value: unknown): value is Mode[] {
  return Array.isArray(value) && value.every(mode => isObject(mode)
    && typeof mode.id === 'string' && typeof mode.name === 'string'
    && typeof mode.description === 'string' && typeof mode.phrase === 'string'
    && ['game', 'work', 'rest', 'night'].includes(String(mode.icon))
    && Array.isArray(mode.actions) && mode.actions.every(isAction)
    && new Set(mode.actions.map(action => action.id)).size === mode.actions.length)
    && new Set(value.map(mode => mode.id)).size === value.length;
}

export function moveAction(actions: ModeAction[], id: string, offset: -1 | 1): ModeAction[] {
  const index = actions.findIndex(action => action.id === id);
  const next = [...actions];
  if (index >= 0 && index + offset >= 0 && index + offset < next.length) {
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
  }
  return next;
}
export function removeCommandActions(modes: Mode[], commandIds: Set<string>): Mode[] {
  return modes.map(mode => ({ ...mode, actions: mode.actions.filter(action => action.kind !== 'command' || commandIds.has(action.commandId)) }));
}
