import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultModes, isModeList } from '../src/domain/modes.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
import { routeCommand } from '../src/services/commandRouter.ts';
import { planMode } from '../src/services/modeEngine.ts';
import { systemServices } from '../src/services/systemServices.ts';
import { voiceService } from '../src/services/voiceService.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test('defaults do not assume installed applications; returned settings are independent', () => {
  assert.ok(isModeList(defaultModes));
  assert.ok(defaultModes.every(mode => mode.actions.every(action => action.kind !== 'program')));
  assert.equal(defaultModes.find(mode => mode.id === 'night')?.actions.length, 0);
  const a = freshSettings(); a.modes[0].name = 'Changed';
  assert.equal(freshSettings().modes[0].name, 'Игра');
});
test('settings survive a versioned storage roundtrip', () => {
  const storage = memoryStorage(); const settings = freshSettings();
  settings.modes[0].name = 'Мой режим'; settings.compactHints = false;
  saveSettings(storage, settings);
  assert.deepEqual(loadSettings(storage).settings, settings);
});
test('malformed and future settings produce a warning without overwriting original data', () => {
  for (const raw of ['{', 'null', '{"version":2,"modes":[]}', '{"version":1,"modes":[{"id":"x"}],"compactHints":true}']) {
    const storage = memoryStorage(); storage.setItem(STORAGE_KEY, raw);
    assert.ok(loadSettings(storage).warning); assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});
test('invalid actions and duplicate identities are rejected', () => {
  const modes = structuredClone(defaultModes);
  assert.equal(isModeList([modes[0], modes[0]]), false);
  modes[0].actions = [{ id: 'v', kind: 'volume', label: 'Громкость', level: 101 }];
  assert.equal(isModeList(modes), false);
  modes[0].actions[0] = { id: 'v', kind: 'volume', label: 'Громкость', level: 50 };
  assert.equal(isModeList(modes), true);
});
test('router recognizes Russian names and phrases but rejects executable commands', () => {
  assert.deepEqual(routeCommand('  ИГРА  ', defaultModes), { kind: 'mode', modeId: 'game' });
  assert.deepEqual(routeCommand('включи   рабочий режим', defaultModes), { kind: 'mode', modeId: 'work' });
  assert.deepEqual(routeCommand('настройки', defaultModes), { kind: 'navigate', page: 'settings' });
  for (const input of ['', 'cmd /c shutdown /s', 'Игра && calc.exe']) assert.deepEqual(routeCommand(input, defaultModes), { kind: 'unknown' });
});
test('browser cannot execute system actions; voice is unavailable and close requests cancel', async () => {
  assert.equal(planMode(defaultModes[0]).executable, false);
  await assert.rejects(systemServices.execute({ id: 'x', kind: 'website', label: 'Example', url: 'https://example.com' }));
  assert.equal(await systemServices.requestProgramClose('example.exe'), 'cancelled');
  assert.equal(voiceService.status, 'unavailable'); await assert.rejects(voiceService.start());
});
