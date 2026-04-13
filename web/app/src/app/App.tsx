import { AppProviders } from './AppProviders';
import { AppRouterProvider } from './router';

export function App() {
  return (
    <AppProviders>
        <AppRouterProvider />
    </AppProviders>
  );
}
