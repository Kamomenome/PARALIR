import { copies } from './copies';
import { dark } from './dark';
import { echo } from './echo';
import { mosaic } from './mosaic';
import { portal } from './portal';
import { split } from './split';
import { theme } from './theme';

/**
 * The worlds of this engine (009 FR-902). Adding one: a folder under worlds/ with its index.ts, and one entry here.
 * The order is the order of おまかせ's draw — appending changes nothing drawn so far, reordering does.
 */
export const WORLDS = [copies, dark, split, portal, mosaic, echo, theme] as const;
