// The live engine draws without waiting; frozen engines load on first use (renderers.ts, 009 FR-905).
import { CURRENT_ENGINE } from '../engine/engines';
import { engine } from '../engine/space-v2';
import { toDisplay } from '../engine/space-v2/shared/color';
import { framePhoto } from '../engine/space-v2/shared/inplace';
import { engineRenderer, registerRenderer } from './renderers';

registerRenderer(CURRENT_ENGINE, engineRenderer(engine));
// The photo as it is, framed like the worlds (cover, centred) so a lasso drawn on it lands where it will in the world (011 FR-1101).
registerRenderer('photo', ({ src, W, H }) => toDisplay(framePhoto(src, W, H), W, H, false));
