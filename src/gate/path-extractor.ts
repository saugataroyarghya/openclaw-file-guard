import { resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";

/**
 * Extract candidate file paths from a tool call's params.
 * Different tools use different field names — this normalizes them.
 */
export function extractPaths(toolName: string, params: any): string[] {
  if (!params || typeof params !== "object") return [];

  const paths: string[] = [];

  switch (toolName) {
    case "write":
    case "edit": {
      // Both use { path } or { file_path }
      if (typeof params.path === "string") paths.push(params.path);
      if (typeof params.file_path === "string") paths.push(params.file_path);
      break;
    }
    case "apply_patch": {
      // params.patch is a unified diff — extract target paths from headers
      if (typeof params.patch === "string") {
        for (const m of params.patch.matchAll(/^\+\+\+ (?:b\/)?(.+)$/gm)) {
          paths.push(m[1]);
        }
        for (const m of params.patch.matchAll(/^--- (?:a\/)?(.+)$/gm)) {
          paths.push(m[1]);
        }
        // Pattern used by some patch formats: *** Update File: <path>
        for (const m of params.patch.matchAll(/^\*\*\* Update File: (.+)$/gm)) {
          paths.push(m[1]);
        }
        for (const m of params.patch.matchAll(/^\*\*\* Add File: (.+)$/gm)) {
          paths.push(m[1]);
        }
        for (const m of params.patch.matchAll(/^\*\*\* Delete File: (.+)$/gm)) {
          paths.push(m[1]);
        }
      }
      // Some implementations also pass an explicit target
      if (typeof params.path === "string") paths.push(params.path);
      if (typeof params.file_path === "string") paths.push(params.file_path);
      break;
    }
    case "exec":
    case "process": {
      // Best-effort: scan command string for absolute or home-prefixed paths
      const cmd =
        typeof params.command === "string"
          ? params.command
          : typeof params.cmd === "string"
            ? params.cmd
            : "";
      if (cmd) {
        // Match anything that looks like /absolute/path or ~/relative/path
        // This is fuzzy by design — we err on the side of catching more.
        for (const m of cmd.matchAll(/(?:^|\s|=|"|')((?:~|\/)[^\s"';|&<>$()`]+)/g)) {
          paths.push(m[1]);
        }
      }
      break;
    }
    default:
      break;
  }

  return paths.map(normalizePath).filter((p): p is string => Boolean(p));
}

/**
 * Normalize a path: expand ~, resolve to absolute, lowercase on Windows.
 */
export function normalizePath(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  let p = input.trim();
  if (!p) return null;

  // Strip surrounding quotes if any leaked in from extraction
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1);
  }

  // Expand ~ to homedir
  if (p === "~") {
    p = homedir();
  } else if (p.startsWith("~/") || p.startsWith("~\\")) {
    p = homedir() + p.slice(1);
  }

  if (!isAbsolute(p)) {
    p = resolve(p);
  } else {
    p = resolve(p);
  }

  // Case-insensitive on Windows
  if (process.platform === "win32") {
    p = p.toLowerCase();
  }

  return p;
}
