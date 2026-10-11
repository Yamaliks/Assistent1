export type LaunchKind = 'program' | 'website' | 'folder';
export interface UserCommand { id: string; name: string; phrase: string; kind: LaunchKind; target: string }
export const normalizeCommand = (text: string) => text.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
export function targetError(kind: LaunchKind, target: string): string | undefined {
  if (!target || target.length > 4096 || /[\u0000-\u001f\u007f]/.test(target)) return 'Укажите корректный адрес без управляющих символов.';
  if (kind === 'website') {
    try {
      const url = new URL(target);
      if (!/^https?:\/\//i.test(target) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    } catch { return 'Разрешены только http:// и https:// без логина и пароля в адресе.'; }
  } else {
    if (!/^[a-z]:[\\/]/i.test(target) || /[<>"|?*]/.test(target) || target.slice(2).includes(':')) return 'Укажите полный локальный путь Windows, например C:\\Apps\\App.exe. Сетевые и служебные пути не поддерживаются.';
    if (target.split(/[\\/]/).some(part => part === '..' || (part && /[. ]$/.test(part)))) return 'Путь не должен содержать .. или сегменты с точкой/пробелом на конце.';
    if (target.slice(3).split(/[\\/]/).some(part => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return 'Имена устройств Windows в пути не поддерживаются.';
    if (kind === 'program' && !/\.exe$/i.test(target)) return 'Приложение должно быть EXE-файлом. Аргументы командной строки не поддерживаются.';
  }
}
export function isCommandList(value: unknown): value is UserCommand[] {
  return Array.isArray(value) && value.every(item => item && typeof item === 'object'
    && typeof item.id === 'string' && !!item.id && typeof item.name === 'string' && !!item.name.trim() && item.name.length <= 48
    && typeof item.phrase === 'string' && item.phrase.length <= 100
    && ['program', 'website', 'folder'].includes(item.kind) && typeof item.target === 'string'
    && !targetError(item.kind, item.target)) && new Set(value.map(item => item.id)).size === value.length;
}
