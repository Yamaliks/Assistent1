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
- Выполнение режимов не реализовано; Windows CI/установщик для 3А не запускались.

### 3Б-Lite — конструктор действий (готово)

- Добавление/удаление, активность, порядок и параметры действий в существующих режимах; сохранение без автозаполнения удалённых действий.
- Четыре типа: общее приложение по ID, сайт, папка, сохранённая команда по ID.
- EXE-диалог и ручной путь прямо в режиме используют менеджер 3А; новые приложения доступны в общем списке, браузер по умолчанию поддерживается.
- При удалении используемой команды — предупреждение и удаление связанных действий.
- Настройки v3 в прежнем хранилище; v1/v2 совместимы, старые inline EXE перенесены в общий менеджер без изменения исходных данных до сохранения.
- Выполнение режимов, голос и системные сценарии не добавлены. Windows CI и установщик не запускались.

### UX Redesign Lite (готово)

- Новые режимы получают шаблоны Игра/Работа/Отдых; Ночь без неподдерживаемых системных действий. Необязательные папка и музыкальный сайт отключены до настройки.
- Существующие режимы не заполняются повторно; «Восстановить шаблон» заменяет список только после подтверждения и последующего сохранения.
- Карточки со статусом, описанием и основной настройкой; EXE выбирается и сохраняется прямо в карточке через менеджер 3А.
- Порядок и удаление в меню «…», переключатель активности доступен сразу. Название/фраза режима — в «Дополнительно».
- Четыре варианта добавления действий сохранены, пути общие, команды и Rust не изменялись.
- Спокойная типографика, адаптивные карточки и клавиатурный фокус. Windows CI/установщик не запускались.

### 3Б+ — общая библиотека (приложения и сайты готовы)

- «Моя библиотека» с вкладками «Приложения»/«Сайты»; команды остаются отдельно.
- Создание своих приложений без команды, изменение названия и общего EXE, удаление с подтверждением и очисткой ссылок в режимах.
- Общие сайты с постоянными ID: создание/изменение http(s) URL, выбор и создание внутри режима; изменение действует во всех связанных режимах.
- Настройки v4 в прежнем хранилище; безопасная миграция сайтов v1–v3 без повторных копий и восстановления удалённых действий. Пути, команды и папки сохраняются.
- Шаблоны используют библиотеку; восстановление явно подтверждается. Удалённые из библиотеки приложения автоматически не возвращаются.
- Осталось на следующий шаг: общая библиотека папок, миграция папок и системный диалог выбора папки. Пока папки редактируются внутри режимов как прежде.
- Mode Engine, Rust, трей и single-instance не менялись; Windows CI/установщик вручную не запускались.

### UX Bugfix — сохранение действий и простые команды (готово)

- Причина потери: выбранная ссылка оставалась в React-черновике, библиотека записывалась отдельно. Добавление приложения/сайта теперь сохраняет библиотеку и режим одной записью сразу; повторная ссылка не добавляется.
- Проверка совпадений EXE (регистр/разделители Windows) и нормализованного URL при создании; предложение выбрать существующий элемент. Старые дубликаты и данные не удаляются автоматически.
- Команды: название/тип, выбор из библиотеки или системный EXE-диалог, ручные URL/папки, предложение сохранить новый элемент в библиотеку без копий. Самостоятельный запуск и выбор команд в режиме сохранены.
- Карточки команд с «Запустить» и меню «…»; дополнительные параметры скрыты. Уточнены пояснения разделов.
- Формы используют сжимаемые колонки и перенос кнопок; на узком окне поля/кнопки располагаются вертикально.
- Точечные тесты проверяют атомарное сохранение, повторное добавление, дубликаты, создание через режим и команды, выбор EXE и прежний запуск. Windows-диалог/вёрстка требуют проверки в установленном приложении; CI и установщик не запускались.

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
