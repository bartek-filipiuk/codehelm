'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/components/common/csrf';

export interface SessionSummary {
  id: string;
  path: string;
  size: number;
  mtime: string;
  messageCount: number | null;
  firstUserPreview: string | null;
  costUsd: number | null;
  totalTokens: number | null;
}

export function useSessions(slug: string | null) {
  return useQuery<SessionSummary[]>({
    queryKey: ['sessions', slug],
    enabled: !!slug,
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(slug!)}/sessions`);
      if (!res.ok) throw new Error(`sessions failed: ${res.status}`);
      const body = (await res.json()) as { sessions: SessionSummary[] };
      return body.sessions;
    },
  });
}
