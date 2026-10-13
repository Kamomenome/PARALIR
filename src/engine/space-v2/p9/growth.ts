import type { RgbImage } from '../../common/image/normalize';
import { clip } from '../../common/math';
import { lookup, type EffectiveFeatures } from '../../common/analysis/effective';
import { project, NEAR, type Camera } from './camera';
import type { GrowthForm, SpaceLayout } from './layout';
import { photoSampler } from './photo';
import { drawsFrom } from './seeds';
import type { Vec3 } from './types';

/**
 * ② Growth rule + tubes (research R-203): a spine, branches that split recursively and taper, and
 * membranes between sibling branches; the structure repeats into depth.
 * Phase 5: the tubes are skinned with strips cut from the photo along its edges, and the membranes are
 * stretched photo pieces — no synthetic surface colour.
 * Phase 6 (growth-v4): the seeded layout picks the form (arches, radial ribs, hanging tendrils, spirals)
 * and the symmetry (mirror, rotational, none).
 */

/** A strip of the photo: centre (u, v), direction along it, length and width (normalised photo units). */
export interface Strip {
  u: number;
  v: number;
  du: number;
  dv: number;
  len: number;
  width: number;
}

export interface Segment {
  design: number;
  a: Vec3;
  b: Vec3;
  r0: number;
  r1: number;
  /** 0 = spine, 1.. = branch generation */
  depth: number;
  /** Photo strip that skins this tube, position along it at a and b, lateral offset across it. */
  strip: number;
  s0: number;
  s1: number;
  lat: number;
}

export interface Membrane {
  design: number;
  p: [Vec3, Vec3, Vec3];
  strip: number;
  s: number;
  lat: number;
}

export interface ArchInstance {
  design: number;
  z: number;
  scale: number;
  roll: number;
  /** Upside down (hangs from above): mixes up and down along the tunnel. */
  flip: boolean;
}

export interface GrowthParams {
  version: 'growth-v5';
  form: GrowthForm;
  strips: Strip[];
  segments: Segment[];
  membranes: Membrane[];
  arches: ArchInstance[];
}

const STRIP_CANDIDATES = 12;

/** Direction along the photo's edge at (u, v): perpendicular to the luminance gradient. */
function edgeDirection(e: EffectiveFeatures, u: number, v: number, fallback: number): [number, number] {
  const gx = lookup(e, 'gx', u, v);
  const gy = lookup(e, 'gy', u, v);
  const l = Math.hypot(gx, gy);
  if (l < 1e-6) return [Math.cos(2 * Math.PI * fallback), Math.sin(2 * Math.PI * fallback)];
  return [-gy / l, gx / l];
}

/**
 * A strip along an edge of the photo (building outlines, poles, road lines, window rows): candidates
 * weighted by the detail along their whole length (Phase 6), so a strip does not run off into the sky
 * (plain pale tubes) or across a striped sign (bee-like stripes); moderate detail reads as an organic skin.
 */
async function pickStrip(stream: Uint8Array, id: string, e: EffectiveFeatures): Promise<Strip> {
  const d = await drawsFrom(stream, id, STRIP_CANDIDATES * 2 + 4);
  const len = 0.16 + 0.2 * d[STRIP_CANDIDATES * 2 + 2];
  const fallback = d[STRIP_CANDIDATES * 2 + 1];
  const detailWeight = (g: number) => Math.exp(-(((g - 0.3) / 0.15) ** 2));
  let total = 0;
  const w: number[] = [];
  const dirs: [number, number][] = [];
  for (let c = 0; c < STRIP_CANDIDATES; c++) {
    const u = d[c * 2];
    const v = d[c * 2 + 1];
    const dir = edgeDirection(e, u, v, fallback);
    dirs.push(dir);
    let sum = 0;
    for (let q = -2; q <= 2; q++) {
      const a = (q / 4) * len;
      sum += detailWeight(lookup(e, 'G', clip(u + dir[0] * a, 0, 1), clip(v + dir[1] * a, 0, 1)));
    }
    // The centre counts twice: it is where the strip's lane starts.
    const score = (sum + detailWeight(lookup(e, 'G', u, v))) / 6;
    w.push(score ** 3 + 0.005);
    total += w[c];
  }
  let t = d[STRIP_CANDIDATES * 2] * total;
  let k = STRIP_CANDIDATES - 1;
  for (let c = 0; c < STRIP_CANDIDATES; c++) {
    if (t < w[c]) {
      k = c;
      break;
    }
    t -= w[c];
  }
  return { u: d[k * 2], v: d[k * 2 + 1], du: dirs[k][0], dv: dirs[k][1], len, width: 0.03 + 0.04 * d[STRIP_CANDIDATES * 2 + 3] };
}

