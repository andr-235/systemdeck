import type { CleanupCategory, CleanupPreviewSource } from '@shared/ipc/contracts';
import type { BrowserDiscovery } from './browserRoots';
import { minAgeHoursFor, type CleanupRule } from './rules';
import type { CollectResult } from './walker';

export type SourceStatus = { status: CleanupPreviewSource['status']; reason?: string };

/** Причина отказа чтения корня: права и отсутствие каталога объясняются по-разному. */
function accessReason(code: string | undefined): string {
  if (code === 'EACCES' || code === 'EPERM') {
    return 'Нет доступа: требуются права администратора';
  }
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return 'Каталог не найден';
  }
  return 'Источник недоступен';
}

/** Причина пустого набора корней: переменная окружения не дала допустимого пути. */
export function missingRootsReason(category: CleanupCategory): string {
  if (category === 'windows-temp') {
    return 'Системный каталог не определён: переменная %WINDIR% пуста или повреждена';
  }
  if (category === 'user-temp') {
    return 'Каталог TEMP не определён: переменная %LOCALAPPDATA% пуста или повреждена';
  }
  if (category === 'log-files') {
    return 'Каталог логов SystemDeck не определён: Application Log не инициализирован';
  }
  return 'Источник не настроен';
}

/**
 * Статус источника: `unavailable` (корней нет или корень не читается) отличается от
 * `empty` (корни прочитаны, подходящих файлов нет) — критерий приёмки issue #56.
 */
export function resolveSourceStatus(
  category: CleanupCategory,
  totalRoots: number,
  collected: CollectResult,
  candidateCount: number
): SourceStatus {
  if (totalRoots === 0) {
    return { status: 'unavailable', reason: missingRootsReason(category) };
  }
  const unavailable = collected.unavailableRoots;
  if (unavailable.length > 0) {
    const reason = accessReason(unavailable[0].code);
    return { status: unavailable.length === totalRoots ? 'unavailable' : 'partial', reason };
  }
  if (collected.inaccessibleDirs.length > 0) {
    return { status: 'partial', reason: 'Часть каталогов недоступна для чтения' };
  }
  return { status: candidateCount === 0 ? 'empty' : 'ok' };
}

export type BrowserSourceInput = {
  roots: readonly string[];
  collected: CollectResult;
  candidateCount: number;
  discovery: BrowserDiscovery;
};

/**
 * Статус источника browser-cache (issue #58): отсутствие браузера/профиля — `empty`,
 * отказ доступа к каталогам браузеров — `unavailable`/`partial` с причиной, а
 * доступный источник без подходящих файлов — `empty`, но не `unavailable`.
 */
export function browserSourceStatus(input: BrowserSourceInput): SourceStatus {
  const { roots, collected, candidateCount, discovery } = input;
  const unreadable = collected.unavailableRoots;
  const denied = discovery.denied;
  if (roots.length === 0) {
    if (denied.length > 0) {
      return { status: 'unavailable', reason: accessReason(denied[0].code) };
    }
    if (discovery.envMissing) {
      return {
        status: 'unavailable',
        reason:
          'Каталоги данных браузеров не определены: переменные окружения пусты или повреждены',
      };
    }
    // Браузер или профиль отсутствует: не ошибка, а пустой источник.
    return { status: 'empty' };
  }
  if (unreadable.length > 0 || denied.length > 0) {
    const first = unreadable.length > 0 ? unreadable[0] : denied[0];
    if (roots.length === unreadable.length) {
      return { status: 'unavailable', reason: accessReason(first.code) };
    }
    return { status: 'partial', reason: accessReason(first.code) };
  }
  if (collected.inaccessibleDirs.length > 0) {
    return { status: 'partial', reason: 'Часть каталогов недоступна для чтения' };
  }
  return { status: candidateCount === 0 ? 'empty' : 'ok' };
}

export type PreviewSourceInput = {
  category: CleanupCategory;
  rules: readonly CleanupRule[];
  roots: readonly string[];
  collected: CollectResult;
  candidates: readonly { sizeBytes: number }[];
  /** Готовый статус вместо общего расчёта: browser-cache различает «нет браузера» и «нет доступа». */
  status?: SourceStatus;
};

/** Источник preview: статус с причиной, счётчики и порог возраста из конфигурации правила. */
export function buildPreviewSource(input: PreviewSourceInput): CleanupPreviewSource {
  const { category, rules, roots, collected, candidates, status } = input;
  const estimatedBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);
  const source: CleanupPreviewSource = {
    category,
    ...(status ?? resolveSourceStatus(category, roots.length, collected, candidates.length)),
    candidateCount: candidates.length,
    estimatedBytes,
    inaccessibleDirectories: collected.inaccessibleDirs.length,
  };
  const minAgeHours = minAgeHoursFor(category, rules);
  return minAgeHours === undefined ? source : { ...source, minAgeHours };
}
