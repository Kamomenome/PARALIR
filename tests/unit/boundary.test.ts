import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('the engine is the calculation only (009 FR-903, SC-901)', () => {
  const sources = files('src/engine');

  it('exists and holds the calculation', () => {
    expect(sources.length).toBeGreaterThan(40);
  });

  it('never imports the app, the screen, the worker or the AI', () => {
    const bad = sources.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)]
        .map((m) => m[1])
        .filter((spec) => /(^|\/)(app|ui|worker|ai)(\/|$)/.test(spec) || spec.startsWith('@mediapipe'))
        .map((spec) => `${f}: ${spec}`),
    );
    expect(bad).toEqual([]);
  });

  it('never touches the page (DOM)', () => {
    const bad = sources.filter((f) => /\b(document|window|navigator|localStorage)\s*[.[]/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
