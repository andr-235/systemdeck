import type { AppAPI } from '../shared/api';

declare global {
  interface Window {
    api: AppAPI;
  }
}
