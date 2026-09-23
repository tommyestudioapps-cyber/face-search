export function parseCheckpoint(
  stored: string | null,
  version: string,
): { cursor: string; generation: number } | undefined {
  if (!stored) return undefined;
  try {
    const checkpoint: unknown = JSON.parse(stored);
    if (
      typeof checkpoint === 'object' &&
      checkpoint !== null &&
      'version' in checkpoint &&
      'cursor' in checkpoint &&
      'generation' in checkpoint &&
      checkpoint.version === version &&
      typeof checkpoint.cursor === 'string' &&
      checkpoint.cursor.length > 0 &&
      typeof checkpoint.generation === 'number' &&
      Number.isSafeInteger(checkpoint.generation) &&
      checkpoint.generation > 0
    ) {
      return { cursor: checkpoint.cursor, generation: checkpoint.generation };
    }
  } catch {
    // Invalid checkpoint: safely restart from the first photo.
  }
  return undefined;
}