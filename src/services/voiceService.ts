// Real WebView microphone -> mono PCM16 -> local Vosk. No network speech API.
import { invoke } from '@tauri-apps/api/core';
export type VoiceStatus = 'off' | 'listening' | 'recognizing' | 'error';
export function microphoneError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Нет разрешения на микрофон. Разрешите доступ WebView2 и классическим приложениям в параметрах конфиденциальности Windows.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Микрофон не найден. Подключите устройство или выберите другой микрофон.';
  if (name === 'NotReadableError') return 'Микрофон занят или недоступен Windows.';
  return error instanceof Error ? error.message : String(error);
}
export function createVoiceCapture(onStatus: (status: VoiceStatus, error?: string) => void, onPhrase: (phrase: string) => Promise<void>, shouldListen: () => boolean = () => true) {
  let stream: MediaStream | undefined; let context: AudioContext | undefined; let source: MediaStreamAudioSourceNode | undefined; let node: AudioWorkletNode | undefined; let token: string | undefined;
  let handling = false; let generation = 0; let starting = false;
  async function stop() {
    const stopped = ++generation; starting = false;
    node?.disconnect(); if (node) node.port.onmessage = null; node = undefined;
    source?.disconnect(); source = undefined;
    stream?.getTracks().forEach(track => track.stop()); stream = undefined;
    const oldContext = context; context = undefined; if (oldContext && oldContext.state !== 'closed') await oldContext.close().catch(() => {});
    const oldToken = token; token = undefined; if (oldToken !== undefined) await invoke('sol_stop', { token: oldToken }).catch(() => {});
    if (generation === stopped) onStatus('off');
  }
  async function start(deviceId: string, continuous: boolean) {
    if (starting || stream || token !== undefined) return;
    starting = true; const own = ++generation;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('WebView не предоставляет доступ к микрофону. Обновите WebView2 и проверьте разрешения Windows.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (generation !== own) { media.getTracks().forEach(track => track.stop()); return; }
      stream = media; context = new AudioContext({ latencyHint: 'interactive', sampleRate: 16000 });
      await context.audioWorklet.addModule('/sol-pcm.js'); await context.resume();
      if (generation !== own || !context) return;
      const nativeToken = await invoke<string>('sol_start', { rate: context.sampleRate });
      if (generation !== own) { await invoke('sol_stop', { token: nativeToken }); return; }
      token = nativeToken; source = context.createMediaStreamSource(media); node = new AudioWorkletNode(context, 'sol-pcm');
      const pending = { count: 0 }; let queue = Promise.resolve();
      node.port.onmessage = (event: MessageEvent<Int16Array>) => {
        if (generation !== own || handling || !shouldListen()) return;
        if (++pending.count > 12) { void fail(new Error('SOL не успевает обработать звук. Прослушивание остановлено.'), own); return; }
        const samples = Array.from(event.data);
        queue = queue.then(async () => {
          if (generation !== own || !shouldListen()) return;
          const text = await invoke<string | null>('sol_feed', { token: nativeToken, samples });
          if (text && generation === own) {
            handling = true; onStatus('recognizing');
            if (!continuous) await stop();
            const afterStop = generation; onStatus('recognizing');
            try { await onPhrase(text); } finally { handling = false; if (!continuous && generation === afterStop) onStatus('off'); }
            if (continuous && generation === own) onStatus('listening');
          }
        }).catch(error => { if (generation === own) return fail(error, own); }).finally(() => { pending.count--; });
      };
      media.getAudioTracks().forEach(track => { track.onended = () => { if (generation === own) void fail(new Error('Микрофон отключён'), own); }; });
      source.connect(node); node.connect(context.destination); onStatus('listening');
    } catch (error) { if (generation === own) await fail(error, own); }
    finally { if (generation === own) starting = false; }
  }
  async function fail(error: unknown, own: number) { if (generation !== own) return; await stop(); if (generation === own + 1) onStatus('error', microphoneError(error)); }
  return { start, stop };
}
