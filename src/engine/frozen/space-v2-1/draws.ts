import { Seeded32 } from '../../common/prng/seeded32';
import { subStreamSeed } from '../../common/seed/seeds';

/** `count` uniforms from the fixed sub-stream `id` of `stream`. */
export async function drawsFrom(stream: Uint8Array, id: string, count: number): Promise<number[]> {
  const r = new Seeded32(await subStreamSeed(stream, id));
  return Array.from({ length: count }, () => r.next());
}

export async function generatorFor(stream: Uint8Array, id: string): Promise<Seeded32> {
  return new Seeded32(await subStreamSeed(stream, id));
}
