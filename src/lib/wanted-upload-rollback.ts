export function rollbackRemovalCandidates(input: {
  uploaded: string[];
  registered: Set<string>;
  confirmedClaimed: Set<string>;
  definitelyMissing: Set<string>;
  lookupFailed: Set<string>;
}): string[] {
  return input.uploaded.filter((path) => {
    if (input.lookupFailed.has(path)) return false;
    if (input.registered.has(path)) return input.confirmedClaimed.has(path);
    return input.definitelyMissing.has(path);
  });
}
