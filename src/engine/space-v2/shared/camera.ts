/** Pinhole camera at the origin looking along +Z; screen y points down. */
export interface Camera {
  /** Vertical field of view in radians. */
  fov: number;
  /** Rotation around the optical axis (mixes up and down). */
  roll: number;
  /** Principal-point shift in half-heights (moves the vanishing point off-centre). */
  shift?: [number, number];
}

export interface Projected {
  sx: number;
  sy: number;
  /** Pixels per world unit at this depth. */
  scale: number;
  z: number;
}

export const NEAR = 0.05;

export function focalPx(cam: Camera, H: number): number {
  return H / 2 / Math.tan(cam.fov / 2);
}

export function project(cam: Camera, x: number, y: number, z: number, W: number, H: number): Projected {
  const c = Math.cos(cam.roll);
  const s = Math.sin(cam.roll);
  const xr = c * x - s * y;
  const yr = s * x + c * y;
  const f = focalPx(cam, H);
  const zz = Math.max(z, NEAR);
  const ox = W / 2 + (cam.shift ? (cam.shift[0] * H) / 2 : 0);
  const oy = H / 2 + (cam.shift ? (cam.shift[1] * H) / 2 : 0);
  return { sx: ox + (f * xr) / zz, sy: oy + (f * yr) / zz, scale: f / zz, z };
}

