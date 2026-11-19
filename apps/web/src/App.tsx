import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { applySystemTheme } from '@/app/theme';
import { Toaster } from '@/components/ui/sonner';
import { AppRoutes } from '@/routes';

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => applySystemTheme(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
