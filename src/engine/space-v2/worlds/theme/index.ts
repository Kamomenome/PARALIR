import { buildTheme, renderTheme, type ThemeParams } from './theme';
import type { WorldDef } from '../../worldDef';

export const theme: WorldDef<'theme', ThemeParams> = {
  type: 'theme',
  label: '主題',
  note: '崩した全体の中に、元写真の一部をそのまま残す',
  version: 'theme-v2',
  odds: () => 1.2,
  build: (x) => buildTheme(x.seeds.streams.theme, x.seeds.seedInput, x.features, x.img),
  render: (x) => renderTheme(x.world.theme, x.world.mosaic, x.ranged(), x.img, x.features, x.controls, x.W, x.H, x.quality),
};
