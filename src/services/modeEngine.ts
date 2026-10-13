import type { ActionResult, Mode, ModeAction, ModeRun } from '../domain/modes.ts';
import type { UserCommand } from '../domain/commands.ts';
import { applicationName } from '../domain/applications.ts';
import type { Settings } from './settingsStorage.ts';
import { systemServices, type SystemServices } from './systemServices.ts';
export async function executeUserCommand(command: UserCommand, services: SystemServices = systemServices): Promise<string> {
  const base = { id: command.id, label: command.name };
  await services.execute(command.kind === 'website'
    ? { ...base, kind: 'website', url: command.target }
    : { ...base, kind: command.kind, path: command.target });
  return `«${command.name}»: запрос ${command.kind === 'program' ? 'запуска' : 'открытия'} отправлен Windows.`;
}
export interface ModePlan { modeId: string; actionCount: number; executable: false; message: string }
export function planMode(mode: Mode): ModePlan {
  return { modeId: mode.id, actionCount: mode.actions.length, executable: false,
    message: `«${mode.name}»: откройте режим в главном окне, чтобы запустить действия.` };
}

export interface ModeProgress { modeId: string; status: 'running'; current: string; results: ActionResult[] }
function actionName(action: ModeAction, settings: Settings): string {
  if (action.kind === 'application') { const app = settings.applications.find(app => app.id === action.applicationId); return app ? applicationName(app) : action.label || 'Приложение'; }
  if (action.kind === 'site') return settings.sites.find(site => site.id === action.siteId)?.name ?? (action.label || 'Сайт');
  if (action.kind === 'command') return settings.commands.find(command => command.id === action.commandId)?.name ?? (action.label || 'Команда');
  return action.label || 'Действие';
}
export function createModeRunner(services: SystemServices = systemServices) {
  const running = new Set<string>();
  return {
    isRunning: (modeId: string) => running.has(modeId),
    async run(mode: Mode, settings: Settings, onProgress: (progress: ModeProgress) => void = () => {}): Promise<ModeRun> {
      if (running.has(mode.id)) throw new Error('Этот режим уже запускается.');
      running.add(mode.id);
      // Inputs may be edited while Windows handles a launch; this run keeps its saved snapshot.
      try {
        const snapshot = structuredClone({ mode, settings }); const results: ActionResult[] = [];
        for (const action of snapshot.mode.actions) {
          const name = actionName(action, snapshot.settings);
          onProgress({ modeId: mode.id, status: 'running', current: name, results: [...results] });
          if (action.active === false) { results.push({ actionId: action.id, name, status: 'skipped', message: 'Отключено' }); continue; }
          try {
            if (action.kind === 'application') {
              const app = snapshot.settings.applications.find(app => app.id === action.applicationId);
              if (!app) throw new Error('Приложение отсутствует в библиотеке.');
              if (app.useDefaultBrowser) throw new Error('Для браузера по умолчанию добавьте действие сайта с адресом.');
              if (!app.path) throw new Error('Путь к EXE не настроен. Откройте мою библиотеку.');
              await services.execute({ id: action.id, label: name, kind: 'program', path: app.path });
            } else if (action.kind === 'site') {
              const site = snapshot.settings.sites.find(site => site.id === action.siteId);
              if (!site?.url) throw new Error('Адрес сайта не настроен. Откройте мою библиотеку.');
              await services.execute({ id: action.id, label: name, kind: 'website', url: site.url });
            } else if (action.kind === 'command') {
              const command = snapshot.settings.commands.find(command => command.id === action.commandId);
              if (!command) throw new Error('Сохранённая команда не найдена.');
              await executeUserCommand(command, services);
            } else await services.execute(action);
            results.push({ actionId: action.id, name, status: 'success', message: 'Запрос запуска выполнен' });
          } catch (error) {
            results.push({ actionId: action.id, name, status: 'error', message: error instanceof Error ? error.message : String(error) });
          }
        }
        const errors = results.filter(result => result.status === 'error').length;
        const success = results.filter(result => result.status === 'success').length;
        const skipped = results.filter(result => result.status === 'skipped').length;
        return { modeId: mode.id, finishedAt: new Date().toISOString(), status: errors ? 'errors' : 'ready',
          summary: `«${mode.name}»: выполнено ${success}, ошибок ${errors}, пропущено ${skipped}.`, results };
      } finally { running.delete(mode.id); }
    },
  };
}
export const modeRunner = createModeRunner();
