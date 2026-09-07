export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} ГБ`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} МБ`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${value} Б`;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/с`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0 || days > 0) parts.push(`${hours} ч`);
  parts.push(`${minutes} мин`);
  return parts.join(' ');
}

export function formatDateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '—';
  const d = new Date(epochMs);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
