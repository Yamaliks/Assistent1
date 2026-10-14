import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Mic, Square, Volume2, Download } from 'lucide-react';
import { defaultVoiceSettings, type VoiceSettings } from '../services/solCommands';
import type { SolState } from '../services/useSol';
import { systemServices } from '../services/systemServices';
export function SolPage({ config, save, state, start, stop, testVoice, audioError }: { config?: VoiceSettings; save: (voice: VoiceSettings) => boolean; state: SolState; start: () => Promise<void>; stop: () => Promise<void>; testVoice: () => Promise<void>; audioError: string }) {
  const voice = config ?? defaultVoiceSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [assets, setAssets] = useState({ runtime: false, model: false, audio: false });
  const [kind, setKind] = useState('runtime'); const [hash, setHash] = useState(''); const [message, setMessage] = useState(''); const [installing, setInstalling] = useState(false);
  const refresh = async () => { try { setAssets(await invoke('sol_asset_status')); } catch (error) { setMessage(String(error)); } };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { const refreshDevices = () => { void navigator.mediaDevices?.enumerateDevices().then(list => setDevices(list.filter(d => d.kind === 'audioinput'))).catch(error => setMessage(String(error))); }; refreshDevices(); navigator.mediaDevices?.addEventListener('devicechange', refreshDevices); return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices); }, [state.status]);
  const change = (patch: Partial<VoiceSettings>) => { void stop(); save({ ...voice, ...patch }); };
  async function install() {
    setInstalling(true); setMessage('Выбор и проверка пакета…');
    try { await stop(); const archive = await invoke<string | null>('pick_sol_archive'); if (!archive) { setMessage('Установка отменена.'); return; } setMessage('Проверка SHA-256 и установка…'); setMessage(await invoke('sol_install', { kind, archive, sha256: hash })); await refresh(); }
    catch (error) { setMessage(String(error)); } finally { setInstalling(false); }
  }
  async function download() { const url = kind === 'runtime' ? 'https://github.com/alphacep/vosk-api/releases/download/v0.3.45/vosk-win64-0.3.45.zip' : 'https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip'; try { await systemServices.execute({ id: 'sol-download', label: 'Официальный пакет Vosk', kind: 'website', url }); } catch (error) { setMessage(String(error)); } }
  return <div className="sol-page"><div className="page-heading"><div><span className="eyebrow">Локальный помощник</span><h1>SOL</h1><p>Русская речь обрабатывается на вашем ПК. Аудио не отправляется на сервер.</p></div></div>
    <section className="panel"><div className="setting-row"><h2><Mic size={22} /> SOL · {{ off: 'Выключен', listening: 'Слушает', recognizing: 'Распознаёт', error: 'Ошибка' }[state.status]}</h2><span className="badge">{voice.wake ? 'Активация: «Сол»' : 'Одна фраза'}</span></div>
      <label className="checkbox-label"><input type="checkbox" checked={voice.enabled} onChange={e => change({ enabled: e.target.checked })} />Включить голосовое управление</label>
      <label>Микрофон<select value={voice.deviceId} onChange={e => change({ deviceId: e.target.value })}><option value="">По умолчанию Windows</option>{devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Микрофон ${i + 1} · название после разрешения`}</option>)}</select></label>
      <div className="form-actions mt-6"><button className="primary" disabled={!voice.enabled || installing || state.status === 'listening' || state.status === 'recognizing'} onClick={() => { void start(); }}><Mic size={17} />Слушать SOL</button><button className="secondary" onClick={() => { void stop(); }}><Square size={16} />Остановить</button></div>
      <p className="field-help">Прослушивание начинается только кнопкой. В обычном режиме после одной распознанной фразы микрофон освобождается.</p>
      <label className="checkbox-label"><input type="checkbox" checked={voice.wake} onChange={e => change({ wake: e.target.checked })} />После нажатия «Слушать SOL» слушать непрерывно, команды выполнять только с «Сол»</label>
      <p className="field-help">По умолчанию выключено. Используется тот же локальный Vosk, отдельная wake-модель не нужна. Потребление ресурсов зависит от ПК. Крестик главного окна останавливает микрофон.</p>
      <div className="sol-transcript" aria-live="polite"><small>Распознанная фраза</small><p>{state.phrase || 'Скажите: «Сол, открой Steam» или «Сол, включи работу»'}</p><p>{state.message}</p></div>
    </section>
    <section className="panel"><h2>Голосовые ответы</h2><label className="checkbox-label"><input type="checkbox" checked={voice.replies} onChange={e => save({ ...voice, replies: e.target.checked })} />Воспроизводить локальные записи</label><label>Громкость · {voice.volume}%<input type="range" min="0" max="100" value={voice.volume} onChange={e => save({ ...voice, volume: Number(e.target.value) })} /></label><label className="checkbox-label"><input type="checkbox" checked={voice.brief} onChange={e => save({ ...voice, brief: e.target.checked })} />Краткие ответы</label><button className="secondary" onClick={() => { void testVoice(); }}><Volume2 size={17} />Проверить голос</button><p className="field-help">Пакет записей: {assets.audio ? 'установлен' : 'не установлен — звуковых ответов пока нет'}. Выключение ответов не выключает микрофон.</p>{audioError && <p className="danger" role="status">{audioError}</p>}</section>
    <section className="panel"><h2>Локальные пакеты</h2><p className="field-help">Vosk x64: {assets.runtime ? 'установлен' : 'не установлен'} · Русская модель: {assets.model ? 'установлена' : 'не установлена'}</p>
      <div className="form-grid"><label>Установить пакет<select value={kind} onChange={e => { setKind(e.target.value); setHash(''); }}><option value="runtime">Vosk runtime 0.3.45 · Windows x64</option><option value="model">Русская модель small-ru-0.22 · около 45 МБ</option><option value="audio">Собственный аудиопакет SOL · WAV</option></select></label>{kind !== 'runtime' && <label>Ожидаемый SHA-256 ZIP<input value={hash} onChange={e => setHash(e.target.value)} placeholder="64 символа из доверенного источника" /></label>}</div>
      <div className="form-actions mt-6">{kind !== 'audio' && <button className="secondary" onClick={() => { void download(); }}><Download size={16} />Скачать с официального сайта</button>}<button className="primary" disabled={installing || (kind !== 'runtime' && !/^[a-f0-9]{64}$/i.test(hash.trim()))} onClick={() => { void install(); }}>{installing ? 'Проверка пакета…' : 'Выбрать ZIP и установить'}</button></div>
      <p className="field-help">Архив runtime сверяется с закреплённым SHA-256. Для модели/своих записей укажите доверенную контрольную сумму: она проверяет совпадение файла, но не заменяет проверку его источника. Не устанавливайте ZIP с неизвестных сайтов. Инструкция и сведения о лицензиях: docs/SOL.md.</p>
      {message && <p role="status" className="field-help">{message}</p>}
    </section>
  </div>;
}
