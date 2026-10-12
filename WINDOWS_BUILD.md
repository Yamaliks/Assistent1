# Установщик Windows из GitHub Actions

Workflow `.github/workflows/windows-build.yml` собирает существующие этапы 1–2 на `windows-2022`
для `x86_64-pc-windows-msvc`. Используется официальный `tauri-apps/tauri-action`, локальный CLI
из npm lockfile, Rust stable, C++ tools и Windows SDK runner. Действия закреплены полными SHA.
Зависимости устанавливаются по lockfiles; запускаются 11 TypeScript-тестов, 6 Rust-тестов и rustfmt. Также проверяется Windows dev-конфигурация; после release-сборки выполняется
нативный smoke-тест закрытия/повторного открытия окна при доступной интерактивной оболочке.
Tauri выполняет существующую сборку TypeScript/Vite и создаёт NSIS `.exe`.
GitHub Release не создаётся, основная ветка не изменяется автоматически.

## Как получить установщик

1. Откройте `https://github.com/Yamaliks/Assistent1/actions` и workflow **Windows x64 installer**.
2. После публикации ветки `codex/...` сборка запускается автоматически. Для PR будет отдельная проверка.
3. После слияния workflow в `main` доступна кнопка **Run workflow** для повторной сборки.
4. Дождитесь зелёного результата, откройте запуск и скачайте artifact **Assistent1-windows-x64-nsis**.
5. Распакуйте ZIP и запустите находящийся внутри `.exe` на Windows 10/11 x64.

На вашем ПК Rust и Node.js не нужны. Приложение использует WebView2: стандартный установщик Tauri
при необходимости загружает его bootstrapper; для этого нужен интернет. Тестовый установщик не подписан,
поэтому Windows может показать предупреждение об неизвестном издателе. Артефакт хранится 14 дней,
после чего можно повторить workflow. Готовность установщика подтверждает успешный запуск Actions;
локальная проверка конфигурации или сохранение облачной среды этого не подтверждают.

## Публикация исходников из текущей среды

Все исходники, иконки, три lockfile, документация и workflow должны попасть в Git-коммит.
`node_modules`, `dist`, `target`, локальные инструменты и секреты публиковать не нужно.
Сохранение/публикация конфигурации облачной среды не отправляет Git-коммиты в GitHub.

Если подготовленная ветка уже опубликована, откройте ссылку сравнения или PR, указанную в ответе.
Если push не прошёл, из текущего checkout выполните (имя ветки указано в ответе):

```sh
cd /workspace/Assistent1
git status
git push -u origin HEAD
gh pr create --repo Yamaliks/Assistent1 --base main --head "$(git branch --show-current)" --title "Add Assistent1 sources and Windows installer build" --body-file /tmp/assistent1-windows-pr.md
```

Последняя команда требует доступного GitHub API и авторизации с правом создания PR.
PR можно создать и в браузере после успешного push. Если push запрещён из этой среды,
скачайте подготовленный Git bundle, в Git Bash на другом компьютере клонируйте его
(`git clone Assistent1-sources.bundle Assistent1`), откройте папку и задайте remote:

```sh
git remote set-url origin https://github.com/Yamaliks/Assistent1.git
git push -u origin HEAD
```

Для отправки нужны Git и права записи в репозиторий (включая workflow), Rust/Node.js не нужны.
Пуш выполняется в новую ветку; затем создайте PR в `main` через GitHub.
