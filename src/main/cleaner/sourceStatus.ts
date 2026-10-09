import type { CleanupCategory, CleanupPreviewSource } from '@shared/ipc/contracts';
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

export type PreviewSourceInput = {
  category: CleanupCategory;
  rules: readonly CleanupRule[];
  roots: readonly string[];
  collected: CollectResult;
  candidates: readonly { sizeBytes: number }[];
};

/** Источник preview: статус с причиной, счётчики и порог возраста из конфигурации правила. */
export function buildPreviewSource(input: PreviewSourceInput): CleanupPreviewSource {
  const { category, rules, roots, collected, candidates } = input;
  const estimatedBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);
  const source: CleanupPreviewSource = {
    category,
    ...resolveSourceStatus(category, roots.length, collected, candidates.length),
    candidateCount: candidates.length,
    estimatedBytes,
    inaccessibleDirectories: collected.inaccessibleDirs.length,
  };
  const minAgeHours = minAgeHoursFor(category, rules);
  return minAgeHours === undefined ? source : { ...source, minAgeHours };
}
