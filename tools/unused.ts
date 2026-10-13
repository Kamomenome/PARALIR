// Lists what nothing uses (009 FR-921): source files no other file imports, and exported names no other file
// imports — in the app's code (src/), and separately those only the tests use. Names kept on purpose go in
// tools/unused-allow.json with the reason. Exits 1 when something is found.
// Usage: npx tsx tools/unused.ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const ENTRIES = ['src/ui/main.ts', 'src/worker/render.worker.ts'];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const slash = (p: string) => p.replace(/\\/g, '/');
const src = files('src').map(slash);
const others = [...files('tests'), ...files('tools'), 'vite.config.ts', 'vitest.config.ts'].filter(existsSync).map(slash);

/** The file an import specifier points at, if it is one of ours. */
function resolve(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = slash(normalize(join(dirname(from), spec.split('?')[0])));
  return [`${base}.ts`, `${base}/index.ts`, base].find((c) => existsSync(c) && statSync(c).isFile());
}

interface Import {
  from: string;
  target: string;
  names: string[] | '*';
}
const IMPORT = /(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'|import\s*\(\s*'([^']+)'\s*\)|import\s+'([^']+)'/g;
function importsOf(file: string): Import[] {
  const text = readFileSync(file, 'utf8');
  const out: Import[] = [];
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[3] ?? m[4] ?? m[5];
    const target = resolve(file, spec);
    if (!target) continue;
    const clause = m[2] ?? '';
    const braces = clause.match(/\{([^}]*)\}/);
    const star = !braces || /\*/.test(clause) || m[4] !== undefined;
    const names = braces ? braces[1].split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean) : [];
    out.push({ from: file, target, names: star && !braces ? '*' : names });
  }
  return out;
}

const EXPORT = /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g;
const exportsOf = (file: string) => [...readFileSync(file, 'utf8').matchAll(EXPORT)].map((m) => m[1]);

const appImports = src.flatMap(importsOf);
const testImports = others.flatMap(importsOf);
const allow: Record<string, string> = existsSync('tools/unused-allow.json') ? JSON.parse(readFileSync('tools/unused-allow.json', 'utf8')) : {};

const usedBy = (imports: Import[], file: string, name: string) => imports.some((i) => i.target === file && (i.names === '*' || i.names.includes(name)));
// Re-exports (export { x } from './y') count as uses of y's names.
const deadFiles = src.filter((f) => !ENTRIES.includes(f) && !appImports.some((i) => i.target === f) && !allow[f]);
const testOnlyFiles = deadFiles.filter((f) => testImports.some((i) => i.target === f));
const deadExports: string[] = [];
const testOnly: string[] = [];
/** Exported but used only inside its own file: the code is needed, only the `export` is extra. Not a finding. */
let internalOnly = 0;
// A file allowed as a whole keeps all its exports; a frozen engine stays exactly as it was frozen (017).
for (const f of src.filter((x) => !deadFiles.includes(x) && !allow[x] && !x.startsWith('src/engine/frozen/'))) {
  for (const name of exportsOf(f)) {
    const key = `${f}#${name}`;
    if (allow[key] || usedBy(appImports, f, name)) continue;
    // Used inside its own file only: the export keyword is not needed, but the code is.
    const inside = (readFileSync(f, 'utf8').match(new RegExp(`\\b${name.replace('$', '\\$')}\\b`, 'g')) ?? []).length > 1;
    if (inside) internalOnly++;
    else if (usedBy(testImports, f, name)) testOnly.push(key);
    else deadExports.push(key);
  }
}

const show = (title: string, list: string[]) => console.log(`\n${title}: ${list.length}\n${list.map((l) => `  ${l}`).join('\n')}`);
show('アプリから読み込まれていないファイル（テストだけ: *）', deadFiles.map((f) => relative('.', f) + (testOnlyFiles.includes(f) ? ' *' : '')));
show('どこからも使われていない書き出し', deadExports);
show('テストだけが使う書き出し（理由があれば tools/unused-allow.json へ）', testOnly);
console.log(`
（ファイルの中だけで使う書き出し ${internalOnly} 件は問題なし）`);
process.exit(deadFiles.length + deadExports.length + testOnly.length > 0 ? 1 : 0);
