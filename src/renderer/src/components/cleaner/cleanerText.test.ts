import { describe, it, expect } from 'vitest';
import {
  candidateSource,
  formatAge,
  ipcErrorMessage,
  itemReason,
  pluralRu,
  sourceStatusLabel,
} from './cleanerText';

describe('cleanerText (jsdom project)', () => {
  it('maps known IPC error codes to Russian messages', () => {
    expect(ipcErrorMessage({ code: 'CLEAN_SESSION_NOT_FOUND', message: 'session gone' })).toBe(
      'Предпросмотр устарел — выполните сканирование заново.'
    );
    expect(ipcErrorMessage({ code: 'CLEAN_ALREADY_ACTIVE', message: 'busy' })).toContain(
      'уже выполняется'
    );
  });

  it('falls back to the Main message and then to a generic Russian text', () => {
    expect(ipcErrorMessage({ code: 'SOMETHING_NEW', message: 'деталь от Main' })).toBe(
      'деталь от Main'
    );
    expect(ipcErrorMessage({ code: 'SOMETHING_NEW', message: '   ' })).toBe(
      'Неизвестная ошибка очистки.'
    );
  });

  it('translates skip codes and keeps failed rows with a Russian lead', () => {
    expect(itemReason('skipped', 'CLEAN_FILE_IN_USE', '')).toBe('файл занят другим процессом');
    expect(itemReason('skipped', 'CUSTOM_CODE', '')).toBe('код CUSTOM_CODE');
    expect(itemReason('failed', 'CLEAN_DELETE_FAILED', 'EPERM: denied')).toBe('EPERM: denied');
    expect(itemReason('failed', 'CLEAN_DELETE_FAILED', '')).toBe('удаление не удалось');
  });

  it('renders missing age as a dash instead of zero', () => {
    expect(formatAge(undefined, Date.now())).toBe('—');
    expect(formatAge(Number.NaN, Date.now())).toBe('—');
    const now = Date.now();
    expect(formatAge(now - 2 * 60 * 60_000, now)).toBe('2 часа назад');
  });

  it('builds the browser source label from candidate metadata', () => {
    expect(candidateSource({ browser: 'chrome', profile: 'Default', cacheKind: 'Cache' })).toBe(
      'Chrome · Default · Cache'
    );
    expect(candidateSource({})).toBe('—');
  });

  it('uses correct Russian plural forms', () => {
    expect(pluralRu(1, 'час', 'часа', 'часов')).toBe('1 час');
    expect(pluralRu(3, 'час', 'часа', 'часов')).toBe('3 часа');
    expect(pluralRu(5, 'час', 'часа', 'часов')).toBe('5 часов');
    expect(pluralRu(11, 'час', 'часа', 'часов')).toBe('11 часов');
    expect(pluralRu(21, 'час', 'часа', 'часов')).toBe('21 час');
  });

  it('labels every preview source status in Russian', () => {
    expect(sourceStatusLabel('ok')).toBe('Готово');
    expect(sourceStatusLabel('partial')).toBe('Частично доступно');
    expect(sourceStatusLabel('empty')).toBe('Кандидатов нет');
    expect(sourceStatusLabel('unavailable')).toBe('Недоступно');
  });
});
