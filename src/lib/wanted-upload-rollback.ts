export function rollbackRemovalCandidates(input: {
  uploaded: string[];
  registrationAttempted: Set<string>;
  confirmedClaimed: Set<string>;
}): string[] {
  return input.uploaded.filter((path) => !input.registrationAttempted.has(path) || input.confirmedClaimed.has(path));
}
