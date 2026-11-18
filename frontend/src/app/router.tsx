import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { env } from '@/config/env';
import { MapPage } from '@/pages/map-page';
import { SystemPage } from '@/pages/system-page';
import { NotFoundPage } from '@/pages/not-found-page';

const municipalEnabled = env.VITE_MUNICIPAL_MAP_ENABLED === 'true';
const baguaMasterEnabled = env.VITE_BAGUA_MASTER_ENABLED === 'true';

const loading = (
  <p role="status" className="p-8 text-sm text-muted-foreground">
    Cargando BAGUA MASTER…
  </p>
);
const pageError = (
  <div role="alert" className="p-8 text-sm">
    Este espacio no está disponible en este momento. <a href="/bagua-master">Volver a Explorar</a> ·{' '}
    <a href="/sistema">Estado del sistema</a>
  </div>
);
const space =
  (load: () => Promise<Record<string, React.ComponentType>>, name: string) => async () => ({
    Component: (await load())[name]!,
  });

// BAGUA MASTER: una aplicación con cuatro espacios (Explorar, Expedientes, Servicios y
// Resultados) más Administración, bajo una misma carcasa con búsqueda universal. Cada
// espacio se carga de forma diferida; si uno falla, el error queda contenido en su ruta.
const baguaMasterRoutes: RouteObject[] = baguaMasterEnabled
  ? [
      {
        // Enlace anterior; la gestión ya no es una pantalla aparte.
        path: '/bagua-master/gestion',
        lazy: () => import('@/features/gestion/gestion-page'),
      },
      {
        path: '/bagua-master',
        lazy: () => import('@/features/product/shell'),
        hydrateFallbackElement: loading,
        errorElement: pageError,
        children: [
          {
            index: true,
            lazy: () => import('@/features/bagua-master/bagua-master-page'),
            errorElement: pageError,
          },
          {
            path: 'expedientes',
            lazy: space(() => import('@/features/product/expedientes'), 'ExpedientesPage'),
            errorElement: pageError,
          },
          {
            path: 'expedientes/predio/:id',
            lazy: space(
              () => import('@/features/product/expediente-predio'),
              'ExpedientePredioPage',
            ),
            errorElement: pageError,
          },
          {
            path: 'expedientes/persona/:id',
            lazy: space(
              () => import('@/features/product/expediente-persona'),
              'ExpedientePersonaPage',
            ),
            errorElement: pageError,
          },
          {
            path: 'servicios',
            lazy: space(() => import('@/features/product/spaces'), 'ServiciosPage'),
            errorElement: pageError,
          },
          {
            path: 'resultados',
            lazy: space(() => import('@/features/product/spaces'), 'ResultadosPage'),
            errorElement: pageError,
          },
          {
            path: 'administracion',
            lazy: space(() => import('@/features/product/spaces'), 'AdministracionPage'),
            errorElement: pageError,
          },
        ],
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
