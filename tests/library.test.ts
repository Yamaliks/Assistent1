import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultModes, removeLibraryActions, type Mode } from '../src/domain/modes.ts';
import { libraryModeTemplate } from '../src/domain/sites.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('standalone applications and sites survive reload and share changes across mode references', () => {
  const port = storage(); const settings = freshSettings();
  settings.applications.push({ id: 'editor', name: 'Редактор', path: 'C:\\Apps\\Editor.exe', useDefaultBrowser: false });
  settings.sites.push({ id: 'twitch', name: 'Twitch', url: 'https://twitch.tv' });
  for (const mode of settings.modes.slice(0, 2)) mode.actions = [{ id: `${mode.id}:editor`, kind: 'application', label: '', applicationId: 'editor' }, { id: `${mode.id}:twitch`, kind: 'site', label: '', siteId: 'twitch' }];
  settings.applications = settings.applications.map(app => app.id === 'editor' ? { ...app, name: 'Мой редактор', path: 'D:\\Apps\\Editor.exe' } : app);
  settings.sites = settings.sites.map(site => site.id === 'twitch' ? { ...site, name: 'Видео', url: 'https://example.com' } : site);
  saveSettings(port, settings); const loaded = loadSettings(port); assert.equal(loaded.warning, undefined); assert.deepEqual(loaded.settings, settings);
  for (const mode of loaded.settings.modes.slice(0, 2)) {
    assert.equal('path' in mode.actions[0], false); assert.equal('url' in mode.actions[1], false);
    assert.equal(mode.actions[0].kind === 'application' && loaded.settings.applications.find(app => app.id === mode.actions[0].applicationId)?.path, 'D:\\Apps\\Editor.exe');
    assert.equal(mode.actions[1].kind === 'site' && loaded.settings.sites.find(site => site.id === mode.actions[1].siteId)?.url, 'https://example.com');
  }
});
test('removing one action leaves the library and other mode intact; library deletion removes only linked actions', () => {
  const port = storage(); const settings = freshSettings();
  settings.sites.push({ id: 'shared', name: 'Сайт', url: 'https://example.com' });
  settings.modes[0].actions = [{ id: 'a', kind: 'site', label: '', siteId: 'shared' }];
  settings.modes[1].actions = [{ id: 'b', kind: 'site', label: '', siteId: 'shared' }, { id: 'folder', kind: 'folder', label: 'Папка', path: 'C:\\Docs' }];
  settings.modes[0].actions = [];
  saveSettings(port, settings); assert.equal(loadSettings(port).settings.modes[1].actions.length, 2);
  assert.ok(loadSettings(port).settings.sites.some(site => site.id === 'shared'));
  settings.modes = removeLibraryActions(settings.modes, 'site', 'shared'); settings.sites = settings.sites.filter(site => site.id !== 'shared');
  settings.modes = removeLibraryActions(settings.modes, 'application', 'steam'); settings.applications = settings.applications.filter(app => app.id !== 'steam');
  saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
  assert.deepEqual(settings.modes[1].actions.map(action => action.id), ['folder']);
  assert.equal(libraryModeTemplate('game', 'new', settings.applications, settings.sites).actions.some(action => action.kind === 'application' && action.applicationId === 'steam'), false);
});
test('legacy inline sites migrate once without changing order, activity, IDs, commands, folders or source bytes', () => {
  for (const version of [1, 2, 3]) {
    const port = storage(); const settings = freshSettings();
    const modes: Mode[] = structuredClone(defaultModes); modes.forEach(mode => { mode.actions = []; });
    modes[0].actions = [{ id: 'old-site', kind: 'website', label: 'Twitch', url: 'https://twitch.tv', active: false }, { id: 'old-folder', kind: 'folder', label: 'Папка', path: 'C:\\Docs' }];
    modes[1].actions = [{ id: 'second', kind: 'website', label: 'Twitch', url: 'https://twitch.tv' }];
    const commands = [{ id: 'cmd', name: 'Команда', phrase: '', kind: 'website', target: 'https://example.org' }];
    const raw = JSON.stringify({ version, modes, compactHints: false, commands, applications: settings.applications }); port.setItem(STORAGE_KEY, raw);
    const loaded = loadSettings(port); assert.equal(loaded.warning, undefined);
    assert.equal(port.getItem(STORAGE_KEY), raw); assert.equal(loaded.settings.sites.length, 1);
    assert.equal(loaded.settings.modes[0].actions[0].id, 'old-site'); assert.equal(loaded.settings.modes[0].actions[0].active, false);
    assert.deepEqual(loaded.settings.modes[0].actions[1], modes[0].actions[1]);
    assert.deepEqual(loaded.settings.modes[2].actions, []);
    assert.deepEqual(loaded.settings.commands, version === 1 ? [] : commands);
    saveSettings(port, loaded.settings); assert.deepEqual(loadSettings(port).settings, loaded.settings);
    saveSettings(port, loadSettings(port).settings); assert.equal(loadSettings(port).settings.sites.length, 1);
  }
});
test('invalid URLs and dangling references rejected; template reuses edited sites without copies', () => {
  const port = storage(); const settings = freshSettings();
  settings.sites[0].url = 'https://example.org';
  const template = libraryModeTemplate('rest', 'new', settings.applications, settings.sites);
  assert.equal(template.sites.length, settings.sites.length);
  assert.equal(template.actions[0].kind === 'site' && template.actions[0].siteId, settings.sites[0].id);
  settings.sites[0].url = 'javascript:alert(1)'; assert.throws(() => saveSettings(port, settings));
  settings.sites[0].url = 'https://example.org';
  settings.modes[0].actions = [{ id: 'dangling', kind: 'site', label: '', siteId: 'absent' }];
  assert.throws(() => saveSettings(port, settings));
  const raw = JSON.stringify({ version: 4, ...settings }); port.setItem(STORAGE_KEY, raw);
  assert.ok(loadSettings(port).warning); assert.equal(port.getItem(STORAGE_KEY), raw);
});
