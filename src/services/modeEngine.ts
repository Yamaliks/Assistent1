import type { ActionResult, Mode, ModeAction, ModeRun } from '../domain/modes.ts';
import type { UserCommand } from '../domain/commands.ts';
import { normalizeExe } from './libraryEditing.ts';
import { applicationName } from '../domain/applications.ts';
import type { Settings } from './settingsStorage.ts';
import { systemServices, LaunchError, type LaunchReport, type SystemServices } from './systemServices.ts';
export async function launchUserCommand(command: UserCommand, services: SystemServices = systemServices, minimized = false, skipIfRunning = false): Promise<LaunchReport> {
  const base = { id: command.id, label: command.name };
  return services.execute(command.kind === 'website'
    ? { ...base, kind: 'website', url: command.target }
    : { ...base, kind: command.kind, path: command.target }, minimized, skipIfRunning);
}
export async function executeUserCommand(command: UserCommand, services: SystemServices = systemServices, minimized = false, skipIfRunning = false): Promise<string> {
  const outcome = await launchUserCommand(command, services, minimized, skipIfRunning);
  return outcome.outcome === 'state-unknown' ? `«${command.name}»: ${outcome.message}` : outcome.outcome === 'already-running' ? `«${command.name}»: уже работает.` : `«${command.name}»: запрос ${command.kind === 'program' ? 'запуска' : 'открытия'} отправлен Windows.`;
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
    async run(mode: Mode, settings: Settings, onProgress: (progress: ModeProgress) => void = () => {}, options: { preserveRunning?: boolean } = {}): Promise<ModeRun> {
      if (running.has(mode.id)) throw new Error('Этот режим уже запускается.');
      running.add(mode.id);
      // Inputs may be edited while Windows handles a launch; this run keeps its saved snapshot.
      try {
        const snapshot = structuredClone({ mode, settings }); const results: ActionResult[] = [];
        for (const action of snapshot.mode.actions) {
          const name = actionName(action, snapshot.settings);
          onProgress({ modeId: mode.id, status: 'running', current: name, results: [...results] });
          if (action.active === false) { results.push({ actionId: action.id, name, status: 'skipped', message: 'Отключено' }); continue; }
          const details = action.kind === 'application' ? { libraryId: action.applicationId, path: snapshot.settings.applications.find(app => app.id === action.applicationId)?.path ?? '' } : action.kind === 'program' ? { path: action.path } : {};
          try {
            let outcome: LaunchReport = { outcome: 'launched', message: 'Запущено' };
            if (action.kind === 'application') {
              const app = snapshot.settings.applications.find(app => app.id === action.applicationId);
              if (!app) throw new Error('Приложение отсутствует в библиотеке.');
              if (app.useDefaultBrowser) { outcome = await services.execute({ id: action.id, kind: 'browser', label: name }, snapshot.mode.launchMinimized ?? false, true); } else {
              if (!app.path) throw new Error('Путь к EXE не настроен. Откройте мою библиотеку.');
              outcome = await services.execute({ id: action.id, label: name, kind: 'program', path: app.path }, snapshot.mode.launchMinimized ?? false, options.preserveRunning || (app.skipIfRunning ?? false)); }
            } else if (action.kind === 'site') {
              const site = snapshot.settings.sites.find(site => site.id === action.siteId);
              if (!site?.url) throw new Error('Адрес сайта не настроен. Откройте мою библиотеку.');
              outcome = await services.execute({ id: action.id, label: name, kind: 'website', url: site.url });
            } else if (action.kind === 'command') {
              const command = snapshot.settings.commands.find(command => command.id === action.commandId);
              if (!command) throw new Error('Сохранённая команда не найдена.');
              const skip = command.kind === 'program' && (options.preserveRunning || snapshot.settings.applications.some(app => app.skipIfRunning && app.path && normalizeExe(app.path) === normalizeExe(command.target)));
              outcome = await launchUserCommand(command, services, snapshot.mode.launchMinimized ?? false, skip);
            } else outcome = await services.execute(action, snapshot.mode.launchMinimized ?? false, options.preserveRunning && action.kind === 'program');
            results.push({ actionId: action.id, name, status: outcome.outcome === 'already-running' ? 'already-running' : outcome.outcome === 'state-unknown' ? 'state-unknown' : 'success', message: outcome.message, details: { ...details, ...outcome.details } });
          } catch (error) {
            results.push({ actionId: action.id, name, status: 'error', message: error instanceof Error ? error.message : String(error), details: { ...details, ...(error instanceof LaunchError ? error.details : {}) } });
          }
        }
        const errors = results.filter(result => result.status === 'error').length;
        const unknown = results.filter(result => result.status === 'state-unknown').length;
        const success = results.filter(result => result.status === 'success').length;
        const already = results.filter(result => result.status === 'already-running').length;
        const skipped = results.filter(result => result.status === 'skipped').length;
        return { modeId: mode.id, finishedAt: new Date().toISOString(), status: errors || unknown ? 'errors' : 'ready',
          summary: `«${mode.name}»: запущено ${success}, уже работает ${already}, неопределено ${unknown}, ошибок ${errors}, пропущено ${skipped}.`, results };
      } finally { running.delete(mode.id); }
    },
  };
}
export const modeRunner = createModeRunner();
