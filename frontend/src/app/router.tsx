import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { env } from '@/config/env';
import { MapPage } from '@/pages/map-page';
import { SystemPage } from '@/pages/system-page';
import { NotFoundPage } from '@/pages/not-found-page';

const municipalEnabled = env.VITE_MUNICIPAL_MAP_ENABLED === 'true';
const baguaMasterEnabled = env.VITE_BAGUA_MASTER_ENABLED === 'true';

// BAGUA MASTER se carga de forma diferida y con su propia carcasa; si falla, el error
// queda contenido en su ruta.
const baguaMasterRoutes: RouteObject[] = baguaMasterEnabled
  ? [
      {
        path: '/bagua-master',
        lazy: () => import('@/features/bagua-master/bagua-master-page'),
        hydrateFallbackElement: (
          <p role="status" className="p-8 text-sm text-muted-foreground">
            Cargando BAGUA MASTER…
          </p>
        ),
        errorElement: (
          <div role="alert" className="p-8 text-sm">
            BAGUA MASTER no está disponible en este momento.{' '}
            <a href="/sistema">Estado del sistema</a>
          </div>
        ),
      },
    ]
  : [];

export const router = createBrowserRouter([
  ...baguaMasterRoutes,
  {
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: municipalEnabled ? (
          <MapPage />
        ) : baguaMasterEnabled ? (
          <Navigate to="/bagua-master" replace />
        ) : (
          <NotFoundPage />
        ),
      },
      { path: '/sistema', element: <SystemPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
