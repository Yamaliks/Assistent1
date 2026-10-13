import type { ActionResult } from '../domain/modes';
const labels = { success: 'Запущено', 'already-running': 'Уже работает', skipped: 'Пропущено', 'state-unknown': 'Не удалось определить состояние', error: 'Ошибка запуска' };
export function ActionResults({ results }: { results: ActionResult[] }) {
  return <ul className="action-results">{results.map(result => <li key={result.actionId}><span>{result.name}</span><span className={`result-${result.status}`}>{labels[result.status]}</span><small>{result.message}</small>
    {result.details && (result.details.libraryId || result.details.path || result.details.canonicalPath || result.details.inspection || result.details.pids?.length || result.details.windowsError != null || result.details.minimizedRequested) && <details className="launch-details"><summary>Подробнее</summary><dl>
      {result.details.libraryId && <><dt>Элемент библиотеки</dt><dd>{result.details.libraryId}</dd></>}
      {result.details.path && <><dt>Использованный EXE</dt><dd>{result.details.path}</dd></>}
      {result.details.canonicalPath && <><dt>Канонический путь</dt><dd>{result.details.canonicalPath}</dd></>}
      {result.details.inspection && <><dt>Проверка состояния</dt><dd>{result.details.inspection}</dd></>}
      {result.details.pids?.length ? <><dt>PID при проверке/запуске</dt><dd>{result.details.pids.join(', ')}</dd></> : null}
      {result.details.windowCount != null && <><dt>Окон при проверке</dt><dd>{result.details.windowCount}</dd></>}
      {result.details.windowsError != null && <><dt>Код Windows</dt><dd>{result.details.windowsError}</dd></>}
      {result.details.minimizedRequested && <><dt>Запуск</dt><dd>Запрошено свёрнутое окно. Фактическое состояние окна не подтверждено.</dd></>}
    </dl></details>}
  </li>)}</ul>;
}
