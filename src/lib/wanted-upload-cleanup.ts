export function validateWantedCleanupPaths(
  paths: string[],
  userId: string,
  referenced: Set<string>,
  lookupError: unknown | null,
): string[] | null {
  if (lookupError || paths.length < 1 || paths.length > 6) return null;
  const unique = [...new Set(paths)];
  if (unique.length !== paths.length || unique.some((path) => !path.startsWith(`${userId}/`) || referenced.has(path))) return null;
  return unique;
}
