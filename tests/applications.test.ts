import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultApplications, isApplicationList } from '../src/domain/applications.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('five stable IDs, empty paths and default browser; damaged application data is rejected', () => {
  const apps = defaultApplications();
  assert.deepEqual(apps.map(app => app.id), ['steam', 'discord', 'telegram', 'vpn', 'browser']);
  assert.equal(apps[4].useDefaultBrowser, true);
  assert.equal(isApplicationList(apps), true);
  assert.equal(isApplicationList([...apps.slice(0, 4), apps[0]]), false);
  assert.equal(isApplicationList(apps.map(app => ({ ...app, path: 'cmd /c calc.exe' }))), false);
});
test('legacy v2 migration preserves commands and mode drafts without rewriting storage', () => {
  const port = storage(); const settings = freshSettings();
  settings.modes[0].name = 'Мой режим';
  const { applications: _apps, ...legacy } = settings;
  const raw = JSON.stringify({ version: 2, ...legacy }); port.setItem(STORAGE_KEY, raw);
  assert.deepEqual(loadSettings(port).settings, settings);
  assert.equal(port.getItem(STORAGE_KEY), raw);
});
test('paths can be saved, restored, changed and switched to default browser in the same storage', () => {
  const port = storage(); const settings = freshSettings();
  settings.applications[0].path = 'C:\\Games\\Steam.exe';
  settings.applications[4] = { id: 'browser', path: 'C:\\Apps\\Browser.exe', useDefaultBrowser: false };
  saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
  settings.applications[0].path = 'D:\\Steam\\Steam.exe';
  settings.applications[4] = { id: 'browser', path: '', useDefaultBrowser: true };
  saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
});
