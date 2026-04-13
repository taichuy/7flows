import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppThemeProvider } from '@1flowse/ui';

import { AppRouterProvider } from './router';

const queryClient = new QueryClient();

export function App() {
  return (
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouterProvider />
      </QueryClientProvider>
    </AppThemeProvider>
  );
}
