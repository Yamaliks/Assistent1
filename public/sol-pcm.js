// Runs locally in WebView's audio thread. Emits mono PCM16; never routes microphone audio to speakers.
class SolPCM extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Int16Array(4096); this.used = 0; }
  process(inputs, outputs) {
    const channels = inputs[0];
    if (channels?.length) for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] ?? 0;
      value = Math.max(-1, Math.min(1, value / channels.length));
      this.buffer[this.used++] = Math.round(value * (value < 0 ? 32768 : 32767));
      if (this.used === this.buffer.length) { this.port.postMessage(this.buffer, [this.buffer.buffer]); this.buffer = new Int16Array(4096); this.used = 0; }
    }
    for (const output of outputs) for (const channel of output) channel.fill(0);
    return true;
  }
}
registerProcessor('sol-pcm', SolPCM);
