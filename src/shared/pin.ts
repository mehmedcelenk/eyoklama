/**
 * Memorable Teacher PIN Generator
 * Vibecoding-Safe Native DOM Architecture
 * Produces symmetric, memorable 6-digit numeric PINs
 */

/**
 * Generates an easy-to-remember 6-digit PIN using geometric keypad patterns:
 * - Glides (e.g. 123321 or 123123)
 * - Repeating pairs (e.g. 121212)
 * - Symmetrical steps (e.g. 135531)
 * - Ladders (e.g. 112233)
 *
 * @returns 6-digit numeric string
 */
export function generateMemorablePin(): string {
  const glides = [
    [1, 2, 3], [3, 2, 1], [4, 5, 6], [6, 5, 4], [7, 8, 9], [9, 8, 7],
    [1, 4, 7], [7, 4, 1], [2, 5, 8], [8, 5, 2], [3, 6, 9], [9, 6, 3],
    [1, 5, 9], [9, 5, 1], [3, 5, 7], [7, 5, 3]
  ];

  const steps = [
    [1, 3, 5], [5, 3, 1], [2, 4, 6], [6, 4, 2], [3, 5, 7], [7, 5, 3],
    [4, 6, 8], [8, 6, 4], [5, 7, 9], [9, 7, 5]
  ];

  const pairs = [
    [1, 2], [2, 1], [2, 3], [3, 2], [4, 5], [5, 4], [5, 6], [6, 5], [7, 8], [8, 7], [8, 9], [9, 8],
    [1, 4], [4, 1], [2, 5], [5, 2], [3, 6], [6, 3], [4, 7], [7, 4], [5, 8], [8, 5], [6, 9], [9, 6],
    [1, 5], [5, 1], [3, 5], [5, 3], [7, 5], [5, 7], [9, 5], [5, 9],
    [2, 8], [8, 2], [4, 6], [6, 4]
  ];

  const ladders = [
    [1, 2, 3], [3, 2, 1], [4, 5, 6], [6, 5, 4], [7, 8, 9], [9, 8, 7],
    [1, 4, 7], [7, 4, 1], [2, 5, 8], [8, 5, 2], [3, 6, 9], [9, 6, 3],
    [2, 4, 6], [6, 4, 2], [1, 3, 5], [5, 3, 1]
  ];

  const roll = Math.random();

  if (roll < 0.30) {
    const idx = Math.floor(Math.random() * glides.length);
    const g = glides[idx]!;
    return `${g[0]}${g[1]}${g[2]}${g[2]}${g[1]}${g[0]}`;
  } else if (roll < 0.55) {
    const idx = Math.floor(Math.random() * glides.length);
    const g = glides[idx]!;
    return `${g[0]}${g[1]}${g[2]}${g[0]}${g[1]}${g[2]}`;
  } else if (roll < 0.80) {
    const idx = Math.floor(Math.random() * pairs.length);
    const p = pairs[idx]!;
    return `${p[0]}${p[1]}${p[0]}${p[1]}${p[0]}${p[1]}`;
  } else if (roll < 0.92) {
    const idx = Math.floor(Math.random() * steps.length);
    const s = steps[idx]!;
    return `${s[0]}${s[1]}${s[2]}${s[2]}${s[1]}${s[0]}`;
  } else {
    const idx = Math.floor(Math.random() * ladders.length);
    const l = ladders[idx]!;
    return `${l[0]}${l[0]}${l[1]}${l[1]}${l[2]}${l[2]}`;
  }
}
