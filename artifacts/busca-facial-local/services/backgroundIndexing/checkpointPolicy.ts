export function parseCheckpoint(
  stored: string | null,
  version: string,
): string | undefined {
  if (!stored) return undefined;
  try {
    const checkpoint: unknown = JSON.parse(stored);
    if (
      typeof checkpoint === 'object' &&
      checkpoint !== null &&
      'version' in checkpoint &&
      'cursor' in checkpoint &&
      checkpoint.version === version &&
      typeof checkpoint.cursor === 'string' &&
      checkpoint.cursor.length > 0
    ) {
      return checkpoint.cursor;
    }
  } catch {
    // Invalid checkpoint: safely restart from the first photo.
  }
  return undefined;
}