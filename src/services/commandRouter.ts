import type { Mode } from '../domain/modes.ts';
import { normalizeCommand as normalize, type UserCommand } from '../domain/commands.ts';
export type RoutedCommand = { kind: 'action'; commandId: string } | { kind: 'ambiguous' } | { kind: 'mode'; modeId: string } | { kind: 'navigate'; page: 'modes' | 'settings' | 'commands' } | { kind: 'unknown' };
export function routeCommand(input: string, modes: Mode[], commands: UserCommand[] = []): RoutedCommand {
  const text = normalize(input);
  if (!text) return { kind: 'unknown' };
  if (text === 'настройки') return { kind: 'navigate', page: 'settings' };
  if (text === 'режимы') return { kind: 'navigate', page: 'modes' };
  if (text === 'команды') return { kind: 'navigate', page: 'commands' };
  const matches: RoutedCommand[] = [
    ...modes.filter(item => normalize(item.name) === text || (item.phrase.trim() && normalize(item.phrase) === text)).map(item => ({ kind: 'mode' as const, modeId: item.id })),
    ...commands.filter(item => normalize(item.name) === text || (item.phrase.trim() && normalize(item.phrase) === text)).map(item => ({ kind: 'action' as const, commandId: item.id })),
  ];
  return matches.length > 1 ? { kind: 'ambiguous' } : matches[0] ?? { kind: 'unknown' };
}
