import notices from '../../THIRD_PARTY_NOTICES.md?raw';
import { APP_COMMIT, APP_NAME, APP_VERSION } from '../app/version';
import { h } from './layout';

/** 「このアプリについて」 (009 FR-913): the licence, privacy, the AI's intended use and the third-party notices. */
export function buildAbout(): HTMLElement {
  const text = h('pre', { class: 'notices-text', 'data-testid': 'notices-text' }, notices);
  return h(
    'details',
    { class: 'about', 'data-testid': 'about' },
    h('summary', {}, 'このアプリについて'),
    h('p', {}, `${APP_NAME} ver ${APP_VERSION}（commit ${APP_COMMIT}）。MIT ライセンスで、無料で誰でも使えます。`),
    h('p', {}, '写真は端末の外へ送りません。人物や物を見分ける AI もこの端末の中で動き、外への通信はアプリとブラウザの両方で止めています。'),
    h('p', {}, '絵を作る部分（崩す・組み替える・複製する・光を描く）は、決まった計算だけで行っています。画像を生成する AI は使っていません。同じ写真と設定からは、いつも同じ絵になります。'),
    h('p', {}, 'AI は、写真の中の人物や物の位置と輪郭を見分けるためだけに使います（AI が使えないときは、写真から推定して描きます）。'),
    h('p', {}, 'AI のモデル（Google MediaPipe）は、監視や個人の識別、命に関わる判断に使うことは想定外とされています。PARALIR は絵を作るためだけに使います。'),
    h('p', { class: 'muted' }, '使っている部品のライセンス:'),
    text,
  );
}
