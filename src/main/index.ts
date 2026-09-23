import { app, shell, BrowserWindow, session, dialog } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { registerIpcHandlers } from './ipc';
import { initLogger, getLogger, getLogFilePath, getLogLevel } from './logger';
import { runSmokeProbe } from './smoke';
import { toErrorParts } from '@shared/ipc/errors';
import { IPC_CHANNELS, IPC_PUSH_CHANNELS } from '@shared/ipc/channels';
import { SHARED_CONTRACT_VERSION } from '@shared/api';
import { LiveScheduler } from './monitoring/live/LiveScheduler';
import { ScanManager } from './storage/ScanManager';
import { resolveCspHeaders } from './security/csp';

initLogger();
const mainLogger = getLogger('main');

mainLogger.info('init logger', { level: getLogLevel(), file: getLogFilePath() });

function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    mainLogger.error('uncaughtException', toErrorParts(error));
    try {
      if (!app.isReady()) {
        dialog.showErrorBox('SystemDeck — unexpected error', error.message);
      }
    } catch {
      // ignore
    }
    app.quit();
  });

  process.on('unhandledRejection', (reason) => {
    mainLogger.error('unhandledRejection', toErrorParts(reason));
  });
}

setupGlobalErrorHandlers();

app.enableSandbox();

const PRELOAD_PATH = join(__dirname, '../preload/index.cjs');

const liveSchedulerRef: { current: LiveScheduler | null } = { current: null };

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'SystemDeck',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  if (!existsSync(PRELOAD_PATH)) {
    mainLogger.error('preload file missing', { preloadPath: PRELOAD_PATH });
  }
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    mainLogger.error('preload-error', { preloadPath, error: toErrorParts(error) });
  });

  mainWindow.on('ready-to-show', () => {
    mainLogger.info('window ready-to-show');
    mainWindow.show();
  });

  mainWindow.on('hide', () => {
    mainLogger.debug('window hidden');
    liveSchedulerRef.current?.setWindowVisible(false);
  });

  mainWindow.on('show', () => {
    mainLogger.debug('window shown');
    liveSchedulerRef.current?.setWindowVisible(true);
  });

  mainWindow.on('closed', () => {
    mainLogger.info('window closed');
    void liveSchedulerRef.current?.dispose();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { action: 'deny' };
      }
      shell.openExternal(url);
    } catch {
      // invalid URL — deny
    }
    return { action: 'deny' };
  });

  // Deny all permission requests (media, notifications, etc.) — best practice #5
  // Renderer is untrusted, no remote content expected
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  // Повторная инициализация после app.whenReady — резолвит userData/logs когда app.getPath доступен
  initLogger();
  electronApp.setAppUserModelId('com.systemdeck.app');
  mainLogger.info('app ready', {
    version: app.getVersion(),
    contractVersion: SHARED_CONTRACT_VERSION,
    platform: process.platform,
    arch: process.arch,
    logLevel: getLogLevel(),
    logFile: getLogFilePath(),
  });

  // Global permission handler for any session created before window
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // CSP via headers — defence-in-depth к meta в index.html (best practice).
  // В dev не ставится: инлайн-преамбула Vite HMR несовместима с script-src 'self'.
  const cspHeaders = resolveCspHeaders(is.dev);
  if (cspHeaders !== null) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          ...cspHeaders,
        },
      });
    });
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  mainLogger.debug('registering IPC handlers', {
    channels: Object.values(IPC_CHANNELS),
  });
  const mainWindow = createWindow();
  const scheduler = new LiveScheduler({ window: mainWindow });
  liveSchedulerRef.current = scheduler;
  const scanManager = new ScanManager({
    send: (event) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_PUSH_CHANNELS.storageScanProgress, event);
      }
    },
  });
  registerIpcHandlers({ scheduler, scanManager });

  // Температура — probe один раз при старте Main (ADR 0009): вывод о доступности
  // принимается до первого такта, ошибки прав/ACPI уже обработаны внутри.
  void scheduler.probeTemperatures();

  if (process.env['SYSTEMDECK_SMOKE'] === '1') {
    void runSmokeProbe(mainWindow).then((ok) => {
      mainLogger.info('smoke finished', { ok });
      app.exit(ok ? 0 : 1);
    });
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  mainLogger.info('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  mainLogger.info('will-quit');
});

app.on('before-quit', () => {
  mainLogger.info('before-quit');
});
