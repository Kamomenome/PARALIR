import pkg from '../../package.json';

/** The app's name (010 FR-1001) and version: shown as 「PARALIR ver 1.33」; the version is raised each time it is handed over. */
export const APP_NAME = 'PARALIR';
/** The name in file names: exports (010 FR-1002). */
export const APP_FILE_NAME = 'paralir';
export const APP_VERSION = pkg.version.split('.').slice(0, 2).join('.');

declare const __APP_COMMIT__: string | undefined;
/** The commit the app was built from (vite / vitest `define`); 'unknown' outside a git checkout (008 FR-802). */
export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown';