const DESIGNS = 2;
const ROOTS = 7;
/** Fixed number of photo strips: a spine and one per root, per design (for per-strip draws elsewhere). */
export const STRIP_COUNT = DESIGNS * (1 + ROOTS);
const TREE_DEPTH = 4;
const NODE_DRAWS = 7;
const SPINE_STEPS = 12;
const MAX_ARCHES = 9;
const nodesPerRoot = (1 << (TREE_DEPTH + 1)) - 1;

type V = Vec3;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Rotate v in the xy-plane by angle, then tilt towards z. */
const turn = (v: V, ang: number, tilt: number): V => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return norm([c * v[0] - s * v[1], s * v[0] + c * v[1], v[2] + tilt]);
};

interface ArchShape {
  w: number;
  h: number;
  /** Undulation of the spine along its normal. */
  amp: number;
  freq: number;
  phase: number;
}

/** Arch centre line (right half): φ ∈ [0, π/2]; top at φ = 0, foot at φ = π/2. Screen y points down. */
function archPoint(phi: number, s: ArchShape): V {
  const base: V = [s.w * Math.sin(phi), 0.95 - s.h * Math.cos(phi), 0];
  const tangent = norm([Math.cos(phi) * s.w, Math.sin(phi) * s.h, 0]);
  const wob = s.amp * Math.sin(phi * s.freq + s.phase) * Math.sin(phi * 2); // 0 at the top keeps the mirror seam clean
  return [base[0] + tangent[1] * wob, base[1] - tangent[0] * wob, 0.15 * s.amp * Math.sin(phi * s.freq * 0.7 + s.phase)];
}

/**
 * Spine centre line for each organic form (Phase 6), t ∈ [0, 1] from base to tip. `beta` is the
 * direction of the spine in its symmetry domain (right half for mirror symmetry).
 */
function spinePoint(form: GrowthForm, t: number, s: ArchShape, beta: number): V {
  const wav = s.amp * Math.sin(t * s.freq + s.phase);
  switch (form) {
    case 'arches':
      return archPoint(t * (Math.PI / 2), s);
    case 'radial': {
      // A rib radiating from the void outwards, curling slightly and leaning towards the viewer.
      const r = 0.32 + 1.45 * s.w * t;
      const a = beta + 0.35 * t * Math.sin(s.phase) + 0.5 * wav * t;
      return [r * Math.cos(a), r * Math.sin(a), -0.35 * s.h * t * t + 0.4 * wav];
    }
    case 'hanging': {
      // A tendril hanging from above, swaying and curling at its tip.
      const x0 = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(beta));
      const y = -1.55 + (1.15 + 0.35 * s.h) * t;
      return [x0 + 1.4 * wav * t + 0.18 * Math.sin(2.5 * t * t + s.phase) * t, y, 0.3 * wav];
    }
    case 'spiral': {
      // A logarithmic spiral winding inwards to the void and away into depth.
      const r = 0.15 + 1.35 * s.w * Math.exp(-1.7 * t);
      const a = beta + 2.4 * Math.PI * t;
      return [r * Math.cos(a), r * Math.sin(a), 0.9 * s.h * t + 0.3 * wav];
    }
  }
}

type Xf = (v: V) => V;

/** Copies of the half structure under the layout's symmetry (identity first). */
function symmetryCopies(L: Pick<SpaceLayout, 'symmetry' | 'order'>, design: number): Xf[] {
  if (L.symmetry === 'mirror') return [(v) => v, (v) => [-v[0], v[1], v[2]]];
  if (L.symmetry === 'rotational') {
    return Array.from({ length: L.order }, (_, n) => {
      const c = Math.cos((2 * Math.PI * n) / L.order);
      const s = Math.sin((2 * Math.PI * n) / L.order);
      return (v: V): V => [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
    });
  }
  // No symmetry: a second, smaller and turned copy so the structure is not lopsided yet not regular.
  const a = 2.3 + 0.7 * design;
  const c = Math.cos(a) * 0.78;
  const s = Math.sin(a) * 0.78;
  return [(v) => v, (v) => [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2] * 0.78 + 0.25]];
}

