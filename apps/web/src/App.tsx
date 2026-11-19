import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { createQueryClient } from '@/app/queryClient';
import { applySystemTheme } from '@/app/theme';
import { Toaster } from '@/components/ui/sonner';
import { AppRoutes } from '@/routes';

// Роутер с данными нужен редактору для useBlocker (предупреждение о несохранённых изменениях)
const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }]);

export function App() {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => applySystemTheme(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
