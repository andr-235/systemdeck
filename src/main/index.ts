import { app, shell, BrowserWindow, session, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { registerIpcHandlers } from './ipc';
import { initLogger, getLogger, getLogFilePath, getLogLevel } from './logger';
import { SHARED_CONTRACT_VERSION } from '@shared/api';

initLogger();
const mainLogger = getLogger('main');

mainLogger.info('init logger', { level: getLogLevel(), file: getLogFilePath() });

process.on('uncaughtException', (error) => {
  mainLogger.error('uncaughtException', {
    message: error.message,
    stack: error.stack,
  });
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
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  mainLogger.error('unhandledRejection', { message: msg, stack });
});

app.enableSandbox();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'SystemDeck',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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

  mainWindow.on('ready-to-show', () => {
    mainLogger.info('window ready-to-show');
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainLogger.info('window closed');
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
}

app.whenReady().then(() => {
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

  // CSP via headers — defence-in-depth к meta в index.html (best practice)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self' ws: wss:",
        ],
      },
    });
  });

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  mainLogger.debug('registering IPC handlers', {
    channels: ['systemdeck:ping', 'systemdeck:renderer-error'],
  });
  registerIpcHandlers();

  mainLogger.info('creating window');
  createWindow();

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
