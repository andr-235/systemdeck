export function scanEmptyText(
  kind: 'files' | 'types',
  fileCount: number,
  inaccessibleDirectories: number
): string {
  if (fileCount === 0) {
    return kind === 'files' ? 'Файлы не найдены — том пуст.' : 'Категорий нет — файлы не найдены.';
  }
  const skip =
    inaccessibleDirectories > 0 ? ` (недоступно каталогов: ${inaccessibleDirectories})` : '';
  return kind === 'files'
    ? `Файлы не собраны${skip} — это не «пусто».`
    : `Сводка не собрана${skip} — это не «пусто».`;
}
