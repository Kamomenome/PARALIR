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
    // The user's words (019 FR-1914).
    h('p', {}, `${APP_NAME} ver ${APP_VERSION}（commit ${APP_COMMIT}）は、MITライセンスで公開している、誰でも無料で使えるアプリです。`),
    h('p', {}, '写真の処理はすべて端末内で行い、外部へ送信することはありません。人物や物の位置・輪郭を読み取るAIも端末内で動作し、外部への通信はアプリとブラウザの両方で遮断しています。'),
    h('p', {}, '画像を崩す、組み替える、複製する、光を描くといった表現は、すべて決められた計算の組み合わせで作り出しています。画像生成AIは使っていません。'),
    h('p', {}, 'AIの役割は、写真に写っている人物や物の位置・輪郭を読み取ることだけです。AIが使えない場合も、写真の情報からそれらを推定して描画します。'),
    h('p', {}, '使用しているAIモデル（Google MediaPipe）は、監視や個人の識別、命に関わる判断への利用を想定していません。PARALIRでは、絵を作るためにのみ使用しています。'),
    h('p', { class: 'muted' }, '使っている部品のライセンス:'),
    text,
  );
}
