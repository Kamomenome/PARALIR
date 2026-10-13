// Records the pixels of the 7 worlds (tests/helpers/worlds.ts) into tests/fixtures/world-hashes.json (008 FR-801).
// Run it only after raising the version of every world whose picture you meant to change.
// Usage: npx tsx tools/world-hashes.ts
import { writeFileSync } from 'node:fs';
import { WORLD_PIN, currentVersions, drawWorldCells } from '../tests/helpers/worlds';

const cells = await drawWorldCells();
writeFileSync('tests/fixtures/world-hashes.json', JSON.stringify({ ...WORLD_PIN, versions: currentVersions(), cells }, null, 2) + '\n');
console.log(`${cells.length} cells`);
