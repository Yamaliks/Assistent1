import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSettings, loadSettings, saveSettings } from '../src/services/settingsStorage.ts';
import { createUserMode, deleteUserMode } from '../src/services/userModes.ts';
import { createModeRunner } from '../src/services/modeEngine.ts';
import { createSystemServices } from '../src/services/systemServices.ts';
import { routeCommand } from '../src/services/commandRouter.ts';
import { searchPalette } from '../src/services/paletteSearch.ts';
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('already-running default browser does not launch again; explicit sites still launch normally', async () => {
  const settings = freshSettings(); const mode = settings.modes[0];
  mode.actions = [{ id: 'browser', kind: 'application', label: '', applicationId: 'browser' }, { id: 'youtube', kind: 'site', label: '', siteId: settings.sites[0].id }];
  let browserOpen = false; const launches: string[] = [];
  const runner = createModeRunner(createSystemServices(async (kind, target, _minimized, skip) => {
    if (kind === 'browser') { assert.equal(skip, true); assert.equal(target, ''); if (browserOpen) return 'already-running'; browserOpen = true; }
    launches.push(`${kind}:${target}`); return 'launched';
  }));
  const first = await runner.run(mode, settings); assert.equal(first.results[0].status, 'success');
  const second = await runner.run(mode, settings); assert.equal(second.results[0].status, 'already-running'); assert.equal(second.results[1].status, 'success');
  assert.deepEqual(launches, ['browser:', 'website:https://youtube.com', 'website:https://youtube.com']);
});
test('skip-if-running setting passes safe intent; uncertain identity is an error and later actions continue', async () => {
  const settings = freshSettings(); settings.applications[0] = { ...settings.applications[0], path: 'C:\\Apps\\Steam.exe', skipIfRunning: true };
  const mode = settings.modes[0]; mode.launchMinimized = true;
  mode.actions = [{ id: 'app', kind: 'application', label: '', applicationId: 'steam' }, { id: 'site', kind: 'site', label: '', siteId: settings.sites[0].id }];
  let unknown = false;
  const runner = createModeRunner(createSystemServices(async (kind, _target, minimized, skip) => {
    if (kind === 'program') { assert.equal(minimized, true); assert.equal(skip, true); if (unknown) throw new Error('Не удалось достоверно проверить путь'); return 'already-running'; }
    return 'launched';
  }));
  assert.equal((await runner.run(mode, settings)).results[0].status, 'already-running');
  unknown = true; const result = await runner.run(mode, settings); assert.equal(result.status, 'errors');
  assert.deepEqual(result.results.map(result => result.status), ['error', 'success']);
  const port = storage(); mode.lastRun = result; saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
});
test('custom empty/template modes have stable IDs independent of names; rename, delete and reload retain library', async () => {
  const port = storage(); const before = freshSettings();
  let settings = createUserMode(before, '  Учёба  ', 'work', 'empty', 'study-id');
  assert.equal(settings.modes.at(-1)?.id, 'study-id'); assert.equal(settings.modes.at(-1)?.name, 'Учёба'); assert.deepEqual(settings.modes.at(-1)?.actions, []);
  assert.equal(before.modes.length, 4); assert.deepEqual(settings.applications, before.applications);
  settings = createUserMode(settings, 'Стрим', 'rest', 'game', 'stream-id');
  const stream = settings.modes.at(-1)!; assert.equal(stream.icon, 'rest'); assert.equal(stream.template, 'game'); assert.equal(stream.actions.length, 4);
  assert.throws(() => createUserMode(settings, 'стрим', 'work', 'empty', 'copy'));
  assert.throws(() => createUserMode(settings, '   ', 'work', 'empty', 'empty'));
  settings.modes = settings.modes.map(mode => mode.id === 'study-id' ? { ...mode, name: 'Мой вечер', icon: 'night' } : mode);
  saveSettings(port, settings); settings = loadSettings(port).settings;
  assert.deepEqual(routeCommand('Мой вечер', settings.modes), { kind: 'mode', modeId: 'study-id' });
  assert.equal(searchPalette(settings, 'Мой вечер')[0].id, 'study-id');
  const custom = settings.modes.find(mode => mode.id === 'study-id')!;
  custom.actions = [{ id: 'url', kind: 'site', label: '', siteId: settings.sites[0].id }];
  const result = await createModeRunner(createSystemServices(async () => 'launched')).run(custom, settings); assert.equal(result.status, 'ready');
  custom.lastRun = result; saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
  const deleted = deleteUserMode(settings, custom.id); saveSettings(port, deleted);
  const restored = loadSettings(port).settings; assert.equal(restored.modes.some(mode => mode.id === 'study-id'), false);
  assert.deepEqual(restored.applications, settings.applications); assert.deepEqual(restored.sites, settings.sites);
  assert.equal(restored.modes.some(mode => mode.id === 'stream-id'), true);
});
test('saved program commands inside modes respect shared skip setting without changing command IDs or targets', async () => {
  const settings = freshSettings(); settings.applications[0] = { ...settings.applications[0], path: 'C:\\Apps\\Steam.exe', skipIfRunning: true };
  settings.commands.push({ id: 'command', name: 'Открой Steam', phrase: '', kind: 'program', target: 'c:/apps/STEAM.EXE' });
  settings.modes[0].actions = [{ id: 'ref', kind: 'command', label: '', commandId: 'command' }];
  const result = await createModeRunner(createSystemServices(async (kind, target, _minimized, skip) => {
    assert.equal(kind, 'program'); assert.equal(target, 'c:/apps/STEAM.EXE'); assert.equal(skip, true); return 'already-running';
  })).run(settings.modes[0], settings);
  assert.equal(result.results[0].status, 'already-running'); assert.equal(settings.commands[0].id, 'command');
});
