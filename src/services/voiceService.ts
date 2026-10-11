export interface VoiceService {
  readonly status: 'unavailable' | 'idle' | 'listening';
  start(): Promise<void>;
  stop(): Promise<void>;
}
export const voiceService: VoiceService = {
  status: 'unavailable',
  async start() { throw new Error('Локальное распознавание речи ещё не подключено'); },
  async stop() {},
};
