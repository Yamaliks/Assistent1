import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSol, defaultVoiceSettings, isVoiceSettings } from '../src/services/solCommands.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
import { switchTargets } from '../src/services/modeSwitching.ts';
import { createModeController } from '../src/services/modeController.ts';
import { createModeRunner } from '../src/services/modeEngine.ts';
import { createSystemServices } from '../src/services/systemServices.ts';
import { createVoiceCapture, microphoneError } from '../src/services/voiceService.ts';
test('SOL resolves Russian aliases and custom mode names from saved data; refuses ambiguous/unknown commands', () => {
  const s = freshSettings();
  for (const phrase of ['Сол, открой Steam', 'открой стим', 'СОЛ открой Стим!']) assert.deepEqual(routeSol(phrase, s), { kind: 'application', id: 'steam' });
  assert.deepEqual(routeSol('Сол открой дискорд', s), { kind: 'application', id: 'discord' });
  assert.deepEqual(routeSol('Сол открой ютуб', s), { kind: 'site', id: s.sites[0].id });
  for (const phrase of ['Сол, включи игровой режим', 'Сол включи игру']) assert.deepEqual(routeSol(phrase, s), { kind: 'mode', id: 'game' });
  assert.deepEqual(routeSol('Сол включи работу', s), { kind: 'mode', id: 'work' });
  s.modes[0].name = 'Монтаж видео'; s.modes[0].phrase = '';
  assert.deepEqual(routeSol('Сол включи режим Монтаж видео', s), { kind: 'mode', id: 'game' });
  s.applications.push({ id: 'duplicate', name: 'Steam', path: '', useDefaultBrowser: false });
  assert.deepEqual(routeSol('открой стим', s), { kind: 'ambiguous' });
  for (const phrase of ['закрой Steam', 'cmd /c shutdown', 'удали папку']) assert.deepEqual(routeSol(phrase, s), { kind: 'unknown' });
  assert.deepEqual(routeSol('Сол покажи команды', s), { kind: 'commands' });
  assert.deepEqual(routeSol('Сол стоп', s), { kind: 'stop' });
  assert.deepEqual(routeSol('привет', s, true), { kind: 'ignored' });
  assert.deepEqual(routeSol('Сол привет', s, true), { kind: 'hello' });
});
test('switch plan excludes shared stable IDs/paths, browsers, disabled apps, sites and folders', () => {
  const settings = freshSettings(); settings.applications[0].path = 'C:\\Apps\\Steam.exe'; settings.applications[1].path = 'C:\\Apps\\Discord.exe';
  settings.modes[0].actions = [{ id: 'steam', kind: 'application', applicationId: 'steam', label: '' }, { id: 'discord', kind: 'application', applicationId: 'discord', label: '' }, { id: 'web', kind: 'application', applicationId: 'browser', label: '' }];
  settings.modes[1].actions = [{ id: 'same-file', kind: 'program', label: '', path: 'c:/apps/discord.EXE' }];
  const plan = switchTargets({ mode: settings.modes[0], settings }, { mode: settings.modes[1], settings });
  assert.deepEqual(plan.previous.map(a => a.id), ['steam']);
  settings.modes[1].actions = [{ id: 'shared-id', kind: 'application', applicationId: 'steam', label: '' }];
  assert.deepEqual(switchTargets({ mode: settings.modes[0], settings }, { mode: settings.modes[1], settings }).previous.map(a => a.id), ['discord']);
});
test('one owner serializes cross-window switching: cancel launches nothing; keep proceeds; restored lastRun alone never closes apps', async () => {
  const settings = freshSettings(); const calls: string[] = []; let confirmations = 0; let allow = false;
  settings.modes.forEach(mode => { mode.actions = [{ id: mode.id, kind: 'website', label: '', url: `https://${mode.id}.example` }]; });
  const runner = createModeRunner(createSystemServices(async (_, target) => { calls.push(target); }));
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const owner = createModeController(() => settings, () => {}, () => true, () => {}, runner, async () => { confirmations++; await gate; return allow; });
  await owner.run('game'); assert.equal(confirmations, 0);
  const request = owner.run('work'); await owner.run('rest'); assert.equal(confirmations, 1); assert.equal(calls.length, 1);
  release(); assert.equal(await request, undefined); assert.equal(calls.length, 1);
  allow = true; await owner.run('rest'); assert.equal(calls.length, 2);
  assert.equal(confirmations, 2);
  // A fresh owner doesn't infer running applications from persisted lastRun.
  const fresh = createModeController(() => settings, () => {}, () => true, () => {}, runner, async () => { throw new Error('No previous session mode'); });
  await fresh.run('work'); assert.equal(calls.length, 3);
});
test('voice settings remain optional in v4; independent toggles persist without losing user data', () => {
  const data = new Map<string, string>(); const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const settings = freshSettings(); settings.modes[0].actions = []; settings.voice = { ...defaultVoiceSettings(), enabled: true, replies: false, volume: 25, deviceId: 'device', wake: true };
  saveSettings(storage, settings); assert.deepEqual(loadSettings(storage).settings, settings);
  assert.equal(isVoiceSettings({ ...settings.voice, volume: 101 }), false);
  const malformed = JSON.parse(data.get(STORAGE_KEY)!); malformed.voice = { bad: true }; data.set(STORAGE_KEY, JSON.stringify(malformed));
  const loaded = loadSettings(storage); assert.ok(loaded.warning); assert.deepEqual(loaded.settings.modes[0].actions, []); assert.equal(loaded.settings.voice, undefined); assert.deepEqual(JSON.parse(data.get(STORAGE_KEY)!).voice, { bad: true });
});
test('microphone denial and missing device are explicit; stopping a pending permission request releases the eventual real stream', async () => {
  assert.match(microphoneError({ name: 'NotAllowedError' }), /разрешения/);
  assert.match(microphoneError({ name: 'NotFoundError' }), /не найден/);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); let resolve!: (stream: MediaStream) => void; let stopped = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(done => { resolve = done; }) } } });
  try {
    const states: string[] = []; const capture = createVoiceCapture(status => states.push(status), async () => { throw new Error('No recognition expected'); });
    const starting = capture.start('', false); await capture.stop();
    resolve({ getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream);
    await starting; assert.equal(stopped, 1); assert.equal(states.at(-1), 'off');
  } finally { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else Reflect.deleteProperty(globalThis, 'navigator'); }
});
test('a close failure remains an error in the persisted mode result even when new actions launch successfully', async () => {
  const settings = freshSettings(); settings.modes.forEach(mode => { mode.actions = []; });
  const saved: unknown[] = [];
  const owner = createModeController(() => settings, () => {}, result => { saved.push(result); return true; }, () => {}, createModeRunner(createSystemServices(async () => {})), async () => ({ proceed: true, results: [{ actionId: 'close', name: 'Закрытие · Steam', status: 'error', message: 'Окно осталось открытым' }] }));
  await owner.run('game'); const result = await owner.run('work');
  assert.equal(result?.status, 'errors'); assert.equal(result?.results[0].status, 'error'); assert.match(result!.summary, /Не закрыто/); assert.equal(saved.length, 2);
});
test('the confirmed next-mode snapshot is the one launched even if settings change while the dialog is open', async () => {
  const settings = freshSettings(); settings.modes[0].actions = [];
  settings.modes[1].actions = [{ id: 'url', kind: 'website', label: 'saved', url: 'https://confirmed.example' }];
  const calls: string[] = [];
  const runner = createModeRunner(createSystemServices(async (_, target) => { calls.push(target); }));
  const owner = createModeController(() => settings, () => {}, () => true, () => {}, runner, async () => { settings.modes[1].actions = [{ id: 'url', kind: 'website', label: 'edited', url: 'https://later-edit.example' }]; return true; });
  await owner.run('game'); await owner.run('work'); assert.deepEqual(calls, ['https://confirmed.example']);
});
test('switching keeps running shared applications with different library IDs and does not mutate saved skip preferences', async () => {
  const settings = freshSettings(); settings.modes[0].actions = []; settings.modes[1].actions = [];
  const discord = settings.applications.find(app => app.id === 'discord')!; discord.path = 'C:\\Apps\\Discord.exe'; discord.skipIfRunning = false;
  settings.applications.push({ ...discord, id: 'other-discord', path: 'c:/apps/discord.EXE' });
  settings.modes[0].actions.push({ id: 'old', kind: 'application', applicationId: 'discord', label: '' });
  settings.modes[1].actions.push({ id: 'shared', kind: 'application', applicationId: 'other-discord', label: '' });
  const before = structuredClone(settings.applications); let launches = 0; let running = false; let dialogs = 0;
  const runner = createModeRunner(createSystemServices(async (_kind, _target, _minimized, guarded) => {
    if (guarded && running) return 'already-running';
    running = true; launches++; return 'launched';
  }));
  const controller = createModeController(() => settings, () => {}, () => true, () => {}, runner, async (previous, next) => {
    const targets = switchTargets(previous, next); if (targets.previous.length) dialogs++; return true;
  });
  await controller.run('game'); const switched = await controller.run('work');
  assert.equal(launches, 1); assert.equal(dialogs, 0); assert.equal(switched?.results[0].status, 'already-running'); assert.deepEqual(settings.applications, before);
  await controller.run('work'); assert.equal(launches, 1); // Repeat card/voice/palette requests use the same owner.
});
