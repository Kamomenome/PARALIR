import type { ImageFeatures } from './common/analysis/features';
import type { Hex64 } from './common/hash/sha256';
import { seedInputJson, type SeedInput } from './common/seed/seeds';
import type { TimeSnapshot } from './common/time/snapshot';
import { buildSpaceSeedInput, deriveSpaceSeeds } from './space-v2/seeds';
import { SPACE_CONTROL_KEYS, type SpaceControls } from './space-v2/types';
import { CURRENT_ENGINE, engineEntry, engineFor } from './engines';
import { PARTS_VERSION } from './common/parts/types';

/** What the AI saw in the photo when the work was saved (004 FR-404); null when it did not run. */
export interface PartsRecord {
  version: typeof PARTS_VERSION;
  digest: string;
}

/** Saved form of a spatial work (003 FR-311, contracts/space-v2-recipe.schema.json). */
export interface SpaceRecipe {
  schemaVersion: 1;
  engineVersion: 'space-v2';
  prngVersion: 'seeded32-v1';
  analysisVersion: 'analysis-v1';
  /** The versions of the engine that drew it; a frozen engine with these versions opens it (009 FR-905). */
  algorithms: Readonly<Record<string, string>>;
  /** The world fixed on screen, or 'auto' (the seed's choice). */
  worldType: string;
  source: { fileSha256: Hex64; pixelHash: Hex64; width: number; height: number };
  time: Omit<TimeSnapshot, 'resolution'>;
  variationIndex: number;
  seed: { seedInput: SeedInput; rootSeed: Hex64 };
  controls: SpaceControls;
  output: { width: number; height: number; format: 'png'; qualityMode: 'standard' | 'supersample-3' };
  /** Optional (004): absent in recipes saved before the AI parts. */
  parts?: PartsRecord | null;
  /** Optional (005): one rough lasso, normalised photo coordinates; written up to ver 1.32. */
  lasso?: [number, number][] | null;
  /** Optional (013B FR-1310): every lasso of the work. */
  lassos?: [number, number][][] | null;
  /** Optional (008): the app version and commit that saved it, so a refused work says where it can be opened. */
  app?: AppRecord;
}

export interface AppRecord {
  version: string;
  commit: string;
}

export interface SpaceRecipeSource {
  source: { loaded: { fileSha256: Hex64; img: { width: number; height: number } }; pixelHash: Hex64 } | null;
  time: TimeSnapshot;
  variationIndex: number;
  spaceSeeds: { seedInput: SeedInput; rootSeed: string } | null;
  spaceControls: SpaceControls;
  spaceType: string;
  engineId?: string;
  spaceParts?: { status: string; parts?: { version: typeof PARTS_VERSION; digest: string } } | null;
  spaceLassos?: [number, number][][];
}

export function toSpaceRecipe(s: SpaceRecipeSource, app?: AppRecord): SpaceRecipe {
  if (!s.source || !s.spaceSeeds) throw new Error('空間モードの作品がまだありません');
  return {
    schemaVersion: 1,
    engineVersion: 'space-v2',
    prngVersion: 'seeded32-v1',
    analysisVersion: 'analysis-v1',
    algorithms: { ...engineEntry(s.engineId ?? CURRENT_ENGINE)!.algorithms },
    worldType: s.spaceType,
    source: { fileSha256: s.source.loaded.fileSha256, pixelHash: s.source.pixelHash, width: s.source.loaded.img.width, height: s.source.loaded.img.height },
    time: { instantEpochMs: s.time.instantEpochMs, localDateTime: s.time.localDateTime, timeZone: s.time.timeZone, offsetMinutes: s.time.offsetMinutes },
    variationIndex: s.variationIndex,
    seed: { seedInput: s.spaceSeeds.seedInput, rootSeed: s.spaceSeeds.rootSeed as Hex64 },
    controls: { ...s.spaceControls },
    // 'standard' is what the export does; 'supersample-3' in older recipes is still read (008 FR-817).
    output: { width: 2400, height: 1800, format: 'png', qualityMode: 'standard' },
    parts: s.spaceParts?.status === 'ok' && s.spaceParts.parts ? { version: s.spaceParts.parts.version, digest: s.spaceParts.parts.digest } : null,
    lassos: s.spaceLassos?.length ? s.spaceLassos.map((l) => l.map(([u, v]) => [u, v] as [number, number])) : null,
    ...(app ? { app: { version: app.version, commit: app.commit } } : {}),
  };
}

const APP_VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const APP_COMMIT_RE = /^([0-9a-f]{7,40}(-dirty)?|unknown)$/;

const HEX64 = /^[0-9a-f]{64}$/;

