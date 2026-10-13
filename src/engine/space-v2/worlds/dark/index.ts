import { buildDark, darkLayer, type DarkParams } from './dark';
import { mergeFront } from '../../shared/atmosphere';
import { backdrop, finish } from '../../shared/backdrop';
import type { WorldDef } from '../../worldDef';

export const dark: WorldDef<'dark', DarkParams> = {
  type: 'dark',
  label: '闇と光',
  note: '闇の中に光の筋と群れ',
  version: 'dark-v4',
  odds: (light) => 0.6 + 1.0 * (1 - light),
  build: (x) => buildDark(x.seeds.streams.dark),
  render: (x) => {
    const { hdr, light, look } = backdrop(x, true);
    const { layer, air } = darkLayer(x.world.dark, x.obj, x.img, x.world.camera, x.controls, x.W, x.H);
    for (let i = 0; i < x.W * x.H; i++) {
      hdr.r[i] += air.r[i];
      hdr.g[i] += air.g[i];
      hdr.b[i] += air.b[i];
    }
    mergeFront(hdr, layer, light, look);
    return { rgba: finish(hdr, x.controls, false), objects: layer.a };
  },
};
