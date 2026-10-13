import { buildMosaic, renderMosaic, type MosaicParams } from './mosaic';
import type { WorldDef } from '../../worldDef';

export const mosaic: WorldDef<'mosaic', MosaicParams> = {
  type: 'mosaic',
  label: '矩形の組み替え',
  note: '被写体を長方形に切って組み替える',
  version: 'mosaic-v2',
  odds: () => 1.0,
  build: (x) => buildMosaic(x.seeds.streams.mosaic),
  render: (x) => renderMosaic(x.world.mosaic, x.ranged(), x.img, x.controls, x.W, x.H),
};
