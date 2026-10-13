// The live engine draws without waiting; frozen engines load on first use (renderers.ts, 009 FR-905).
import { CURRENT_ENGINE } from '../engine/engines';
import { engine } from '../engine/space-v2';
import { engineRenderer, registerRenderer } from './renderers';

registerRenderer(CURRENT_ENGINE, engineRenderer(engine));
