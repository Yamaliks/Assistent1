# Assistent1 — roadmap

## 1. Project foundation and two-window interface

- [x] Tauri 2 + React + TypeScript + Tailwind + Lucide.
- [x] Graphite Purple design, six pages and navigation.
- [x] Main window 1180×760, one hidden frameless palette 560px wide.
- [x] Repeated EXE launches focus the existing instance (single-instance plugin).
- [x] Global Ctrl+Alt+Space registration, Esc hides palette (native runtime validation pending Windows).
- [x] Typed mode drafts and versioned local settings; simple metadata form.
- [x] Command Router, Mode Engine planning contract, System Services and Voice Service interfaces.
- [ ] Windows runtime verification and installer build on Windows.

## 2. Actual program and website launching

- [x] Launch one existing EXE through Rust, without command-line arguments or a shell.
- [x] Open validated HTTP(S) URLs in the default browser and existing local folders in Windows.
- [x] Add/edit/delete saved user commands; settings v1 migrate to v2 without losing mode drafts.
- [x] Palette cards and exact name/phrase routing; ambiguous matches do not execute.
- [x] Runtime path checks, Windows error messages, repeat-click protection and narrow command permissions.
- [x] Frontend build, TypeScript service tests, Rust validation tests and Windows GNU compilation checks.
- [ ] Windows runtime smoke test: actual EXE/browser/folder opening, nonexistent path, access denial and missing default browser.
- Program closure is not implemented; no process is terminated.

## 3. Mode engine

### 3А — настройка приложений (готово)

- Страница «Приложения»: Steam, Discord, Telegram, VPN, Браузер; постоянные ID `steam`, `discord`, `telegram`, `vpn`, `browser`.
- Ручной ввод и системный EXE-диалог Windows, проверка файла, сохранение в существующих настройках v2.
- Браузер по умолчанию; старые настройки получают пять пустых записей без потери команд/режимов.
- 3Б и выполнение режимов не реализованы; Windows CI/установщик для 3А не запускались.

### Будущий движок (не реализован)

- Sequential actions, per-action results, cancellation and history.
- Skip already running programs according to user preferences; surface failures.
- Implement process detection here; stage 2 launches individual commands without mode switching.

## 4. Full mode editor

- Add/remove/reorder actions, file picker, validation, import/export.
- Configurable programs, folders, sites and supported system actions.

## 5. Windows integration

- Tray lifecycle shipped as a stage 2 bug fix (0.1.1): close-to-tray, restore, explicit exit and single-instance reopen.
- Optional autostart, volume control and investigation of supported night-light APIs remain future work.
- Document platform limits; no unsupported registry hacks presented as stable APIs.

## 6. Local Russian speech recognition

- Evaluate Vosk and local models; microphone permission and explicit listening status.
- No network/cloud speech services.

## 7. Voice activation phrase

- Local activation, configurable phrase and sensitivity, resource/privacy controls.

## 8. Testing and release

- Windows 10/11 native smoke tests, accessibility, persistence and error recovery.
- Signed installer, release instructions and performance checks.
