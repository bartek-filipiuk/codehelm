import { describe, expect, it } from 'vitest';
import {
  FAVORITES_GROUP_KEY,
  FAVORITES_GROUP_LABEL,
  OTHER_GROUP_KEY,
  OTHER_GROUP_LABEL,
  groupProjectsByPrefix,
  prefixSegment,
} from '@/lib/projects/group-by-prefix';
import type { ProjectSummary } from '@/hooks/use-projects';
import type { ProjectMetaMap } from '@/hooks/use-project-meta';

function makeProject(
  slug: string,
  cwd: string | null,
  lastActivity: string | null = null,
): ProjectSummary {
  return {
    slug,
    displayPath: cwd ?? `/unknown/${slug}`,
    resolvedCwd: cwd,
    sessionCount: 1,
    lastActivity,
    totalBytes: 0,
  };
}

describe('prefixSegment', () => {
  it('returns the first segment relative to $HOME when path lives under HOME', () => {
    expect(prefixSegment('/home/bartek/main-projects/foo', '/home/bartek')).toBe('main-projects');
  });

  it('returns null when path does not live under the passed HOME', () => {
    expect(prefixSegment('/var/lib/foo', '/home/bartek')).toBe(null);
  });

  it('falls back to Linux/macOS heuristic when HOME is not provided', () => {
    expect(prefixSegment('/home/bartek/experiments/foo', undefined)).toBe('experiments');
    expect(prefixSegment('/Users/alice/client-projects/bar', undefined)).toBe('client-projects');
  });

  it('returns null for null or empty cwd', () => {
    expect(prefixSegment(null)).toBe(null);
    expect(prefixSegment(undefined)).toBe(null);
  });

  it('returns null when cwd is exactly HOME (no sub-directory)', () => {
    expect(prefixSegment('/home/bartek', '/home/bartek')).toBe(null);
  });
});

describe('groupProjectsByPrefix', () => {
  const HOME = '/home/bartek';

  it('buckets projects by their first path segment under $HOME (alphabetical)', () => {
    const projects = [
      makeProject('beta', '/home/bartek/experiments/beta'),
      makeProject('alpha', '/home/bartek/main-projects/alpha'),
      makeProject('gamma', '/home/bartek/experiments/gamma'),
    ];
    const groups = groupProjectsByPrefix(projects, {}, { homeDir: HOME });
    expect(groups.map((g) => g.label)).toEqual(['experiments', 'main-projects']);
    const experiments = groups.find((g) => g.key === 'experiments');
    expect(experiments?.items.map((p) => p.slug)).toEqual(['beta', 'gamma']);
    const mainProjects = groups.find((g) => g.key === 'main-projects');
    expect(mainProjects?.items.map((p) => p.slug)).toEqual(['alpha']);
  });

  it('puts projects with null or outside-HOME cwd into a trailing Other group', () => {
    const projects = [
      makeProject('alpha', '/home/bartek/main-projects/alpha'),
      makeProject('missing', null),
      makeProject('elsewhere', '/var/tmp/elsewhere'),
    ];
    const groups = groupProjectsByPrefix(projects, {}, { homeDir: HOME });
    const last = groups[groups.length - 1];
    expect(last?.key).toBe(OTHER_GROUP_KEY);
    expect(last?.label).toBe(OTHER_GROUP_LABEL);
    expect(last?.items.map((p) => p.slug).sort()).toEqual(['elsewhere', 'missing']);
  });

  it('hoists favorites into their own leading group, regardless of prefix', () => {
    const projects = [
      makeProject('alpha', '/home/bartek/main-projects/alpha'),
      makeProject('beta', '/home/bartek/experiments/beta'),
      makeProject('gamma', '/home/bartek/experiments/gamma'),
    ];
    const meta: ProjectMetaMap = {
      alpha: { favorite: true },
      gamma: { favorite: true },
    };
    const groups = groupProjectsByPrefix(projects, meta, { homeDir: HOME });
    expect(groups[0]?.key).toBe(FAVORITES_GROUP_KEY);
    expect(groups[0]?.label).toBe(FAVORITES_GROUP_LABEL);
    expect(groups[0]?.items.map((p) => p.slug)).toEqual(['alpha', 'gamma']);
    // The remaining groups only hold the non-favorite projects.
    const rest = groups.slice(1).flatMap((g) => g.items.map((p) => p.slug));
    expect(rest).toEqual(['beta']);
  });

  it('preserves input order inside a bucket (so sort mode is respected by caller)', () => {
    const projects = [
      makeProject('later', '/home/bartek/main-projects/later', '2026-04-16T12:00:00.000Z'),
      makeProject('earlier', '/home/bartek/main-projects/earlier', '2026-04-16T08:00:00.000Z'),
    ];
    const groups = groupProjectsByPrefix(projects, {}, { homeDir: HOME });
    expect(groups[0]?.items.map((p) => p.slug)).toEqual(['later', 'earlier']);
  });

  it('returns an empty list when given no projects', () => {
    expect(groupProjectsByPrefix([], {}, { homeDir: HOME })).toEqual([]);
  });
});
