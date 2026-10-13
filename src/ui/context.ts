import type { RenderController } from '../app/controller';
import type { AppState } from '../app/state';
import type { Layout } from './layout';

/** What the screen's parts share (009 FR-909): the layout, the state and the one queue that changes it. */
export interface AppContext {
  ui: Layout;
  state(): AppState;
  /** State changes run one after another so async reseeding never applies out of order. */
  update(fn: (s: AppState) => AppState | Promise<AppState>): void;
  /** Ready once the workers are; every rendering path waits in `update`'s queue first. */
  controller(): RenderController;
  /** Notices kept across photos (loading a photo replaces the others). */
  lastingNotices: string[];
}
