import { minimatch } from "minimatch";
import { normalizePath } from "./path-extractor.js";

/**
 * Check if a path matches a stored pattern. Patterns may be:
 * - exact normalized paths (e.g. /Users/x/.openclaw/AGENTS.md)
 * - glob patterns (e.g. /Users/x/.openclaw/skills/**)
 */
export function matchesPattern(pathToCheck: string, pattern: string): boolean {
  const normalized = normalizePath(pattern);
  if (!normalized) return false;

  // Exact match (after normalization)
  if (normalized === pathToCheck) return true;

  // Glob match — minimatch handles **
  if (pattern.includes("*") || pattern.includes("?") || pattern.includes("[")) {
    return minimatch(pathToCheck, normalized, {
      nocase: process.platform === "win32",
      dot: true,
    });
  }

  return false;
}

/**
 * Check if a path is within the watchedPaths scope.
 * If watchedPaths is empty/undefined, ALL paths are watched.
 */
export function isWatched(
  pathToCheck: string,
  watchedPaths: string[] | undefined,
): boolean {
  if (!watchedPaths || watchedPaths.length === 0) return true;
  for (const p of watchedPaths) {
    if (matchesPattern(pathToCheck, p)) return true;
  }
  return false;
}

/**
 * Find the first protected pattern that matches the given path.
 * Patterns are stored normalized in the DB.
 */
export function findMatchingProtection<T extends { file_path: string }>(
  pathToCheck: string,
  protections: T[],
): T | null {
  for (const protection of protections) {
    if (matchesPattern(pathToCheck, protection.file_path)) {
      return protection;
    }
  }
  return null;
}
