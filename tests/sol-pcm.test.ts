import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('actual AudioWorklet converts/downmixes PCM16 blocks, clips safely and emits silence to speakers', () => {
  const blocks: Int16Array[] = []; let Processor: any;
  class Base { port = { postMessage: (block: Int16Array) => blocks.push(block) }; }
  runInNewContext(readFileSync(new URL('../public/sol-pcm.js', import.meta.url), 'utf8'), { AudioWorkletProcessor: Base, registerProcessor: (_name: string, type: any) => { Processor = type; } });
  const worklet = new Processor();
  const left = new Float32Array(4096).fill(2); const right = new Float32Array(4096).fill(-0.5); const output = new Float32Array(4096).fill(1);
  worklet.process([[left, right]], [[output]]);
  assert.equal(blocks.length, 1); assert.equal(blocks[0][0], 24575); assert.ok(output.every(value => value === 0));
  worklet.process([[new Float32Array(4096).fill(-2)]], [[output]]); assert.equal(blocks[1][0], -32768);
});
