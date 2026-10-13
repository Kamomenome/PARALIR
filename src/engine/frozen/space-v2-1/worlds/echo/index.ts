import { buildEcho, renderEcho, type EchoParams } from './echo';
import type { WorldDef } from '../../worldDef';

export const echo: WorldDef<'echo', EchoParams> = {
  type: 'echo',
  label: '自分で埋める',
  note: '被写体の中を被写体の複製で埋める',
  version: 'echo-v1',
  odds: () => 1.0,
  build: (x) => buildEcho(x.seeds.streams.echo),
  render: (x) => renderEcho(x.world.echo, x.obj, x.img, x.controls, x.W, x.H, x.parts),
};
