import { buildSplit, splitLayer, type FragmentParams } from './split';
import { mergeFront } from '../../shared/atmosphere';
import { backdrop, dimPlates, finish } from '../../shared/backdrop';
import type { WorldDef } from '../../worldDef';

export const split: WorldDef<'split', FragmentParams> = {
  type: 'split',
  label: '被写体の解体',
  note: '被写体を切り分けて重ねる',
  version: 'split-v5',
  needsSubject: true,
  controls: ['light', 'size', 'darkness'],
  usesRange: true,
  odds: (_light, hasSubject) => (hasSubject ? 0.8 : 0),
  build: (x) => buildSplit(x.seeds.streams.split),
  render: (x) => {
    const { hdr, light, look } = backdrop(x, false);
    const layer = splitLayer(x.world.split, x.obj, x.img, x.world.camera, x.controls, x.W, x.H);
    dimPlates(layer, x.W * x.H);
    mergeFront(hdr, layer, light, look);
    return { rgba: finish(hdr, x.controls, true), objects: layer.a };
  },
};
