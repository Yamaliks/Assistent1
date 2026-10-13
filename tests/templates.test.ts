import test from 'node:test';
import assert from 'node:assert/strict';
import { modeTemplate } from '../src/domain/modes.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('new modes get recommended apps without EXE paths; optional entries disabled and night honest', () => {
  assert.deepEqual(modeTemplate('game', 'new').map(action => action.kind === 'application' && action.applicationId), ['steam', 'discord', 'vpn', 'browser']);
  assert.equal(modeTemplate('work', 'new')[2].active, false);
  assert.equal(modeTemplate('rest', 'new')[0].kind, 'website');
  assert.equal(modeTemplate('rest', 'new')[3].active, false);
  assert.deepEqual(modeTemplate('night', 'new'), []);
  const settings = freshSettings(); const port = storage();
  saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
  assert.ok(settings.applications.every(app => app.path === ''));
  const template = modeTemplate('game', 'new'); template.pop();
  assert.equal(modeTemplate('game', 'new').length, 4);
});
test('v1/v2/v3 existing modes, deleted recommendations and user sites are never replaced', () => {
  for (const version of [1, 2, 3]) {
    const settings = freshSettings(); const port = storage();
    settings.modes[0].actions = [{ id: 'user-site', kind: 'website', label: 'Twitch', url: 'https://twitch.tv' }];
    settings.modes[1].actions = [];
    const raw = JSON.stringify({ version, ...settings }); port.setItem(STORAGE_KEY, raw);
    const loaded = loadSettings(port); assert.equal(loaded.warning, undefined);
    assert.deepEqual(loaded.settings.modes, settings.modes);
    assert.equal(port.getItem(STORAGE_KEY), raw);
    loaded.settings.modes[0].actions = [];
    saveSettings(port, loaded.settings);
    assert.deepEqual(loadSettings(port).settings.modes[0].actions, []);
    // Explicit restore changes only this mode, not the shared paths or other modes.
    loaded.settings.modes[0].actions = modeTemplate('game', loaded.settings.modes[0].id);
    loaded.settings.applications[0].path = 'D:\\Steam\\Steam.exe';
    saveSettings(port, loaded.settings);
    const restored = loadSettings(port).settings;
    assert.equal(restored.modes[0].actions.length, 4);
    assert.deepEqual(restored.modes[1].actions, []);
    assert.equal(restored.applications[0].path, 'D:\\Steam\\Steam.exe');
  }
});
