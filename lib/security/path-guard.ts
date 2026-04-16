import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export class PathGuardError extends Error {
  constructor(
    message: string,
    public readonly input: string,
  ) {
    super(message);
    this.name = 'PathGuardError';
  }
}

/**
 * Resolves `candidate` (a file/dir path) and asserts it lives inside `root`.
 * Both paths are resolved with fs.realpath so symlinks cannot escape.
 * Throws PathGuardError on violation.
 * For non-existent candidates, tries parent dir resolution + own append.
 */
export async function assertInside(root: string, candidate: string): Promise<string> {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new PathGuardError('empty candidate path', String(candidate));
  }
  // Node fs rejects null byte in paths, but guard explicitly.
  if (candidate.includes('\0')) {
    throw new PathGuardError('null byte in path', candidate);
  }

  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(root);
  } catch (err) {
    throw new PathGuardError(`root does not exist: ${(err as Error).message}`, candidate);
  }

  // Try to realpath the full candidate; if it does not exist, fall back to
  // realpath(parent) + basename so that writes to new files are still validated.
  let resolvedCandidate: string;
  try {
    resolvedCandidate = await realpath(candidate);
  } catch {
    const absolute = resolve(candidate);
    const parent = resolve(absolute, '..');
    try {
      const resolvedParent = await realpath(parent);
      resolvedCandidate = resolve(resolvedParent, absolute.slice(parent.length + 1));
    } catch {
      throw new PathGuardError('candidate parent does not exist', candidate);
    }
  }

  if (resolvedCandidate === resolvedRoot) return resolvedCandidate;
  if (resolvedCandidate.startsWith(resolvedRoot + sep)) return resolvedCandidate;

  throw new PathGuardError(
    `path escapes root: ${resolvedCandidate} not under ${resolvedRoot}`,
    candidate,
  );
}
