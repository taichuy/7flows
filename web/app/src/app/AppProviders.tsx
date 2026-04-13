import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { AppThemeProvider } from '@1flowse/ui';

const queryClient = new QueryClient();

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AppThemeProvider>
  );
}