export async function buildGrowth(stream: Uint8Array, e: EffectiveFeatures, L: SpaceLayout): Promise<GrowthParams> {
  const form = L.growthForm;
  const segments: Segment[] = [];
  const membranes: Membrane[] = [];
  const strips: Strip[] = [];
  // Rotational symmetry multiplies the structure: fewer roots keep the density (and the cost) similar.
  const rootsUsed = L.symmetry === 'rotational' ? Math.max(3, Math.round((ROOTS * 2) / L.order)) : ROOTS;
  for (let d = 0; d < DESIGNS; d++) {
    const g = await drawsFrom(stream, `growth/design/${d}`, 6 + ROOTS * nodesPerRoot * NODE_DRAWS);
    const sh = await drawsFrom(stream, `growth/shape/${d}`, 3);
    const shape: ArchShape = { w: 0.85 + 0.35 * g[0], h: 1.7 + 0.4 * g[1], amp: 0.06 + 0.12 * sh[0], freq: 3 + 6 * sh[1], phase: 2 * Math.PI * sh[2] };
    // Direction of the spine inside the symmetry domain.
    const span = L.symmetry === 'mirror' ? Math.PI : L.symmetry === 'rotational' ? (2 * Math.PI) / L.order : 2 * Math.PI;
    const beta = (L.symmetry === 'mirror' ? -Math.PI / 2 : 0) + span * (0.2 + 0.6 * g[3]);
    if (form === 'hanging') shape.amp *= 0.6;
    const at = (t: number) => spinePoint(form, t, shape, beta);
    const spineR = 0.045 + 0.03 * g[2];
    const branchiness = 0.55 + 0.4 * e.E + 0.15 * g[4];
    const reach = 0.28 + 0.18 * g[5];
    const right: Segment[] = [];
    const rightMem: Membrane[] = [];
    // Spine (one half; the symmetry copies it below), skinned with one photo strip along its length.
    const spineStrip = strips.push(await pickStrip(stream, `growth/strip/${d}-spine`, e)) - 1;
    for (let s = 0; s < SPINE_STEPS; s++) {
      const a = at(s / SPINE_STEPS);
      const b = at((s + 1) / SPINE_STEPS);
      // Arches thicken towards the foot; the other forms taper from base to tip.
      const r = form === 'arches' ? spineR * (1.2 - 0.4 * (1 - s / SPINE_STEPS)) : spineR * (1.25 - 0.55 * (s / SPINE_STEPS));
      right.push({ design: d, a, b, r0: r, r1: r * 0.97, depth: 0, strip: spineStrip, s0: s / SPINE_STEPS, s1: (s + 1) / SPINE_STEPS, lat: 0 });
    }
    // Recursive branches from roots along the spine; a full binary tree of draws per root.
    let gi = 6;
    const roots: V[] = [];
    const firstTips: V[] = [];
    const rootStrips: number[] = [];
    for (let k = 0; k < ROOTS; k++) {
      const draws = g.slice(gi, gi + nodesPerRoot * NODE_DRAWS);
      gi += nodesPerRoot * NODE_DRAWS;
      const t = ((k + 0.5) / ROOTS) * 0.95;
      // Strips are always drawn so the stream does not depend on the layout.
      const strip = strips.push(await pickStrip(stream, `growth/strip/${d}-${k}`, e)) - 1;
      if (k >= rootsUsed) continue;
      const root = at(t);
      // Outward normal of the spine (away from the depth axis), alternating sides where that is ambiguous.
      const p0 = at(Math.max(0, t - 0.01));
      const p1 = at(Math.min(1, t + 0.01));
      const tangent = norm([p1[0] - p0[0], p1[1] - p0[1], 0]);
      let outward = norm([tangent[1], -tangent[0], 0]);
      const radialDot = outward[0] * root[0] + outward[1] * root[1];
      const rl = Math.hypot(root[0], root[1]);
      if (Math.abs(radialDot) < 0.25 * rl ? k % 2 === 1 : radialDot < 0) outward = mul(outward, -1);
      // Each root's tree is skinned with its own photo strip; the position along the strip follows the
      // path length from the root, siblings take neighbouring lanes across it.
      const sPerLen = 1 / (reach * 2.6);
      const grow = (node: number, depth: number, from: V, dir: V, len: number, r: number, s: number, lat: number): V | null => {
        const nd = draws.slice(node * NODE_DRAWS, node * NODE_DRAWS + NODE_DRAWS);
        if (depth > 1 && nd[0] > branchiness + 0.25) return null; // pruned (draws already consumed)
        // Three curved sub-segments per branch for an organic line.
        let p = from;
        let dd = dir;
        let sp = s;
        const curl = (nd[1] - 0.5) * 0.9;
        const rEnd = r * (0.62 + 0.1 * nd[2]);
        for (let sgm = 0; sgm < 3; sgm++) {
          const q = add(p, mul(dd, len / 3));
          const ra = r + ((rEnd - r) * sgm) / 3;
          const rb = r + ((rEnd - r) * (sgm + 1)) / 3;
          const ds = (len / 3) * sPerLen;
          right.push({ design: d, a: p, b: q, r0: ra, r1: rb, depth, strip, s0: sp, s1: sp + ds, lat });
          sp += ds;
          p = q;
          dd = turn(dd, curl / 3, (nd[3] - 0.5) * 0.25);
        }
        if (depth >= TREE_DEPTH) return p;
        const spread = 0.35 + 0.5 * nd[4];
        const lenK = 0.55 + 0.25 * nd[5];
        const childR = rEnd * 0.92;
        const tips: V[] = [];
        for (const [ci, sign] of [[2 * node + 1, 1], [2 * node + 2, -1]] as const) {
          const childLat = clip(lat + sign * 0.18, -1, 1);
          const tip = grow(ci, depth + 1, p, turn(dd, sign * spread, (nd[6] - 0.5) * 0.3), len * lenK, childR, sp, childLat);
          if (tip) tips.push(tip);
        }
        if (tips.length === 2 && depth >= 1) rightMem.push({ design: d, p: [p, tips[0], tips[1]], strip, s: sp, lat });
        return p;
      };
      const startDir = turn(outward, (draws[1] - 0.5) * 0.8 - 0.25, -0.15);
      const tip = grow(0, 1, root, startDir, reach, spineR * 0.8, 0, 0);
      roots.push(root);
      firstTips.push(tip ?? root);
      rootStrips.push(strip);
    }
    // Webbing between neighbouring roots: membranes along the arch (bat-wing / rib membranes).
    for (let k = 0; k + 1 < roots.length; k++) {
      rightMem.push({ design: d, p: [roots[k], firstTips[k], roots[k + 1]], strip: rootStrips[k], s: 0.2, lat: -0.5 });
      rightMem.push({ design: d, p: [firstTips[k], firstTips[k + 1], roots[k + 1]], strip: rootStrips[k + 1], s: 0.3, lat: 0.5 });
    }
    for (const xf of symmetryCopies(L, d)) {
      for (const s of right) segments.push({ ...s, a: xf(s.a), b: xf(s.b) });
      for (const m of rightMem) membranes.push({ ...m, p: [xf(m.p[0]), xf(m.p[1]), xf(m.p[2])] });
    }
  }
  const ad = await drawsFrom(stream, 'growth/arches', MAX_ARCHES * 2);
  const fl = await drawsFrom(stream, 'growth/flips', MAX_ARCHES);
  const arches: ArchInstance[] = [];
  let z = 1.9;
  // How the instances repeat into depth, per form: spirals twist as they recede, radial ribs and
  // asymmetric structures turn freely, hanging tendrils sometimes grow from the floor instead.
  const step = form === 'spiral' ? 1.22 : 1.3;
  const rollRange = L.symmetry === 'none' ? 2 * Math.PI : form === 'radial' ? 0.6 : 0.25;
  const flipP = form === 'hanging' ? 0.25 : form === 'radial' ? 0.5 : 0.3;
  for (let k = 0; k < MAX_ARCHES; k++) {
    const roll = (ad[k * 2] - 0.5) * rollRange + (form === 'spiral' ? 0.7 * k : 0);
    arches.push({ design: k % DESIGNS, z, scale: Math.pow(z / 1.9, 0.25), roll, flip: k > 0 && fl[k] < flipP });
    z *= step + 0.2 * ad[k * 2 + 1];
  }
  return { version: 'growth-v5', form, strips, segments, membranes, arches };
}

