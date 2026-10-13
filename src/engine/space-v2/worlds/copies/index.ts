import { buildCopies, copiesLayer, type CopiesParams } from './copies';
import { mergeFront } from '../../shared/atmosphere';
import { backdrop, dimPlates, finish } from '../../shared/backdrop';
import type { WorldDef } from '../../worldDef';

export const copies: WorldDef<'copies', CopiesParams> = {
  type: 'copies',
  label: '物の複製',
  note: '主役を環・扇・列・格子・螺旋に並べる',
  version: 'copies-v4',
  controls: ['light', 'size', 'darkness'],
  odds: () => 1.0,
  build: (x) => buildCopies(x.seeds.streams.copies, x.fov),
  render: (x) => {
    const { hdr, light, look } = backdrop(x, false);
    const layer = copiesLayer(x.world.copies, x.obj, x.img, x.world.camera, x.controls, x.W, x.H);
    dimPlates(layer, x.W * x.H);
    mergeFront(hdr, layer, light, look);
    return { rgba: finish(hdr, x.controls, true), objects: layer.a };
  },
};
