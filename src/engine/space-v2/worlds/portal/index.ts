import { buildPortal, renderPortal, type PortalParams } from './portal';
import type { WorldDef } from '../../worldDef';

export const portal: WorldDef<'portal', PortalParams> = {
  type: 'portal',
  label: '門',
  note: '光の門の前に人物',
  version: 'portal-v2',
  odds: () => 0.9,
  build: (x) => buildPortal(x.seeds.streams.portal),
  render: (x) => renderPortal(x.world.portal, x.world.atmosphere.flame, x.obj, x.img, x.world.camera, x.controls, x.W, x.H, x.quality),
};
