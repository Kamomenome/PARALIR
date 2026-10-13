// Dev-only: exposes the app's AI to tools/parts-extract.ts (004 T409). Nothing leaves the device here either.
import { cutsAt, makeParts } from '../src/ai/parts';
import { blockExternalRequests } from '../src/app/offline';
import { partsToJson } from '../src/engine/common/parts/serialize';

blockExternalRequests();

(window as any).__parts = async (w: number, h: number, rgbB64: string, hints: [number, number][]) => {
  const bin = atob(rgbB64);
  const data = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const t0 = performance.now();
  const parts = await makeParts({ width: w, height: h, data }, hints);
  return { json: partsToJson(parts), ms: Math.round(performance.now() - t0) };
};
(window as any).__cuts = async (w: number, h: number, rgbB64: string, hints: [number, number][]) => {
  const bin = atob(rgbB64);
  const data = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const cuts = await cutsAt({ width: w, height: h, data }, hints);
  return cuts.map((c) => btoa(String.fromCharCode(...c)));
};
(window as any).__ready = true;
