import { copies } from './copies';
import { echo } from './echo';
import { mosaic } from './mosaic';
import { split } from './split';
import { theme } from './theme';

/**
 * The worlds of this engine (009 FR-902). Adding one: a folder under worlds/ with its index.ts, and one entry here.
 * The order is the order of おまかせ's draw — appending changes nothing drawn so far, reordering does.
 * The portal and the darkness were taken out in 017 (they live on in the frozen engine space-v2-1).
 */
export const WORLDS = [copies, split, mosaic, echo, theme] as const;

/** The world on screen: the one fixed, else the one おまかせ drew; undefined for a frozen engine's world. */
export const worldOf = (type: string) => WORLDS.find((w) => w.type === type);
