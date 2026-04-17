import { aliasesFromMeta, isValidAlias, readMeta, setProjectMeta } from '@/lib/projects/meta';

export interface AliasMap {
  [slug: string]: string;
}

export { isValidAlias };

/** Legacy API — kept for callers that only need the slug→alias map. */
export async function readAliases(): Promise<AliasMap> {
  const meta = await readMeta();
  return aliasesFromMeta(meta);
}

/**
 * Legacy API — sets or clears an alias. Forwards to the meta store so
 * favorite flags on the same slug are preserved.
 */
export async function setAlias(slug: string, alias: string | null): Promise<AliasMap> {
  const meta = await setProjectMeta(slug, { alias });
  return aliasesFromMeta(meta);
}
