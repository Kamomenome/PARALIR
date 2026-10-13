import { buildEcho, renderEcho, type EchoParams } from './echo';
import type { WorldDef } from '../../worldDef';

export const echo: WorldDef<'echo', EchoParams> = {
  type: 'echo',
  label: '入れ子',
  note: '主役の形の中に、小さな主役を並べる',
  version: 'echo-v2',
  controls: ['size'],
  usesRange: true,
  odds: () => 1.0,
  build: (x) => buildEcho(x.seeds.streams.echo),
  render: (x) => renderEcho(x.world.echo, x.obj, x.img, x.controls, x.W, x.H, x.parts),
};
