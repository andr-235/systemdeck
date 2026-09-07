import './assets/main.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import SystemModuleUnavailable from './SystemModuleUnavailable';
import ErrorBoundary from './ErrorBoundary';
import { SHARED_CONTRACT_VERSION, type AppAPI } from '@shared/api';

// Preload выполняется до скриптов страницы: если window.api нет/неполный, системный модуль не запущен.
// Guard обязан быть до монтирования продуктовых виджетов (любая прямая навигация к api упадёт).
function hasApplicationApi(): boolean {
  const api = (window as unknown as { api?: Partial<AppAPI> }).api;
  if (typeof api !== 'object' || api === null) return false;
  return (
    typeof api.ping === 'function' &&
    typeof api.reportRendererError === 'function' &&
    typeof api.cpu?.getInfo === 'function' &&
    typeof api.cpu?.getUsage === 'function'
  );
}

const rootElement = document.getElementById('root')!;
const apiReady = hasApplicationApi();

// Внутренний health/contract-drift чек: результат только в логах (ipc success/дрейф), без UI (issue #26).
if (apiReady) {
  void window.api.ping({ version: SHARED_CONTRACT_VERSION });
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>{apiReady ? <App /> : <SystemModuleUnavailable />}</ErrorBoundary>
  </StrictMode>
);
