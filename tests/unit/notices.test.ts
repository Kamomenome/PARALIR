import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runtimePackages } from '../../tools/notices';

describe('third-party notices (009 FR-911, FR-912, SC-904)', () => {
  const notices = existsSync('THIRD_PARTY_NOTICES.md') ? readFileSync('THIRD_PARTY_NOTICES.md', 'utf8') : '';

  it('the app is MIT', () => {
    expect(readFileSync('LICENSE', 'utf8')).toMatch(/^MIT License/);
  });

  it('every package shipped in the app is listed with its version and license text', () => {
    const pkgs = runtimePackages();
    expect(pkgs.map((p) => p.name).sort()).toEqual(['@mediapipe/tasks-vision', 'temporal-polyfill', 'temporal-spec', 'temporal-utils']);
    for (const p of pkgs) expect(notices, p.name).toContain(`${p.name} ${p.version}`);
    expect(notices).toContain('Apache License');
    expect(notices).toContain('Version 2.0, January 2004');
    expect(notices).toContain('Permission is hereby granted, free of charge');
  });

  it('the AI models, their source, their cards and their out-of-scope uses are named', () => {
    for (const m of ['selfie_multiclass_256x256.tflite', 'face_landmarker.task', 'magic_touch.tflite']) expect(notices).toContain(m);
    expect(notices).toContain('storage.googleapis.com/mediapipe-assets');
    expect(notices).toContain('監視');
    expect(notices).toContain('Eigen');
  });

  it('is up to date with the tool', async () => {
    const { renderNotices } = await import('../../tools/notices');
    expect(notices).toBe(renderNotices());
  });
});
