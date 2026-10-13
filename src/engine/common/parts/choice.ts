/**
 * Judging what the AI found (004 FR-401). The AI says where things are; these rules (math, testable without
 * the AI) decide which of its answers the worlds use.
 */

/** A person: a region of 3 % of the photo or more, or 0.5 % or more with a face (a small "person" alone is noise). */
export function isPerson(share: number, faces: number): boolean {
  return share >= 0.03 || (share >= 0.005 && faces > 0);
}

/** Share of a confidence mask above one half. */
export function maskShare(m: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] >= 0.5) n++;
  return n / Math.max(1, m.length);
}

/** Of the object cut-outs (one per hint), the largest up to half the photo; if all are larger, the smallest. */
export function chooseObject(masks: ArrayLike<number>[]): number {
  const shares = masks.map(maskShare);
  let best = -1;
  for (let k = 0; k < shares.length; k++) if (shares[k] <= 0.5 && (best < 0 || shares[k] > shares[best])) best = k;
  if (best >= 0) return best;
  return shares.reduce((b, s, k) => (s < shares[b] ? k : b), 0);
}

/**
 * Of the candidates (0/1 masks on one grid), the one that overlaps the aim most (IoU); -1 when even the best
 * overlaps less than 0.2 (004 FR-411: recognition steadies the estimate, it does not replace it with something else).
 */
export function chooseByOverlap(aim: ArrayLike<number>, candidates: ArrayLike<number>[]): number {
  let best = -1;
  let bestIou = 0.2;
  candidates.forEach((c, k) => {
    let both = 0;
    let any = 0;
    for (let i = 0; i < aim.length; i++) {
      const a = aim[i] > 0;
      const b = c[i] > 0;
      if (a && b) both++;
      if (a || b) any++;
    }
    const iou = any ? both / any : 0;
    if (iou >= bestIou && (best < 0 || iou > bestIou)) {
      best = k;
      bestIou = iou;
    }
  });
  return best;
}

/**
 * Of the candidates (0/1 masks on one grid), the one a rough loop was drawn around (005 FR-504): the largest that
 * lies at least 70 % inside the loop; else the one that overlaps the loop most if its IoU is 0.5 or more; else -1.
 * (A rough loop is larger than its target, so the largest overlap alone would pick the whole person.)
 */
export function chooseCircled(loop: ArrayLike<number>, candidates: ArrayLike<number>[]): number {
  let inside = -1;
  let insideArea = 0;
  let overlap = -1;
  let overlapIou = 0.5;
  candidates.forEach((c, k) => {
    let both = 0;
    let size = 0;
    let any = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i] > 0;
      const b = c[i] > 0;
      if (b) size++;
      if (a && b) both++;
      if (a || b) any++;
    }
    if (size > 0 && both / size >= 0.7 && both > insideArea) {
      inside = k;
      insideArea = both;
    }
    const iou = any ? both / any : 0;
    if (iou >= overlapIou && (overlap < 0 || iou > overlapIou)) {
      overlap = k;
      overlapIou = iou;
    }
  });
  return inside >= 0 ? inside : overlap;
}

/** Where to ask the AI for the object: the estimated subject's centre, then the centres of its box's four quarters. */
export function hintPoints(o: { crop: [number, number, number]; box: [number, number, number, number] }): [number, number][] {
  const [u0, v0, u1, v1] = o.box;
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;
  return [
    [o.crop[0], o.crop[1]],
    [(u0 + um) / 2, (v0 + vm) / 2],
    [(um + u1) / 2, (v0 + vm) / 2],
    [(u0 + um) / 2, (vm + v1) / 2],
    [(um + u1) / 2, (vm + v1) / 2],
  ];
}
