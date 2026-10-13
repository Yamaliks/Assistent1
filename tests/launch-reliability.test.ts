import test from 'node:test';
import assert from 'node:assert/strict';
import { createModeRunner } from '../src/services/modeEngine.ts';
import { createSystemServices, LaunchError } from '../src/services/systemServices.ts';
import { freshSettings, loadSettings, saveSettings } from '../src/services/settingsStorage.ts';
test('library skip flag is honored, not hardcoded true: closed Steam gets its exact saved EXE', async () => {
  const settings = freshSettings(); const mode = settings.modes[0];
  settings.applications[0] = { ...settings.applications[0], path: 'C:\\Steam\\Steam.exe', skipIfRunning: false };
  mode.actions = [{ id: 'steam', kind: 'application', label: 'Steam', applicationId: 'steam' }];
  const requests: unknown[] = [];
  const runner = createModeRunner(createSystemServices(async (kind, target, minimized, skip) => { requests.push({ kind, target, minimized, skip }); return { outcome: 'launched', message: 'Запущено. Готовность окна не подтверждалась.', details: { path: target } }; }));
  const first = await runner.run(mode, settings); assert.equal(first.results[0].status, 'success');
  assert.deepEqual(requests[0], { kind: 'program', target: 'C:\\Steam\\Steam.exe', minimized: false, skip: false });
  settings.applications[0] = { ...settings.applications[0], path: 'D:\\Steam\\Steam.exe', skipIfRunning: true }; mode.launchMinimized = true;
  const next = await runner.run(mode, settings);
  assert.deepEqual(requests[1], { kind: 'program', target: 'D:\\Steam\\Steam.exe', minimized: true, skip: true });
  assert.equal(next.results[0].details?.path, 'D:\\Steam\\Steam.exe'); assert.equal(next.results[0].details?.libraryId, 'steam');
});
test('background/uncertain state is never already-running or success; later actions continue and diagnostics persist', async () => {
  const settings = freshSettings(); const mode = settings.modes[0]; settings.applications[0].path = 'C:\\Steam\\Steam.exe';
  mode.actions = [{ id: 'steam', kind: 'application', label: '', applicationId: 'steam' }, { id: 'web', kind: 'site', label: '', siteId: settings.sites[0].id }];
  const runner = createModeRunner(createSystemServices(async kind => kind === 'program' ? { outcome: 'state-unknown', message: 'Есть фоновый процесс без доступного окна.', details: { path: 'C:\\Steam\\Steam.exe', inspection: 'Нет доступного окна', pids: [123], windowCount: 0, windowsError: null } } : 'launched'));
  const result = await runner.run(mode, settings); assert.equal(result.status, 'errors'); assert.deepEqual(result.results.map(result => result.status), ['state-unknown', 'success']);
  assert.match(result.summary, /неопределено 1/); assert.equal(result.results[0].details?.windowCount, 0);
  const data = new Map<string, string>(); const port = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  mode.lastRun = result; saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
});
test('same app names cannot override stable IDs or EXE paths; Discord, Telegram and custom paths stay distinct', async () => {
  const settings = freshSettings(); settings.applications = settings.applications.map(app => ({ ...app, path: app.id === 'browser' ? '' : `C:\\Apps\\${app.id}.exe` }));
  settings.applications.push({ id: 'custom', name: 'Steam', path: 'D:\\Custom\\steam.exe', useDefaultBrowser: false });
  const mode = settings.modes[0]; mode.actions = ['steam', 'discord', 'telegram', 'custom'].map(id => ({ id, kind: 'application' as const, label: 'Одинаковая подпись', applicationId: id }));
  const paths: string[] = []; const runner = createModeRunner(createSystemServices(async (_kind, target) => { paths.push(target); return 'launched'; }));
  await runner.run(mode, settings); assert.deepEqual(paths, ['C:\\Apps\\steam.exe', 'C:\\Apps\\discord.exe', 'C:\\Apps\\telegram.exe', 'D:\\Custom\\steam.exe']);
  assert.equal(settings.applications.length, 6);
});
test('Windows errors retain used EXE/code, never report success; malformed backend responses are rejected', async () => {
  const settings = freshSettings(); const mode = settings.modes[0]; settings.applications[0].path = 'C:\\Steam\\Steam.exe';
  mode.actions = [{ id: 'steam', kind: 'application', label: '', applicationId: 'steam' }];
  const result = await createModeRunner(createSystemServices(async () => { throw new LaunchError('Windows отказала в доступе', { windowsError: 5, path: 'C:\\Steam\\Steam.exe' }); })).run(mode, settings);
  assert.equal(result.results[0].status, 'error'); assert.equal(result.results[0].details?.windowsError, 5); assert.equal(result.results[0].details?.libraryId, 'steam');
  const bad = await createModeRunner(createSystemServices(async () => ({ outcome: 'bogus', message: '' } as never))).run(mode, settings);
  assert.equal(bad.results[0].status, 'error');
});
test('an unavailable process check preserves unknown status and nullable Windows diagnostics through storage', async () => {
  const settings = freshSettings(); settings.applications[0].path = 'C:\\Steam\\Steam.exe';
  settings.modes[0].actions = [{ id: 'app', kind: 'application', label: '', applicationId: 'steam' }];
  const result = await createModeRunner(createSystemServices(async () => ({ outcome: 'state-unknown', message: 'Не удалось получить путь процесса', details: { path: 'C:\\Steam\\Steam.exe', canonicalPath: null, inspection: 'Доступ запрещён', pids: [], windowCount: null, windowsError: 5, minimizedRequested: false } }))).run(settings.modes[0], settings);
  assert.equal(result.results[0].status, 'state-unknown'); assert.equal(result.results[0].details?.windowsError, 5); assert.equal(result.results[0].details?.windowCount, null);
  settings.modes[0].lastRun = result; let raw: string | null = null; const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  saveSettings(storage, settings); assert.deepEqual(loadSettings(storage).settings, settings);
});
