export function isAuthenticationRequired(
  authRequired: boolean,
  hasToken: boolean,
  connectionError: string | null,
  activityError: string | null,
): boolean {
  const authError = [connectionError, activityError].some((error) =>
    error?.startsWith("Guest access is required") === true ||
    error?.startsWith("This backend requires an API token.") === true,
  );
  return authRequired && (
    !hasToken ||
    authError
  );
}
