'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useState, type ReactNode } from 'react';
import { useWatch } from '@/hooks/use-watch';
import { HelpOverlay } from '@/components/HelpOverlay';
import { CommandPalette } from '@/components/CommandPalette';
import { SettingsApplier } from '@/components/SettingsApplier';

function WatcherSubscriber() {
  useWatch();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={200}>
        <SettingsApplier />
        <WatcherSubscriber />
        {children}
        <HelpOverlay />
        <CommandPalette />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
