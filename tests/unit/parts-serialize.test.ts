import { describe, expect, it } from 'vitest';
import { partsFromJson, partsToJson } from '../../src/engine/common/parts/serialize';
import { figureParts, objectParts } from '../helpers/parts';

describe('parts as JSON for the tools (004 T409)', () => {
  it('round-trips exactly', async () => {
    for (const p of [await figureParts(), await objectParts([0.1, 0.2, 0.5, 0.6])]) {
      const back = partsFromJson(JSON.parse(JSON.stringify(partsToJson(p))));
      expect(back).toEqual(p);
    }
  });
});
