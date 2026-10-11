import test from 'node:test';
import assert from 'node:assert/strict';
import { isCommandList, targetError, type UserCommand } from '../src/domain/commands.ts';
import { routeCommand } from '../src/services/commandRouter.ts';
import { freshSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/services/settingsStorage.ts';
import { createSystemServices } from '../src/services/systemServices.ts';
import { executeUserCommand, planMode } from '../src/services/modeEngine.ts';
const command: UserCommand = { id: 'site', name: 'Документация', phrase: 'открой документацию', kind: 'website', target: 'https://example.com' };
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('v1 settings migrate without losing modes or hints or rewriting stored bytes', () => {
  const port = storage(); const old = freshSettings(); old.modes[0].name = 'Старое имя'; old.compactHints = false;
  const raw = JSON.stringify({ version: 1, modes: old.modes, compactHints: old.compactHints }); port.setItem(STORAGE_KEY, raw);
  assert.deepEqual(loadSettings(port).settings, old); assert.equal(port.getItem(STORAGE_KEY), raw);
});
test('user commands survive v2 reload and corrupt commands do not replace originals', () => {
  const port = storage(); const settings = { ...freshSettings(), commands: [command] };
  saveSettings(port, settings); assert.deepEqual(loadSettings(port).settings, settings);
  const corrupt = JSON.stringify({ version: 2, ...settings, commands: [{ ...command, target: 'javascript:alert(1)' }] });
  port.setItem(STORAGE_KEY, corrupt); assert.ok(loadSettings(port).warning); assert.equal(port.getItem(STORAGE_KEY), corrupt);
});
test('targets reject shell lines, unsafe schemes, network paths and Windows devices', () => {
  for (const url of ['file:///C:/app.exe', 'javascript:alert(1)', 'https:example.com', 'https://u:p@example.com', 'https://example.com\n']) assert.ok(targetError('website', url));
  for (const path of ['cmd /c calc.exe', 'C:\\a.exe /c calc', 'C:\\a.bat', '\\\\server\\a.exe', '\\\\?\\C:\\a.exe', 'C:\\a.exe:other.exe', 'C:\\..\\a.exe', 'C:\\NUL.exe']) assert.ok(targetError('program', path));
  assert.equal(targetError('program', 'C:\\Program Files\\Приложение\\App.exe'), undefined);
  assert.equal(targetError('folder', 'C:\\Users\\Имя\\Documents'), undefined);
  assert.equal(isCommandList([command, command]), false);
});
test('palette routes saved commands and reports collisions instead of picking an action', () => {
  assert.deepEqual(routeCommand('ОТКРОЙ  ДОКУМЕНТАЦИЮ', [], [command]), { kind: 'action', commandId: command.id });
  assert.deepEqual(routeCommand('команды', [], [command]), { kind: 'navigate', page: 'commands' });
  assert.deepEqual(routeCommand(command.name, [], [command, { ...command, id: 'other' }]), { kind: 'ambiguous' });
  assert.deepEqual(routeCommand('Документация && calc.exe', [], [command]), { kind: 'unknown' });
});
test('command execution forwards exactly one typed target and propagates backend errors', async () => {
  const calls: unknown[] = []; const services = createSystemServices(async (kind, target) => { calls.push({ kind, target }); });
  assert.match(await executeUserCommand(command, services), /запрос открытия отправлен/);
  assert.deepEqual(calls, [{ kind: 'website', target: command.target }]);
  await executeUserCommand({ ...command, kind: 'program', target: 'C:\\Apps\\App.exe' }, services);
  await executeUserCommand({ ...command, kind: 'folder', target: 'D:\\Music' }, services);
  assert.equal(calls.length, 3);
  await assert.rejects(executeUserCommand(command, createSystemServices(async () => { throw new Error('Доступ запрещён'); })), /Доступ запрещён/);
  await assert.rejects(executeUserCommand({ ...command, target: 'javascript:alert(1)' }, services));
  assert.equal(calls.length, 3);
  assert.equal(planMode(freshSettings().modes[0]).executable, false);
});
