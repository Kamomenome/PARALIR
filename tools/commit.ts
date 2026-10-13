import { execSync } from 'node:child_process';

/** The commit the app is built from, with -dirty when tracked files differ from it (008 FR-802). */
export function gitCommit(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() !== '';
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}
