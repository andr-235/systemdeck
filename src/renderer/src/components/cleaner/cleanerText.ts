import type {
  CleanupBrowser,
  CleanupCategory,
  CleanupItemResult,
  CleanupPreviewSource,
} from '@shared/ipc/contracts';
import type { IpcError } from '@shared/ipc/errors';

/** Порядок категорий в UI соответствует порядку allow-правил движка (Main). */
export const CLEANER_CATEGORIES: readonly CleanupCategory[] = [
  'user-temp',
  'windows-temp',
  'recycle-bin',
  'thumbnail-cache',
  'browser-cache',
  'log-files',
];

/** Отказ Application API (reject вместо IpcResult) — не зависать в scanning/cleaning. */
export const INVOKE_REJECTED_MESSAGE =
  'Не удалось выполнить запрос к подсистеме очистки — попробуйте ещё раз.';

const CATEGORY_LABELS: Record<CleanupCategory, string> = {
  'user-temp': 'Временные файлы пользователя',
  'windows-temp': 'Временные файлы Windows',
  'recycle-bin': 'Корзина',
  'thumbnail-cache': 'Кэш эскизов',
  'browser-cache': 'Кэш браузеров',
  'log-files': 'Журналы Windows',
};

const BROWSER_LABELS: Record<CleanupBrowser, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
};

/**
 * Русские тексты для кодов, которые возвращаются без сообщения от Main
 * или чьё сообщение написано на языке системного API. Пользовательский
 * ввод в Renderer классификацией не является — здесь только перевод кодов.
 */
const CODE_REASONS: Record<string, string> = {
  CLEAN_PROTECTED_PATH: 'защищённый путь',
  CLEAN_OUTSIDE_RULES: 'вне разрешённых правил',
  CLEAN_ENTRY_INVALID: 'файл изменился после предпросмотра',
  CLEAN_FILE_IN_USE: 'файл занят другим процессом',
  CLEAN_SHELL_UNAVAILABLE: 'системная оболочка недоступна',
  CLEAN_SIZE_UNVERIFIED: 'размер не подтверждён',
  ENOENT: 'файл уже удалён',
  EPERM: 'нет прав на удаление',
  EACCES: 'нет прав на удаление',
  EBUSY: 'файл занят другим процессом',
  ENOTEMPTY: 'каталог не пуст',
};

const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  CLEAN_ALREADY_ACTIVE: 'Очистка уже выполняется — дождитесь её завершения.',
  CLEAN_SESSION_NOT_FOUND: 'Предпросмотр устарел — выполните сканирование заново.',
  CLEAN_UNKNOWN_CANDIDATE: 'Выбранные элементы не найдены в текущем предпросмотре.',
  CLEAN_EMPTY_SELECTION: 'Выберите хотя бы один элемент.',
  CLEAN_PROTECTED_PATH: 'Элемент защищён правилами очистки и не будет удалён.',
  CLEAN_OUTSIDE_RULES: 'Элемент вне разрешённых правил очистки.',
  CLEAN_DELETE_FAILED: 'Не удалось удалить часть элементов — подробности в отчёте.',
  VALIDATION_FAILED: 'Некорректный запрос очистки.',
};

/** Текст ошибки IPC для пользователя: сначала русский перевод кода, затем сообщение Main. */
export function ipcErrorMessage(error: IpcError): string {
  const mapped = REQUEST_ERROR_MESSAGES[error.code];
  if (mapped) return mapped;
  const detail = error.message.trim();
  return detail || 'Неизвестная ошибка очистки.';
}

/** Причина строки отчёта: пропуск — по коду, отказ — по коду или сообщению Main. */
export function itemReason(
  outcome: CleanupItemResult['outcome'],
  code: string,
  message: string
): string {
  const known = CODE_REASONS[code];
  if (known) return known;
  if (outcome === 'failed') {
    const detail = message.trim();
    return detail || 'удаление не удалось';
  }
  return `код ${code}`;
}

export function categoryLabel(category: CleanupCategory): string {
  return CATEGORY_LABELS[category];
}

export function sourceStatusLabel(status: CleanupPreviewSource['status']): string {
  switch (status) {
    case 'ok':
      return 'Готово';
    case 'partial':
      return 'Частично доступно';
    case 'empty':
      return 'Кандидатов нет';
    case 'unavailable':
      return 'Недоступно';
  }
}

export function outcomeLabel(outcome: CleanupItemResult['outcome']): string {
  switch (outcome) {
    case 'deleted':
      return 'Удалён';
    case 'skipped':
      return 'Пропущен';
    case 'failed':
      return 'Ошибка';
  }
}

export function phaseLabel(phase: 'validating' | 'deleting'): string {
  return phase === 'validating' ? 'Проверка' : 'Удаление';
}

export function staleHint(reason: 'expired' | 'categories'): string {
  return reason === 'expired'
    ? 'Предпросмотр устарел — выполните сканирование заново.'
    : 'Категории изменены — выполните сканирование заново.';
}

/** Источник кандидата: метаданные браузерного кэша, если они есть; иначе прочерк. */
export function candidateSource(candidate: {
  browser?: CleanupBrowser;
  profile?: string;
  cacheKind?: string;
}): string {
  if (!candidate.browser) return '—';
  return [BROWSER_LABELS[candidate.browser], candidate.profile, candidate.cacheKind]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/** Возраст файла относительно момента рендера; отсутствующий stat — прочерк, не «0». */
export function formatAge(mtimeMs: number | undefined, now: number): string {
  if (mtimeMs === undefined || !Number.isFinite(mtimeMs)) return '—';
  const diff = now - mtimeMs;
  if (diff < 60_000) return 'меньше минуты назад';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${pluralRu(minutes, 'минуту', 'минуты', 'минут')} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${pluralRu(hours, 'час', 'часа', 'часов')} назад`;
  return `${pluralRu(Math.floor(hours / 24), 'день', 'дня', 'дней')} назад`;
}

/** Русская форма множественного числа: «3 часа», «11 часов», «21 час». */
export function pluralRu(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
        ? few
        : many;
  return `${value} ${word}`;
}
