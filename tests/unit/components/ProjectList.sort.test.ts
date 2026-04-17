import { describe, expect, it } from 'vitest';
import { filterAndSortProjects } from '@/app/(ui)/sidebar/ProjectList';
import type { ProjectSummary } from '@/hooks/use-projects';
import type { ProjectMetaMap } from '@/hooks/use-project-meta';

function makeProject(slug: string, lastActivity: string | null, sessionCount = 1): ProjectSummary {
  return {
    slug,
    displayPath: `/home/bartek/${slug}`,
    resolvedCwd: `/home/bartek/${slug}`,
    sessionCount,
    lastActivity,
    totalBytes: 0,
  };
}

const projects: ProjectSummary[] = [
  makeProject('alpha', '2026-04-16T10:00:00.000Z'),
  makeProject('beta', '2026-04-16T12:00:00.000Z'),
  makeProject('gamma', '2026-04-16T08:00:00.000Z'),
];

describe('filterAndSortProjects', () => {
  it('sortuje po lastActivity malejąco bez ulubionych', () => {
    const meta: ProjectMetaMap = {};
    const sorted = filterAndSortProjects(projects, meta, '');
    expect(sorted.map((p) => p.slug)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('przypięte projekty trafiają na górę', () => {
    const meta: ProjectMetaMap = { gamma: { favorite: true } };
    const sorted = filterAndSortProjects(projects, meta, '');
    expect(sorted.map((p) => p.slug)).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('wiele przypięć — sortowane po lastActivity wewnątrz grupy', () => {
    const meta: ProjectMetaMap = {
      alpha: { favorite: true },
      gamma: { favorite: true },
    };
    const sorted = filterAndSortProjects(projects, meta, '');
    expect(sorted.map((p) => p.slug)).toEqual(['alpha', 'gamma', 'beta']);
  });

  it('filtr po substring zostawia piny i kolejność', () => {
    const meta: ProjectMetaMap = { gamma: { favorite: true } };
    const sorted = filterAndSortProjects(projects, meta, 'a');
    // gamma, alpha, beta all contain "a"
    expect(sorted.map((p) => p.slug)).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('filtr po aliasie', () => {
    const meta: ProjectMetaMap = { beta: { alias: 'Moja super appka' } };
    const sorted = filterAndSortProjects(projects, meta, 'super');
    expect(sorted.map((p) => p.slug)).toEqual(['beta']);
  });

  it("tryb 'name' sortuje alfabetycznie po aliasie albo ścieżce", () => {
    const meta: ProjectMetaMap = {
      alpha: { alias: 'Charlie' },
      beta: { alias: 'Alpha project' },
      gamma: { alias: 'Bravo' },
    };
    const sorted = filterAndSortProjects(projects, meta, '', 'name');
    expect(sorted.map((p) => p.slug)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it("tryb 'sessions' sortuje po liczbie sesji malejąco, dogrywka po aktywności", () => {
    const list: ProjectSummary[] = [
      makeProject('alpha', '2026-04-16T10:00:00.000Z', 2),
      makeProject('beta', '2026-04-16T12:00:00.000Z', 5),
      makeProject('gamma', '2026-04-16T08:00:00.000Z', 5),
    ];
    const sorted = filterAndSortProjects(list, {}, '', 'sessions');
    expect(sorted.map((p) => p.slug)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it("tryb 'name' nadal respektuje przypięcia na górze", () => {
    const meta: ProjectMetaMap = { gamma: { favorite: true } };
    const sorted = filterAndSortProjects(projects, meta, '', 'name');
    expect(sorted[0]?.slug).toBe('gamma');
    // Remaining two sorted by display path — alpha before beta
    expect(sorted.slice(1).map((p) => p.slug)).toEqual(['alpha', 'beta']);
  });
});
