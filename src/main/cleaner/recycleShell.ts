import { runPowershell, runPowershellJson } from '../system/ps';

/** Состояние корзины тома, измеренное Shell'ом; отказ не подменяется нулём (issue #57). */
export type RecycleVolumeState =
  { ok: true; sizeBytes: number; itemCount: number } | { ok: false; reason: string };

/**
 * Граница Shell-механизма корзины: перечень томов, замер, агрегированная очистка.
 * Инжектируется в тесты (PAT-001); реальная реализация — PowerShell/Shell API.
 */
export interface RecycleShell {
  /** Fixed-тома Windows (`C:\` и т.п.): корни, для которых Shell опрашивает корзину. */
  listVolumes(): Promise<string[]>;
  /**
   * Замер корзины тома: факт или явный отказ, без оценок.
   * Контракт — никогда не бросает: отказ возвращается как `ok: false`.
   */
  query(volumeRoot: string): Promise<RecycleVolumeState>;
  /** Агрегированная очистка корзины одного тома целиком. */
  clear(volumeRoot: string): Promise<void>;
}

/** Очистка большого тома укладывается в отдельный таймаут; замер живёт под общим. */
const CLEAR_TIMEOUT_MS = 120_000;

/** Буква диска из валидного корня тома; иначе null — в команду не подставляется (GUD-001). */
export function volumeLetter(volumeRoot: string): string | null {
  const match = /^([A-Za-z]):\\$/.exec(volumeRoot);
  return match === null ? null : match[1].toUpperCase();
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0].slice(0, 200);
}

/** Запрос корзины одним вызовом Shell: struct обязана нести cbSize (проверено на win32). */
const QUERY_SCRIPT = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SdRecycleBinQuery {
    [StructLayout(LayoutKind.Sequential)]
    public struct SHQUERYRBINFO {
        public int cbSize;
        public long size;
        public long items;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHQueryRecycleBin(string root, ref SHQUERYRBINFO info);
    public static string Query(string root) {
        SHQUERYRBINFO info = new SHQUERYRBINFO();
        info.cbSize = Marshal.SizeOf(typeof(SHQUERYRBINFO));
        int hr = SHQueryRecycleBin(root, ref info);
        return hr + "|" + info.size + "|" + info.items;
    }
}
'@
$parts = [SdRecycleBinQuery]::Query('{root}').Split('|')
[pscustomobject]@{ hr = [int]$parts[0]; size = [long]$parts[1]; items = [long]$parts[2] } | ConvertTo-Json -Compress
`;

type QueryJson = { hr?: unknown; size?: unknown; items?: unknown };

function measured(hr: number, size: number, items: number): RecycleVolumeState {
  if (hr !== 0) {
    return {
      ok: false,
      reason: `Shell отклонил запрос корзины тома (hr=0x${(hr >>> 0).toString(16)})`,
    };
  }
  if (!Number.isFinite(size) || !Number.isFinite(items) || size < 0 || items < 0) {
    return { ok: false, reason: 'Shell вернул некорректные данные корзины' };
  }
  return { ok: true, sizeBytes: size, itemCount: items };
}

/** Реальная Shell-граница на PowerShell: CIM-перечень томов + shell32 + Clear-RecycleBin. */
export const nodeRecycleShell: RecycleShell = {
  listVolumes: async () => {
    const raw = await runPowershellJson<string[] | string>(
      "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object -ExpandProperty DeviceID | ConvertTo-Json -Compress"
    );
    const ids = Array.isArray(raw) ? raw : [raw];
    return ids.filter((id) => /^[A-Za-z]:$/.test(id)).map((id) => `${id.toUpperCase()}\\`);
  },
  query: async (volumeRoot) => {
    const letter = volumeLetter(volumeRoot);
    if (letter === null) {
      return { ok: false, reason: 'Некорректный корень тома корзины' };
    }
    try {
      const json = await runPowershellJson<QueryJson>(
        QUERY_SCRIPT.replace('{root}', `${letter}:\\`)
      );
      const { hr, size, items } = json;
      if (typeof hr !== 'number' || typeof size !== 'number' || typeof items !== 'number') {
        return { ok: false, reason: 'Shell вернул некорректные данные корзины' };
      }
      return measured(hr, size, items);
    } catch (error) {
      return { ok: false, reason: `Запрос корзины тома не выполнен: ${firstLine(error)}` };
    }
  },
  clear: async (volumeRoot) => {
    const letter = volumeLetter(volumeRoot);
    if (letter === null) {
      throw new Error('Некорректный корень тома корзины');
    }
    await runPowershell(`Clear-RecycleBin -DriveLetter '${letter}' -Force -ErrorAction Stop`, {
      timeout: CLEAR_TIMEOUT_MS,
      windowsHide: true,
    });
  },
};