/** Validates shape, versions and values; rejects unknown versions instead of re-interpreting them. */
export function validateSpaceRecipe(r: any): string[] {
  const e: string[] = [];
  const isObj = (v: unknown) => v && typeof v === 'object' && !Array.isArray(v);
  const scan = (v: unknown, p: string) => {
    if (typeof v === 'number' && !Number.isFinite(v)) e.push(`${p}: NaN または Infinity です`);
    else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${p}[${i}]`));
    else if (isObj(v)) for (const [k, x] of Object.entries(v as object)) scan(x, `${p}.${k}`);
  };
  if (!isObj(r)) return ['レシピがオブジェクトではありません'];
  if (r.engineVersion === 'space-v1') {
    return ['以前の空間モード（space-v1）の作品です。空間モードは作り直したため、この作品は再現できません（新しい方式で別の絵を描くことはしません）'];
  }
  scan(r, 'recipe');
  const allowed = ['schemaVersion', 'engineVersion', 'prngVersion', 'analysisVersion', 'algorithms', 'worldType', 'source', 'time', 'variationIndex', 'seed', 'controls', 'output'];
  for (const k of Object.keys(r)) if (!allowed.includes(k) && !['parts', 'lasso', 'lassos', 'app'].includes(k)) e.push(`${k}: 不明な項目です`);
  const app = r.app;
  const appOk = app === undefined || (isObj(app) && Object.keys(app).length === 2 && APP_VERSION_RE.test(app.version) && APP_COMMIT_RE.test(app.commit));
  if (!appOk) e.push('app: 形式が正しくありません（版と commit）');
  for (const k of allowed) if (!(k in r)) e.push(`${k}: ありません`);
  const lassoOk = (l: unknown) => Array.isArray(l) && l.length >= 3 && l.length <= 256 && l.every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 1));
  if (r.lasso != null && !lassoOk(r.lasso)) e.push('lasso: 形式が正しくありません（0〜1 の点 3〜256 個）');
  if (r.lassos != null && !(Array.isArray(r.lassos) && r.lassos.length >= 1 && r.lassos.length <= 16 && r.lassos.every(lassoOk))) {
    e.push('lassos: 形式が正しくありません（囲み 1〜16 個、それぞれ 0〜1 の点 3〜256 個）');
  }
  if (r.parts != null && (!isObj(r.parts) || r.parts.version !== PARTS_VERSION || !/^[0-9a-f]{16}$/.test(r.parts.digest) || Object.keys(r.parts).length !== 2)) {
    e.push(`parts: 形式が正しくありません（版 ${PARTS_VERSION} と 16 桁の要約）`);
  }
  if (r.schemaVersion !== 1) e.push('schemaVersion: 未対応の値です');
  if (r.engineVersion !== 'space-v2') e.push('engineVersion: 未対応の値です');
  if (r.prngVersion !== 'seeded32-v1') e.push('prngVersion: 未対応の値です');
  if (r.analysisVersion !== 'analysis-v1') e.push('analysisVersion: 未対応の値です');
  if (!isObj(r.algorithms)) e.push('algorithms: ありません');
  else {
    const before = e.length;
    // Any engine in the list with exactly these versions opens it; otherwise say how they differ from the current one.
    if (!engineFor(r.algorithms)) {
      const current = engineEntry(CURRENT_ENGINE)!.algorithms;
      for (const [k, v] of Object.entries(current)) if (r.algorithms[k] !== v) e.push(`algorithms.${k}: 未対応の版です（${r.algorithms[k]}）`);
      for (const k of Object.keys(r.algorithms)) if (!(k in current)) e.push(`algorithms.${k}: 不明な方式です`);
    }
    // Other world versions: say which build draws it, when the recipe knows (008 FR-802).
    if (e.length > before && app !== undefined && appOk) {
      const shown = app.version.split('.').slice(0, 2).join('.');
      e.unshift(`ver ${shown}（commit ${app.commit}）で保存された作品です。その版の PARALIR で開くと再現できます`);
    }
  }
  const worlds = (engineFor(r.algorithms) ?? engineEntry(CURRENT_ENGINE)!).worldTypes;
  if (r.worldType !== 'auto' && !worlds.includes(r.worldType)) e.push('worldType: 未対応の値です');
  if (!isObj(r.source) || !HEX64.test(r.source?.pixelHash) || !HEX64.test(r.source?.fileSha256) || !Number.isInteger(r.source?.width) || !Number.isInteger(r.source?.height)) {
    e.push('source: 形式が正しくありません');
  }
  const t = r.time;
  if (!isObj(t) || !/^-?(0|[1-9][0-9]*)$/.test(t.instantEpochMs) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}$/.test(t.localDateTime) || typeof t.timeZone !== 'string' || !Number.isInteger(t.offsetMinutes)) {
    e.push('time: 形式が正しくありません');
  }
  if (!Number.isInteger(r.variationIndex) || r.variationIndex < 0) e.push('variationIndex: 0 以上の整数ではありません');
  if (!isObj(r.seed) || !Array.isArray(r.seed.seedInput) || r.seed.seedInput.length !== 7 || r.seed.seedInput[0] !== 'space-v2' || !HEX64.test(r.seed.rootSeed)) {
    e.push('seed: 形式が正しくありません');
  }
  if (!isObj(r.controls)) e.push('controls: ありません');
  else {
    for (const k of SPACE_CONTROL_KEYS) {
      const v = r.controls[k];
      if (typeof v !== 'number' || !(v >= 0 && v <= 1)) e.push(`controls.${k}: 0〜1 の数値ではありません`);
    }
    for (const k of Object.keys(r.controls)) if (!(SPACE_CONTROL_KEYS as readonly string[]).includes(k)) e.push(`controls.${k}: 不明な項目です`);
  }
  const o = r.output;
  if (!isObj(o) || !Number.isInteger(o.width) || !Number.isInteger(o.height) || o.format !== 'png' || !['standard', 'supersample-3'].includes(o.qualityMode)) {
    e.push('output: 形式が正しくありません');
  }
  return e;
}

export type SpaceParseResult = { ok: true; recipe: SpaceRecipe } | { ok: false; errors: string[] };

/** A recipe nests a few levels; anything deeper is not one, and the checks below recurse (008 FR-814). */
export const MAX_RECIPE_DEPTH = 32;

function deeperThan(data: unknown, max: number): boolean {
  const stack: [unknown, number][] = [[data, 1]];
  while (stack.length) {
    const [v, d] = stack.pop()!;
    if (!v || typeof v !== 'object') continue;
    if (d > max) return true;
    for (const x of Object.values(v as object)) stack.push([x, d + 1]);
  }
  return false;
}

export function parseSpaceRecipe(text: string): SpaceParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON として読めません'] };
  }
  if (deeperThan(data, MAX_RECIPE_DEPTH)) return { ok: false, errors: [`入れ子が深すぎます（上限 ${MAX_RECIPE_DEPTH} 段）`] };
  const errors = validateSpaceRecipe(data);
  return errors.length ? { ok: false, errors } : { ok: true, recipe: data as SpaceRecipe };
}

/** Recomputes the seed from the photo and the recipe's inputs; a different photo is never "the same work". */
export async function verifySpaceRecipe(
  r: SpaceRecipe,
  source: { pixelHash: Hex64; features: ImageFeatures; loaded: { fileSha256: Hex64 } },
): Promise<{ status: 'ok' | 'different-image' | 'rejected'; messages: string[] }> {
  if (r.source.pixelHash !== source.pixelHash) {
    return { status: 'different-image', messages: ['この写真はレシピの写真と画素が一致しないため、同一再現ではありません。同じ写真を読み込んでください'] };
  }
  const si = buildSpaceSeedInput(r.source.pixelHash, { ...r.time, resolution: 'exact' }, r.variationIndex);
  if (seedInputJson(si) !== seedInputJson(r.seed.seedInput)) return { status: 'rejected', messages: ['seed 入力がレシピの日時・別案番号と一致しません'] };
  if ((await deriveSpaceSeeds(si)).rootSeed !== r.seed.rootSeed) return { status: 'rejected', messages: ['rootSeed が再計算値と一致しません'] };
  const messages: string[] = [];
  if (r.source.fileSha256 !== source.loaded.fileSha256) messages.push('ファイルはレシピの保存時と異なりますが、画素は同じです');
  return { status: 'ok', messages };
}

/**
 * The AI parts now and at saving differ (or one side had none): the work may come out differently (004 FR-404).
 * A notice, not a rejection: the seed and the photo are the same.
 */
export function partsNotice(saved: PartsRecord | null | undefined, current: string | null): string[] {
  if (saved === undefined) return [];
  const was = saved?.digest ?? null;
  if (was === current) return [];
  const show = (d: string | null) => d ?? 'なし';
  return [`部品の見分けが保存時と違います（保存時 ${show(was)}、今回 ${show(current)}）。絵が変わることがあります`];
}

/** Sniff the engine of a recipe file so the loader can route it. */
export function recipeEngineOf(text: string): string | null {
  try {
    const d = JSON.parse(text);
    return typeof d?.engineVersion === 'string' ? d.engineVersion : null;
  } catch {
    return null;
  }
}
