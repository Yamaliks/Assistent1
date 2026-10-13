import test from 'node:test';
import assert from 'node:assert/strict';
import { moveAction, removeCommandActions } from '../src/domain/modes.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('add, reorder, disable and remove actions survive restart; empty list is never repopulated', () => {
  const port = storage(); const settings = freshSettings(); const mode = settings.modes[0]; settings.sites.push({ id: 'my-site', name: 'Сайт', url: 'https://example.com' });
  mode.actions = [
    { id: 'app', kind: 'application', label: 'Steam', applicationId: 'steam', active: true },
    { id: 'web', kind: 'site', label: 'Сайт', siteId: 'my-site', active: false },
    { id: 'dir', kind: 'folder', label: 'Папка', path: 'C:\\Documents', active: true },
  ];
  mode.actions = moveAction(mode.actions, 'dir', -1);
  assert.deepEqual(mode.actions.map(action => action.id), ['app', 'dir', 'web']);
  mode.actions = moveAction(mode.actions, 'app', 1);
  assert.deepEqual(mode.actions.map(action => action.id), ['dir', 'app', 'web']);
  assert.deepEqual(moveAction(mode.actions, 'dir', -1), mode.actions);
  assert.deepEqual(moveAction(mode.actions, 'web', 1), mode.actions);
  mode.actions = mode.actions.filter(action => action.id !== 'dir');
  saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
  assert.equal(loadSettings(port).settings.modes[0].actions[1].active, false);
  mode.actions = []; saveSettings(port, settings);
  assert.deepEqual(loadSettings(port).settings.modes[0].actions, []);
});
test('shared application edits affect both mode references and custom applications survive reload', () => {
  const port = storage(); const settings = freshSettings();
  settings.modes[0].actions = [{ id: 'game-steam', kind: 'application', label: '', applicationId: 'steam' }];
  settings.modes[1].actions = [{ id: 'work-steam', kind: 'application', label: '', applicationId: 'steam' }];
  settings.applications = settings.applications.map(app => app.id === 'steam' ? { ...app, path: 'D:\\Steam\\Steam.exe' } : app);
  settings.applications.push({ id: 'custom-id', name: 'Редактор', path: 'C:\\Apps\\Editor.exe', useDefaultBrowser: false });
  settings.modes[1].actions.push({ id: 'editor', kind: 'application', label: '', applicationId: 'custom-id' });
  saveSettings(port, settings); const loaded = loadSettings(port).settings;
  assert.deepEqual(loaded, settings);
  for (const mode of loaded.modes.slice(0, 2)) {
    const action = mode.actions[0]; assert.equal(action.kind, 'application');
    if (action.kind === 'application') assert.equal(loaded.applications.find(app => app.id === action.applicationId)?.path, 'D:\\Steam\\Steam.exe');
    assert.equal('path' in action, false);
  }
});
test('command references follow edits and deletion removes only linked actions; dangling IDs rejected', () => {
  const port = storage(); const settings = freshSettings();
  settings.commands = [{ id: 'command', name: 'Сайт', phrase: '', kind: 'website', target: 'https://example.com' }];
  settings.modes[0].actions = [{ id: 'ref', kind: 'command', label: '', commandId: 'command' }, { id: 'steam', kind: 'application', label: '', applicationId: 'steam' }];
  settings.commands[0].target = 'https://example.org'; saveSettings(port, settings);
  assert.equal(loadSettings(port).settings.commands[0].target, 'https://example.org');
  settings.commands = []; assert.throws(() => saveSettings(port, settings));
  settings.modes = removeCommandActions(settings.modes, new Set());
  assert.deepEqual(settings.modes[0].actions.map(action => action.id), ['steam']);
  saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
  settings.modes[0].actions = [{ id: 'bad', kind: 'application', label: '', applicationId: 'missing' }];
  assert.throws(() => saveSettings(port, settings));
});
test('3A settings keep paths, commands, modes and empty lists; legacy inline EXEs migrate once to shared IDs', () => {
  const port = storage(); const settings = freshSettings();
  settings.applications[0].path = 'C:\\Steam\\Steam.exe';
  settings.modes[2].actions = [];
  settings.modes[0].actions = [{ id: 'old', kind: 'program', label: 'Steam', path: 'C:\\Steam\\Steam.exe' }];
  settings.modes[1].actions = [{ id: 'custom', kind: 'program', label: 'Редактор', path: 'C:\\Apps\\Editor.exe' }];
  const raw = JSON.stringify({ version: 2, ...settings }); port.setItem(STORAGE_KEY, raw);
  const loaded = loadSettings(port); assert.equal(loaded.warning, undefined);
  assert.equal(port.getItem(STORAGE_KEY), raw);
  assert.deepEqual(loaded.settings.modes[0].actions[0], { id: 'old', kind: 'application', label: 'Steam', applicationId: 'steam' });
  assert.deepEqual(loaded.settings.modes[2].actions, []);
  saveSettings(port, loaded.settings);
  const reloaded = loadSettings(port).settings;
  assert.equal(reloaded.applications.length, 6);
  assert.equal(reloaded.modes[1].actions[0].id, 'custom');
  saveSettings(port, reloaded); assert.deepEqual(loadSettings(port).settings, reloaded);
});
