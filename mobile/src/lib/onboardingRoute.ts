const ONBOARDING_ROUTES = new Set(['/(onboarding)', '/terms', '/privacy']);

export function routeAllowedDuringOnboarding(path: string): boolean {
  return ONBOARDING_ROUTES.has(path);
}
