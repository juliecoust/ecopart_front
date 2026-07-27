/**
 * Parse a comma-separated list of positive integer user ids from a URL query
 * param value (e.g. the `?owner=1,2,3` / `?users=1,2,3` filters the admin USERS
 * tab passes to the TASKS / PROJECTS tabs). Non-numeric or non-positive entries
 * are dropped, and duplicates are removed.
 */
export function parseUserIdsParam(raw: string | null): number[] {
    if (!raw) return [];
    const ids = raw
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    return Array.from(new Set(ids));
}
