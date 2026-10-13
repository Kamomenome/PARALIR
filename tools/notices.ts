// Writes THIRD_PARTY_NOTICES.md (009 FR-912): every package shipped in the app (package.json dependencies and
// theirs) with its license text, the on-device AI models, and what MediaPipe's wasm contains.
// Usage: npx tsx tools/notices.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RuntimePackage {
  name: string;
  version: string;
  license: string;
  licenseText: string;
}

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim();
/** MediaPipe's npm package has no LICENSE file; its repository's (Apache-2.0 in full, and the Lucent notice) is kept here. */
const MEDIAPIPE_LICENSE = 'tools/licenses/mediapipe-LICENSE.txt';

/** The packages that end up in the built app: the dependencies, followed down through node_modules. */
export function runtimePackages(): RuntimePackage[] {
  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  const seen = new Map<string, RuntimePackage>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    const dir = join('node_modules', name);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((f) => join(dir, f)).find(existsSync);
    const licenseText = name === '@mediapipe/tasks-vision' ? read(MEDIAPIPE_LICENSE) : file ? read(file) : '';
    seen.set(name, { name, version: pkg.version, license: pkg.license, licenseText });
    for (const d of Object.keys(pkg.dependencies ?? {})) visit(d);
  };
  for (const d of Object.keys(root.dependencies ?? {})) visit(d);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const MODELS = [
  {
    file: 'selfie_multiclass_256x256.tflite',
    what: '人物の部分の切り分け（髪・体・顔・服など）',
    card: 'https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf',
  },
  {
    file: 'face_landmarker.task',
    what: '顔の位置と形（BlazeFace short range、Face Mesh V2、Blendshape V2）',
    card: 'https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf',
  },
  {
    file: 'magic_touch.tflite',
    what: 'クリックした物の切り抜き（Interactive Segmenter "MagicTouch"）',
    card: 'https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MagicTouch.pdf',
  },
];

/** Seen in the wasm's strings; Google does not publish the list (009 decision.md). */
const WASM_PARTS = [
  ['OpenCV', 'Apache-2.0', 'https://github.com/opencv/opencv'],
  ['Eigen', 'MPL-2.0', 'https://gitlab.com/libeigen/eigen（ソースの入手先）'],
  ['Protocol Buffers', 'BSD-3-Clause', 'https://github.com/protocolbuffers/protobuf'],
  ['XNNPACK', 'BSD-3-Clause', 'https://github.com/google/XNNPACK'],
  ['TensorFlow Lite', 'Apache-2.0', 'https://github.com/tensorflow/tensorflow'],
  ['Abseil', 'Apache-2.0', 'https://github.com/abseil/abseil-cpp'],
  ['Emscripten', 'MIT / University of Illinois/NCSA', 'https://github.com/emscripten-core/emscripten'],
];

export function renderNotices(): string {
  const pkgs = runtimePackages();
  const vite = read('node_modules/vite/LICENSE.md').split('\n## ')[0].replace(/^# Vite core license\n/, '').trim();
  return `# Third-party notices（使っている部品のライセンス）

PARALIR 自身は MIT ライセンスです（[LICENSE](LICENSE)）。PARALIR には次の部品が含まれます。この表示は \`npx tsx tools/notices.ts\` で作ります。

## 端末内の AI モデル（Google MediaPipe）

どれも Google が作り、Apache License 2.0 で公開しているモデルです（変更せずに同梱しています）。

| ファイル | 役割 | モデルカード |
|---|---|---|
${MODELS.map((m) => `| ${m.file} | ${m.what} | ${m.card} |`).join('\n')}

モデルカードでは、**監視や個人の識別**、**命に関わる判断**は想定外の使い方（用途外）とされています。PARALIR は写真の部品を見分けて絵を作るためだけに使い、
顔の認識や個人の特定はしません。写真もモデルの結果も端末の外へは送りません。

## ライブラリ

${pkgs.map((p) => `### ${p.name} ${p.version}（${p.license}）\n\n\`\`\`text\n${p.licenseText}\n\`\`\``).join('\n\n')}

### MediaPipe の wasm に組み込まれている部品

\`@mediapipe/tasks-vision\` の wasm には、次のオープンソースの部品が組み込まれています（wasm の中の文字列から確認した構成。Google は一覧を公開していません）。

| 部品 | ライセンス | 出所 |
|---|---|---|
${WASM_PARTS.map(([n, l, u]) => `| ${n} | ${l} | ${u} |`).join('\n')}

### ビルドで入る小さな補助（Vite、MIT）

\`\`\`text
${vite}
\`\`\`
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync('THIRD_PARTY_NOTICES.md', renderNotices());
  console.log(`THIRD_PARTY_NOTICES.md: ${runtimePackages().length} packages`);
}
