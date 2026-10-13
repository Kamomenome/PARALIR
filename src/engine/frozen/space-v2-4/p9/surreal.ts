import { clip, smoothstep } from '../../../common/math';
import { linearToSrgb, srgbToLinear } from './hdr';
import type { SmallImage } from './photo';
import { drawsFrom } from './seeds';

/**
 * Otherworldly colour (Phase 7, since Phase 8 part of the "otherworld" merge): parts of the world are
 * recoloured by the "colour rules of another dimension" — hue rotation, channel swaps, complementary
 * colours, negatives. They act on the photo's own pixels (colour transforms of the photo are allowed,
 * Phase 5), so shapes, textures and light and shade still come from the photo. The seed draws 3 rules
 * per world, which elements follow which rule, and how otherworldly the world is.
 */

export type ColorOp =
  | { kind: 'hue'; angle: number }
  | { kind: 'swap'; perm: [number, number, number] }
  | { kind: 'complement' }
  | { kind: 'negative' };

/** One recolourable element: it turns once the world's threshold passes `u`, following rule `rule`. */
export interface ShiftSlot {
  u: number;
  rule: number;
}

export interface SurrealColors {
  /** How otherworldly this world is (0..1, skewed towards natural). */
  otherness: number;
  rules: ColorOp[];
  /** The photo's light (halo, fog, back light). */
  background: ShiftSlot;
  flame: ShiftSlot;
  /** Per growth strip (fixed count). */
  strips: ShiftSlot[];
  /** Per plate slot (fixed count; mirrored or rotated copies share their slot, so the symmetry keeps). */
  plates: ShiftSlot[];
}

const RULES = 3;
const RULE_WEIGHTS = [0.5, 0.3, 0.2];
const PERMS: [number, number, number][] = [
  [1, 2, 0],
  [2, 0, 1],
  [0, 2, 1],
  [2, 1, 0],
  [1, 0, 2],
];

function pickOp(d: number[]): ColorOp {
  const k = d[0];
  if (k < 0.45) return { kind: 'hue', angle: (Math.PI / 3) * (1 + 4 * d[1]) }; // 60°..300°
  if (k < 0.75) return { kind: 'swap', perm: PERMS[Math.min(PERMS.length - 1, Math.floor(d[1] * PERMS.length))] };
  if (k < 0.9) return { kind: 'complement' };
  return { kind: 'negative' };
}

function slot(u: number, r: number): ShiftSlot {
  return { u, rule: r < RULE_WEIGHTS[0] ? 0 : r < RULE_WEIGHTS[0] + RULE_WEIGHTS[1] ? 1 : 2 };
}

/** Fixed draws: always the same counts, whatever the photo or the layout. */
export async function buildSurreal(stream: Uint8Array, strips: number, plates: number): Promise<SurrealColors> {
  const w = await drawsFrom(stream, 'surreal/world', 1 + RULES * 3);
  const rules = Array.from({ length: RULES }, (_, k) => pickOp(w.slice(1 + k * 3, 4 + k * 3)));
  const e = await drawsFrom(stream, 'surreal/elements', (2 + strips + plates) * 2);
  const at = (i: number) => slot(e[i * 2], e[i * 2 + 1]);
  return {
    otherness: w[0] * w[0],
    rules,
    // The atmosphere is the most telling element: it turns earlier than single plates or strips.
    background: { ...at(0), u: 0.65 * e[0] },
    flame: { ...at(1), u: 0.65 * e[2] },
    strips: Array.from({ length: strips }, (_, i) => at(2 + i)),
    plates: Array.from({ length: plates }, (_, i) => at(2 + strips + i)),
  };
}

/** How far an element is recoloured (0..1) for the slider value `strength`. */
export function shiftAmount(s: SurrealColors, sl: ShiftSlot, strength: number): number {
  // Up to the middle the slider scales each world's own otherness (some worlds stay natural); above it,
  // it overrides that, so near 1 every world is transformed.
  const threshold = clip(strength * (0.15 + 1.7 * s.otherness) + 0.8 * Math.max(0, 2 * strength - 1) * (1 - s.otherness), 0, 1);
  return smoothstep((threshold - sl.u) / 0.12);
}

