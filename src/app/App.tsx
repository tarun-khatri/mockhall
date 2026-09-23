import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './Layout';
import { RouteError } from './RouteError';

const lazy = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <RouteError />,
      children: [
        { index: true, lazy: lazy(() => import('../screens/Home')) },
        { path: 'practice', lazy: lazy(() => import('../screens/Practice')) },
        { path: 'practice/:subject', lazy: lazy(() => import('../screens/ChapterList')) },
        { path: 'mocks', lazy: lazy(() => import('../screens/Mocks')) },
        { path: 'progress', lazy: lazy(() => import('../screens/Progress')) },
        { path: 'mistakes', lazy: lazy(() => import('../screens/Mistakes')) },
        { path: 'settings', lazy: lazy(() => import('../screens/Settings')) },
        { path: 'start', lazy: lazy(() => import('../screens/Instructions')) },
        { path: 't/:encoded', lazy: lazy(() => import('../screens/SharedTest')) },
        { path: 'test/:id', lazy: lazy(() => import('../screens/Exam')) },
        { path: 'result/:id', lazy: lazy(() => import('../screens/Result')) },
        { path: 'solutions/:id', lazy: lazy(() => import('../screens/Solutions')) },
        { path: '*', lazy: lazy(() => import('../screens/NotFound')) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

export function App() {
  return <RouterProvider router={router} />;
}
