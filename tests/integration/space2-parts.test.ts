import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/engine/common/analysis/features';
import { classAt, eyeBoxes, faceBox, PART, partAt } from '../../src/engine/common/parts/types';
import { echoLayout } from '../../src/engine/space-v2/worlds/echo/echo';
import { cleanPlate, frameOf, framePhoto, regionMask } from '../../src/engine/space-v2/shared/inplace';
import { cropMask, mainObject, mosaicObject } from '../../src/engine/space-v2/shared/object';
import { renderMosaic } from '../../src/engine/space-v2/worlds/mosaic/mosaic';
import { renderWorld } from '../../src/engine/space-v2/world';
import { figureParts, objectParts } from '../helpers/parts';
import { spaceWorld } from '../helpers/space';
import { figurePhoto } from '../helpers/space2';

const W = 320;
const H = 240;
const iou = (a: Float32Array, b: (k: number) => number) => {
  let both = 0;
  let any = 0;
  for (let k = 0; k < a.length; k++) {
    const x = a[k] > 0.5;
    const y = b(k) > 0.5;
    if (x && y) both++;
    if (x || y) any++;
  }
  return both / any;
};
const inBox = (b: number[], u: number, v: number) => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3];

describe('the subject and its materials from the AI parts (004 SC-401..403)', () => {
  it('the subject is the person, else the cut-out object, else the old estimate', async () => {
    const img = figurePhoto(320, 240);
    const features = analyze(img);
    const f = frameOf(img, W, H);
    const at = (m: Uint8Array, p: { w: number; h: number }) => (k: number) => partAt(m, p, f.u0 + ((k % W) + 0.5) * f.du, f.v0 + (Math.floor(k / W) + 0.5) * f.dv);
    const parts = await figureParts();
    expect(iou(regionMask(mainObject(img, features, parts), img, W, H), at(parts.person!, parts))).toBeGreaterThanOrEqual(0.9);
    const obj = await objectParts([0.2, 0.3, 0.55, 0.8]);
    expect(iou(regionMask(mainObject(img, features, obj), img, W, H), at(obj.object!, obj))).toBeGreaterThanOrEqual(0.9);
    expect(mainObject(img, features, null)).toEqual(mainObject(img, features));
  });

  it('a real segmenter leaves a little person everywhere: that is not the subject, and the photo without it is not black', async () => {
    const img = figurePhoto(320, 240);
    const features = analyze(img);
    const parts = await figureParts(160, 120, 0.12);
    const region = regionMask(mainObject(img, features, parts), img, W, H);
    // Beside the figure, inside its crop, the region is empty and the photo stays.
    const beside = Math.round(0.75 * H) * W + Math.round(0.32 * W);
    expect(region[beside]).toBe(0);
    const photo = framePhoto(img, W, H);
    const plate = cleanPlate(photo, region, W, H);
    expect(plate.g[beside]).toBeCloseTo(photo.g[beside], 6);
    // Even a region over the whole frame gives a photo, not black.
    const all = cleanPlate(photo, new Float32Array(W * H).fill(1), W, H);
    let mean = 0;
    let ref = 0;
    for (let i = 0; i < W * H; i++) {
      mean += all.r[i] + all.g[i] + all.b[i];
      ref += photo.r[i] + photo.g[i] + photo.b[i];
    }
    expect(mean / ref).toBeGreaterThan(0.5);
  });

  it('with a face: rows of faces and rows of eyes inside the outline', async () => {
    const img = figurePhoto(320, 240);
    const parts = await figureParts();
    const face = faceBox(parts.faces[0]);
    const eyes = eyeBoxes(parts.faces[0]);
    for (const variation of [0, 1, 2, 3]) {
      const w = await spaceWorld(img, { variation });
      const obj = mainObject(w.img, w.features, parts);
      const { copies, sprites, region } = echoLayout(w.world.echo, obj, w.img, W, H, 1, parts);
      const of = (s: string) => copies.filter((c) => sprites[c.sprite].source === s);
      expect(of('face').length, `v${variation} faces`).toBeGreaterThanOrEqual(2);
      expect(of('eye').length, `v${variation} eyes`).toBeGreaterThanOrEqual(2);
      for (const s of sprites) {
        if (s.source === 'face') expect(inBox(face, s.crop[0], s.crop[1])).toBe(true);
        if (s.source === 'eye') expect(eyes.some((e) => inBox(e, s.crop[0], s.crop[1]))).toBe(true);
      }
      for (const c of copies) expect(region[Math.round(c.cy) * W + Math.round(c.cx)], `v${variation} inside`).toBeGreaterThan(0.3);
    }
  });

  it('the rectangles: without parts the estimate (the version the user liked); with parts the candidate nearest the estimate (SC-409)', async () => {
    const img = figurePhoto(320, 240);
    const features = analyze(img);
    const aspect = img.width / img.height;
    const parts = await figureParts();
    expect(mosaicObject(img, features, null)).toEqual(mainObject(img, features));
    // An estimate on the head: the range becomes the AI's head (face skin and hair).
    const crop: [number, number, number] = [0.5, 32 / 120, 0.13];
    const head = (u: number, v: number) => ((u * 160 - 80) ** 2 + (v * 120 - 32) ** 2 < 11 ** 2 ? 1 : 0);
    const aim = { crop, mask: cropMask(crop, aspect, head), box: [69 / 160, 21 / 120, 91 / 160, 43 / 120] as [number, number, number, number], subject: true, source: 'estimate' as const };
    const region = regionMask(mosaicObject(img, features, parts, aim), img, W, H);
    const f = frameOf(img, W, H);
    const isHead = (k: number) => {
      const u = f.u0 + ((k % W) + 0.5) * f.du;
      const v = f.v0 + (Math.floor(k / W) + 0.5) * f.dv;
      const c = classAt(parts, u, v);
      return c === PART.faceSkin || c === PART.hair ? 1 : 0;
    };
    expect(iou(region, isHead)).toBeGreaterThanOrEqual(0.9);
    // Without parts the picture is the estimate's.
    const w = await spaceWorld(img, { variation: 0 });
    const a = renderWorld(w.world, w.img, w.features, w.controls, W, H, 'mosaic').rgba;
    const b = renderMosaic(w.world.mosaic, mainObject(w.img, w.features), w.img, w.controls, W, H).rgba;
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });
});
