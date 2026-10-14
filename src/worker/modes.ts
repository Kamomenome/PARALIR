// The engine (020 FR-2002) and the photo as it is.
import { CURRENT_ENGINE, ENGINE } from '../engine/engines';
import { toDisplay } from '../engine/space-v2/shared/color';
import { framePhoto } from '../engine/space-v2/shared/inplace';
import { engineRenderer, registerRenderer } from './renderers';

registerRenderer(CURRENT_ENGINE, engineRenderer(ENGINE));
// The photo as it is, framed like the worlds (cover, centred) so a lasso drawn on it lands where it will in the world (011 FR-1101).
registerRenderer('photo', ({ src, W, H }) => toDisplay(framePhoto(src, W, H), W, H, false));
