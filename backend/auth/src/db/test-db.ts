// Guards destructive DB tests so they only run against a throwaway Postgres.

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "db"];

/**
 * Why TEST_DATABASE_URL is unsafe to run destructive tests against, or null if it's fine.
 * It must be a local host (or the compose `db` service) or a database named *_test,
 * and must not share host:port with DATABASE_URL (which Bun loads from .env).
 */
export function unsafeTestDbReason(testUrl: string, mainUrl: string | undefined): string | null {
  let test: URL;
  try {
    test = new URL(testUrl);
  } catch {
    return "TEST_DATABASE_URL is not a valid URL";
  }
  const hostPort = (u: URL) => `${u.hostname.toLowerCase()}:${u.port || "5432"}`;
  const dbName = decodeURIComponent(test.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.includes(test.hostname.toLowerCase()) && !dbName.endsWith("_test")) {
    return `TEST_DATABASE_URL must point at localhost/127.0.0.1/::1/db or a database whose name ends in _test (got host ${test.hostname}, database ${dbName || "(none)"})`;
  }
  if (mainUrl) {
    let main: URL | null = null;
    try {
      main = new URL(mainUrl);
    } catch {
      // An unparseable DATABASE_URL can't match.
    }
    if (main && hostPort(main) === hostPort(test)) {
      return `TEST_DATABASE_URL has the same host:port as DATABASE_URL (${hostPort(test)}); refusing to run against the app database`;
    }
  }
  return null;
}