/** Render target shared by the 3D layers: linear colour, coverage and camera depth. */
export interface Layer {
  W: number;
  H: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Float32Array;
  depth: Float32Array;
  /** 1 where a membrane is visible (diagnostics/tests). */
  membrane: Uint8Array;
}

export function newLayer(W: number, H: number): Layer {
  return {
    W,
    H,
    r: new Float32Array(W * H),
    g: new Float32Array(W * H),
    b: new Float32Array(W * H),
    a: new Float32Array(W * H),
    depth: new Float32Array(W * H).fill(Infinity),
    membrane: new Uint8Array(W * H),
  };
}

function toWorld(p: V, arch: ArchInstance): V {
  const c = Math.cos(arch.roll);
  const s = Math.sin(arch.roll);
  const x = p[0] * arch.scale;
  const y = (arch.flip ? -p[1] : p[1]) * arch.scale;
  return [c * x - s * y, s * x + c * y, arch.z + p[2] * arch.scale];
}

/** Per-pixel colour map (linear), e.g. the photo's light behind the structures. */
export interface PixelMap {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

export interface GrowthLook {
  /** Number of arches to draw (depth slider). */
  arches: number;
  /** Membrane opacity (organic slider). */
  membrane: number;
  brightness: number;
  /** Back light: the photo's light behind each pixel (Phase 5); null = no back light. */
  rimMap: PixelMap | null;
  rim: number;
  /** Otherworldly recolouring per strip (Phase 7); null/missing = the photo's colours. */
  stripTint?: (((c: number[]) => void) | null)[];
}

/** Photo colour at a position on a strip: along it by s, across it by `across` (lanes in [-1, 1]). */
function stripUv(st: Strip, s: number, across: number): [number, number] {
  const a = (s - 0.5) * st.len;
  const c = across * st.width;
  return [st.u + st.du * a - st.dv * c, st.v + st.dv * a + st.du * c];
}

/**
 * Draws a tapered capsule (tube with round ends) into the z-buffer: every pixel finds the nearest
 * point on the projected axis, so the surface is continuous (no bead stripes, Phase 4). The surface
 * is the photo strip wrapped around the tube (Phase 5): along the tube = along the strip, around the
 * tube = across it; light only changes the brightness of those photo pixels.
 */
function drawCapsule(
  layer: Layer,
  cam: Camera,
  A: V,
  B: V,
  ra: number,
  rb: number,
  skin: { strip: Strip; s0: number; s1: number; lat: number; sample: (u: number, v: number, out: number[]) => void },
  look: GrowthLook,
): void {
  const col = [0, 0, 0];
  if (A[2] < NEAR || B[2] < NEAR) return;
  if (A[2] < NEAR || B[2] < NEAR) return;
  const { W, H } = layer;
  const pa = project(cam, A[0], A[1], A[2], W, H);
  const pb = project(cam, B[0], B[1], B[2], W, H);
  const pra = Math.max(0.6, ra * pa.scale);
  const prb = Math.max(0.6, rb * pb.scale);
  const ex = pb.sx - pa.sx;
  const ey = pb.sy - pa.sy;
  const len2 = ex * ex + ey * ey;
  const pr = Math.max(pra, prb);
  const x0 = Math.max(0, Math.floor(Math.min(pa.sx, pb.sx) - pr));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(pa.sx, pb.sx) + pr));
  const y0 = Math.max(0, Math.floor(Math.min(pa.sy, pb.sy) - pr));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(pa.sy, pb.sy) + pr));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - pa.sx;
      const py = y + 0.5 - pa.sy;
      const t = len2 > 1e-12 ? clip((px * ex + py * ey) / len2, 0, 1) : 0;
      const rp = pra + (prb - pra) * t;
      const dx = (px - ex * t) / rp;
      const dy = (py - ey * t) / rp;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const rw = ra + (rb - ra) * t;
      const depth = A[2] + (B[2] - A[2]) * t - nz * rw;
      const i = y * W + x;
      if (depth >= layer.depth[i]) continue;
      layer.depth[i] = depth;
      // Position on the photo strip: along the tube and around it (signed offset across the axis).
      const len = Math.sqrt(len2);
      const across = len > 1e-6 ? (ex * (py - ey * t) - ey * (px - ex * t)) / (len * rp) : dx;
      const [su, sv] = stripUv(skin.strip, skin.s0 + (skin.s1 - skin.s0) * t, 0.5 * across + 0.5 * skin.lat);
      skin.sample(su, sv, col);
      // Thin branches let more light through; key light from above; back light (rim) from the photo's light.
      const thin = clip(1 - rw / 0.05, 0, 1);
      const key = clip(0.55 * -dy + 0.45 * nz, 0, 1);
      const rim = Math.pow(1 - nz, 3.5) * look.rim * 1.3 + 0.2 * thin * look.rim;
      const shade = (0.3 + 0.9 * key * key) * look.brightness;
      const m = look.rimMap;
      layer.r[i] = col[0] * shade + (m ? m.r[i] * rim : 0);
      layer.g[i] = col[1] * shade + (m ? m.g[i] * rim : 0);
      layer.b[i] = col[2] * shade + (m ? m.b[i] * rim : 0);
      layer.a[i] = 1;
    }
  }
}

