"""Independent Python implementation of seeded32-v1 (docs/REPRODUCIBILITY.md §4) for test vectors.
Usage: python tools/py/prng_vectors.py tests/fixtures/prng-vectors.json
"""
import hashlib
import json
import struct
import sys

M = 0xFFFFFFFF


def rotl(x, k):
    return ((x << k) | (x >> (32 - k))) & M


class Seeded32:
    def __init__(self, seed: bytes):
        self.s = list(struct.unpack('>4I', seed[:16]))
        if self.s == [0, 0, 0, 0]:
            self.s[3] = 1

    def next_u32(self):
        s0, s1, s2, s3 = self.s
        result = (rotl((s1 * 5) & M, 7) * 9) & M
        t = (s1 << 9) & M
        s2 ^= s0
        s3 ^= s1
        s1 ^= s2
        s0 ^= s3
        s2 ^= t
        s3 = rotl(s3, 11)
        self.s = [s0, s1, s2, s3]
        return result


def main(out):
    seeds = {
        'zeros': bytes(32),
        'ones': b'\xff' * 32,
        'sha256-test': hashlib.sha256(b'test').digest(),
    }
    vectors = []
    for name, seed in seeds.items():
        r = Seeded32(seed)
        u32 = [r.next_u32() for _ in range(16)]
        vectors.append({'name': name, 'seedHex': seed.hex(), 'u32': u32, 'u': [v / 4294967296 for v in u32]})
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'prngVersion': 'seeded32-v1', 'source': 'tools/py/prng_vectors.py', 'vectors': vectors}, f, indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
