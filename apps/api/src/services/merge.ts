/**
 * Three-way merge for structured data fields.
 * base = last common version, theirs = current DB state, ours = incoming write.
 * Returns the merged result and a list of conflicting field names.
 */
export function mergeStructuredData(
  base: Record<string, unknown>,
  theirs: Record<string, unknown>,
  ours: Record<string, unknown>
): { merged: Record<string, unknown>; conflicts: string[] } {
  const merged = { ...theirs };
  const conflicts: string[] = [];
  const allKeys = new Set([
    ...Object.keys(theirs),
    ...Object.keys(ours),
  ]);

  for (const key of allKeys) {
    const baseVal = JSON.stringify(base[key]);
    const theirVal = JSON.stringify(theirs[key]);
    const ourVal = JSON.stringify(ours[key]);

    if (ourVal === theirVal) {
      // Same value — no conflict
      continue;
    }

    if (baseVal === theirVal) {
      // Server unchanged, our change wins
      merged[key] = ours[key];
    } else if (baseVal === ourVal) {
      // We didn't change, server wins
      merged[key] = theirs[key];
    } else {
      // Both changed — conflict, server wins by default
      conflicts.push(key);
      merged[key] = theirs[key];
    }
  }

  return { merged, conflicts };
}
