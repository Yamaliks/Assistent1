import test from 'node:test';
import assert from 'node:assert/strict';
import { createModeRunner } from '../src/services/modeEngine.ts';
import { createSystemServices } from '../src/services/systemServices.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
import { addLibraryAction } from '../src/services/libraryEditing.ts';
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('launches saved library references sequentially, waits for each call, skips disabled and rejects double run', async () => {
  const settings = freshSettings(); const mode = settings.modes[0];
  settings.applications[0].path = 'C:\\Apps\\Steam.exe';
  mode.actions = [{ id: 'exe', kind: 'application', label: '', applicationId: 'steam' }, { id: 'disabled', kind: 'site', label: '', siteId: settings.sites[0].id, active: false }, { id: 'web', kind: 'site', label: '', siteId: settings.sites[0].id }];
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); const requests: string[] = [];
  const runner = createModeRunner(createSystemServices(async (kind, target) => { requests.push(`${kind}:${target}`); if (kind === 'program') await gate; }));
  const running = runner.run(mode, settings);
  assert.deepEqual(requests, ['program:C:\\Apps\\Steam.exe']); assert.equal(runner.isRunning(mode.id), true);
  await assert.rejects(runner.run(mode, settings), /уже запускается/);
  // Subsequent steps must keep the saved snapshot despite edits during a launch.
  settings.sites[0].url = 'https://changed.example';
  release(); const result = await running;
  assert.deepEqual(requests, ['program:C:\\Apps\\Steam.exe', 'website:https://youtube.com']);
  assert.deepEqual(result.results.map(item => item.status), ['success', 'skipped', 'success']);
  assert.equal(result.status, 'ready'); assert.equal(runner.isRunning(mode.id), false);
  await runner.run(mode, settings); assert.equal(requests.length, 4);
});
test('missing EXE, backend rejection and unconfigured URL produce errors but later folder and command run', async () => {
  const settings = freshSettings(); const mode = settings.modes[0];
  settings.applications[0].path = 'C:\\Missing\\Steam.exe'; settings.applications[1].path = '';
  settings.commands.push({ id: 'cmd', name: 'Документы', phrase: '', kind: 'folder', target: 'C:\\Docs' });
  mode.actions = [
    { id: 'missing', kind: 'application', label: '', applicationId: 'steam' },
    { id: 'empty', kind: 'application', label: '', applicationId: 'discord' },
    { id: 'music', kind: 'site', label: '', siteId: settings.sites[1].id },
    { id: 'folder', kind: 'folder', label: 'Работа', path: 'D:\\Work' },
    { id: 'command', kind: 'command', label: '', commandId: 'cmd' },
  ];
  const requests: string[] = [];
  const runner = createModeRunner(createSystemServices(async (kind, target) => { requests.push(`${kind}:${target}`); if (target.includes('Missing')) throw new Error('EXE не найден'); }));
  const result = await runner.run(mode, settings);
  assert.equal(result.status, 'errors'); assert.deepEqual(result.results.map(item => item.status), ['error', 'error', 'error', 'success', 'success']);
  assert.match(result.results[0].message, /EXE не найден/); assert.match(result.results[1].message, /не настроен/);
  assert.deepEqual(requests, ['program:C:\\Missing\\Steam.exe', 'folder:D:\\Work', 'folder:C:\\Docs']);
  assert.match(result.summary, /ошибок 3/);
});
test('legacy inline website/program and invalid targets run through existing validation without false success', async () => {
  const settings = freshSettings(); const mode = settings.modes[0];
  mode.actions = [{ id: 'old-exe', kind: 'program', label: 'Старое приложение', path: 'C:\\Apps\\Old.exe' }, { id: 'bad', kind: 'website', label: 'Неверный URL', url: 'javascript:alert(1)' }, { id: 'old-web', kind: 'website', label: 'Сайт', url: 'https://example.com' }, { id: 'unsupported', kind: 'volume', label: 'Громкость', level: 30 }];
  const requests: string[] = []; const result = await createModeRunner(createSystemServices(async (kind, target) => { requests.push(`${kind}:${target}`); })).run(mode, settings);
  assert.deepEqual(result.results.map(item => item.status), ['success', 'error', 'success', 'error']);
  assert.deepEqual(requests, ['program:C:\\Apps\\Old.exe', 'website:https://example.com']);
  assert.equal(result.status, 'errors');
});
test('mode and final results persist together without changing IDs, restoring deletions or losing new edits', async () => {
  const port = storage(); const settings = freshSettings(); const mode = settings.modes[0];
  mode.actions = [{ id: 'kept', kind: 'site', label: '', siteId: settings.sites[0].id }];
  saveSettings(port, settings); const saved = loadSettings(port).settings;
  const result = await createModeRunner(createSystemServices(async () => {})).run(saved.modes[0], saved);
  saved.modes[0].lastRun = result; saved.modes[0].description = 'Новая настройка'; saveSettings(port, saved);
  const loaded = loadSettings(port).settings;
  assert.deepEqual(loaded, saved); assert.equal(loaded.modes[0].actions.length, 1);
  const added = addLibraryAction(loaded, mode, loaded.applications[0], 'new-action');
  assert.deepEqual(added.mode.lastRun, result); assert.deepEqual(added.settings.modes[0].lastRun, result);
  const raw = JSON.stringify({ version: 4, ...saved, modes: [{ ...saved.modes[0], lastRun: { ...result, status: 'fake' } }] });
  port.setItem(STORAGE_KEY, raw); assert.ok(loadSettings(port).warning); assert.equal(port.getItem(STORAGE_KEY), raw);
});
test('missing references are explained; default browser launches without URL and disabled entries never execute', async () => {
  const settings = freshSettings(); const mode = settings.modes[0]; let calls = 0;
  mode.actions = [{ id: 'app', kind: 'application', label: 'Удалено', applicationId: 'missing' }, { id: 'browser', kind: 'application', label: '', applicationId: 'browser' }, { id: 'command', kind: 'command', label: '', commandId: 'missing' }, { id: 'disabled', kind: 'application', label: '', applicationId: 'missing', active: false }];
  const runner = createModeRunner(createSystemServices(async () => { calls++; }));
  const result = await runner.run(mode, settings);
  assert.equal(calls, 1); assert.deepEqual(result.results.map(item => item.status), ['error', 'success', 'error', 'skipped']);
  assert.equal(result.results[1].status, 'success'); assert.equal(runner.isRunning(mode.id), false);
});