/** Tubes as photo-skinned capsules in a z-buffer, knuckles on the spine joints, then translucent photo membranes. */
export function renderGrowth(p: GrowthParams, img: RgbImage, cam: Camera, layer: Layer, look: GrowthLook): void {
  const { W, H } = layer;
  const base = photoSampler(img);
  // One sampler per strip, recoloured when the world's colour rules reach that strip.
  const samplers = p.strips.map((_, k) => {
    const tint = look.stripTint?.[k] ?? null;
    return tint ? (u: number, v: number, out: number[]) => (base(u, v, out), tint(out)) : base;
  });
  const arches = p.arches.slice(0, look.arches);
  for (const arch of arches) {
    for (const s of p.segments) {
      if (s.design !== arch.design) continue;
      const A = toWorld(s.a, arch);
      const B = toWorld(s.b, arch);
      const skin = { strip: p.strips[s.strip], s0: s.s0, s1: s.s1, lat: s.lat, sample: samplers[s.strip] };
      drawCapsule(layer, cam, A, B, s.r0 * arch.scale, s.r1 * arch.scale, skin, look);
      // Vertebra-like knuckle at each spine joint.
      if (s.depth === 0) drawCapsule(layer, cam, A, A, s.r0 * arch.scale * 1.12, s.r0 * arch.scale * 1.12, { ...skin, s1: s.s0 }, look);
    }
  }
  if (look.membrane <= 0) return;
  const col = [0, 0, 0];
  for (const arch of arches) {
    for (const m of p.membranes) {
      if (m.design !== arch.design) continue;
      const P = m.p.map((q) => toWorld(q, arch));
      if (P.some((q) => q[2] < NEAR)) continue;
      const S = P.map((q) => project(cam, q[0], q[1], q[2], W, H));
      const st = p.strips[m.strip];
      fillTriangle(layer, S[0].sx, S[0].sy, P[0][2], S[1].sx, S[1].sy, P[1][2], S[2].sx, S[2].sy, P[2][2], (i, z, w0, w1) => {
        if (z >= layer.depth[i]) return;
        // A piece of the photo stretched over the membrane (around its strip position), translucent and lit from behind.
        const [u, v] = stripUv(st, m.s + 0.6 * (w1 - 0.33), 3 * (w0 - w1) + m.lat);
        samplers[m.strip](u, v, col);
        const a = look.membrane * (0.3 + 0.45 * w0);
        const back = look.rimMap ? 0.5 * look.rim : 0;
        const k = 1.4;
        layer.r[i] = layer.r[i] * (1 - a) + (col[0] * k + (look.rimMap ? look.rimMap.r[i] * back : 0)) * a;
        layer.g[i] = layer.g[i] * (1 - a) + (col[1] * k + (look.rimMap ? look.rimMap.g[i] * back : 0)) * a;
        layer.b[i] = layer.b[i] * (1 - a) + (col[2] * k + (look.rimMap ? look.rimMap.b[i] * back : 0)) * a;
        layer.a[i] = Math.max(layer.a[i], a);
        if (a > 0.1) layer.membrane[i] = 1;
        if (layer.depth[i] === Infinity) layer.depth[i] = z;
      });
    }
  }
}

/** Barycentric triangle fill; calls fn(index, interpolated z, weights of the first and second vertex). */
export function fillTriangle(
  layer: { W: number; H: number },
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  fn: (i: number, z: number, w0: number, w1: number) => void,
): void {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(layer.W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(layer.H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(den) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den;
      const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      fn(y * layer.W + x, w0 * z0 + w1 * z1 + w2 * z2, w0, w1);
    }
  }
}
