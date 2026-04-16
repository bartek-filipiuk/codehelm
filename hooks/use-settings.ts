'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/components/common/csrf';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsPatch,
} from '@/lib/settings/io';

const SETTINGS_KEY = ['settings'] as const;

export function useSettings() {
  return useQuery<Settings>({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/settings');
      if (!res.ok) throw new Error(`settings load failed: ${res.status}`);
      const body = (await res.json()) as { settings: Settings };
      return body.settings ?? DEFAULT_SETTINGS;
    },
    placeholderData: DEFAULT_SETTINGS,
  });
}

export function useSetSettings() {
  const qc = useQueryClient();
  return useMutation<Settings, Error, SettingsPatch>({
    mutationFn: async (patch) => {
      const res = await apiFetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        let code = `status ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) code = body.error;
        } catch {
          // ignore
        }
        throw new Error(code);
      }
      const body = (await res.json()) as { settings: Settings };
      return body.settings;
    },
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
    },
  });
}
