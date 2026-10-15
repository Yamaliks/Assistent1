import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceCapture } from '../src/services/voiceService.ts';
import { defaultVoiceSettings } from '../src/services/solCommands.ts';

test('new SOL settings enable offline replies independently of microphone', () => {
  assert.equal(defaultVoiceSettings().replies, true);
  assert.equal(defaultVoiceSettings().enabled, false);
});

test('SOL discards in-flight and queued recognition while its own response is playing', async () => {
  const saved = new Map(['window', 'navigator', 'AudioContext', 'AudioWorkletNode'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let listening = true; let feeds = 0; let finishFeed!: (text: string) => void;
  let port!: { onmessage?: (event: { data: Int16Array }) => void };
  const phrases: string[] = [];
  const replace = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, value });
  replace('window', { __TAURI_INTERNALS__: { invoke: async (command: string) => {
    if (command === 'sol_start') return 'test-session';
    if (command === 'sol_feed') { feeds++; return new Promise<string>(resolve => { finishFeed = resolve; }); }
  } } });
  const track = { stop() {}, onended: null };
  replace('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
  replace('AudioContext', class {
    sampleRate = 16000; state = 'running'; destination = {};
    audioWorklet = { addModule: async () => {} };
    async resume() {} async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  });
  replace('AudioWorkletNode', class { port = port = {}; connect() {} disconnect() {} });
  const capture = createVoiceCapture(() => {}, async phrase => { phrases.push(phrase); }, () => listening);
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  try {
    await capture.start('', true);
    port.onmessage!({ data: new Int16Array([1, 2]) }); await tick();
    assert.equal(feeds, 1);
    listening = false; finishFeed('сол включи работу'); await tick();
    assert.deepEqual(phrases, []);
    port.onmessage!({ data: new Int16Array([3, 4]) }); await tick(); assert.equal(feeds, 1);
    listening = true;
    port.onmessage!({ data: new Int16Array([5, 6]) }); await tick();
    finishFeed('сол привет'); await tick(); assert.deepEqual(phrases, ['сол привет']);
  } finally {
    await capture.stop();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