// YIQ (the same axes as the rest of the project), with an exact inverse so brightness is preserved.
const M = [
  [0.299, 0.587, 0.114],
  [0.596, -0.274, -0.322],
  [0.211, -0.523, 0.312],
];
const MI = invert3(M);

function invert3(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

function rotateHue(c: number[], angle: number): void {
  const y = M[0][0] * c[0] + M[0][1] * c[1] + M[0][2] * c[2];
  const i = M[1][0] * c[0] + M[1][1] * c[1] + M[1][2] * c[2];
  const q = M[2][0] * c[0] + M[2][1] * c[1] + M[2][2] * c[2];
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  const i2 = cs * i - sn * q;
  const q2 = sn * i + cs * q;
  for (let k = 0; k < 3; k++) c[k] = Math.max(0, MI[k][0] * y + MI[k][1] * i2 + MI[k][2] * q2);
}

/**
 * Recolours a linear RGB colour in place by `t` (0 = unchanged, 1 = fully). Rotations turn gradually
 * (a half-done complement is a quarter turn, not a grey mix); swaps and negatives cross-fade.
 */
export function applyColorOp(op: ColorOp, t: number, c: number[]): void {
  if (t <= 0) return;
  switch (op.kind) {
    case 'hue':
      rotateHue(c, op.angle * t);
      return;
    case 'complement':
      rotateHue(c, Math.PI * t);
      return;
    case 'swap': {
      const s = [c[op.perm[0]], c[op.perm[1]], c[op.perm[2]]];
      for (let k = 0; k < 3; k++) c[k] = c[k] * (1 - t) + s[k] * t;
      return;
    }
    case 'negative':
      for (let k = 0; k < 3; k++) c[k] = c[k] * (1 - t) + srgbToLinear(1 - linearToSrgb(c[k])) * t;
  }
}

/** Light sources must not be negated (a negative of the dark would flood the void with light). */
export function forLight(op: ColorOp): ColorOp {
  return op.kind === 'negative' ? { kind: 'complement' } : op;
}

/** A recolouring function for an element, or null when it keeps the photo's colours. */
export function tintFor(s: SurrealColors, sl: ShiftSlot, strength: number, light = false): ((c: number[]) => void) | null {
  const t = shiftAmount(s, sl, strength);
  if (t <= 0) return null;
  const op = light ? forLight(s.rules[sl.rule]) : s.rules[sl.rule];
  return (c) => applyColorOp(op, t, c);
}

/** A recoloured copy of a small linear image. */
export function tintSmall(m: SmallImage, tint: ((c: number[]) => void) | null): SmallImage {
  if (!tint) return m;
  const out: SmallImage = { w: m.w, h: m.h, r: new Float32Array(m.r), g: new Float32Array(m.g), b: new Float32Array(m.b) };
  const c = [0, 0, 0];
  for (let p = 0; p < m.w * m.h; p++) {
    c[0] = m.r[p];
    c[1] = m.g[p];
    c[2] = m.b[p];
    tint(c);
    out.r[p] = c[0];
    out.g[p] = c[1];
    out.b[p] = c[2];
  }
  return out;
}

/** Share of the world's otherness that reaches the structures in the otherworld merge. */
const FOREGROUND_STRENGTH = 0.5;

/**
 * The otherworld merge (Phase 8): the background lives entirely by the first colour rule (light never
 * negated); the structures keep the photo's colours, except a seeded share that follows the other rules,
 * so two colour worlds meet at the structures' edges.
 */
export function mergeTints(s: SurrealColors) {
  const bgOp = forLight(s.rules[0]);
  return {
    background: (c: number[]) => applyColorOp(bgOp, 1, c),
    foreground: (sl: ShiftSlot): ((c: number[]) => void) | null => {
      const t = shiftAmount(s, sl, FOREGROUND_STRENGTH);
      if (t <= 0) return null;
      const op = s.rules[sl.rule === 0 ? 1 : sl.rule];
      return (c: number[]) => applyColorOp(op, t, c);
    },
  };
}
