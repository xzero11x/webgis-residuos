import { useQuery } from '@tanstack/react-query';
import { management, type User } from '@/features/gestion/api';

export function useSession() {
  return useQuery({
    queryKey: ['gestion', 'sesion'],
    queryFn: ({ signal }) => management<User>('/sesion', 'GET', undefined, signal),
    retry: false,
    staleTime: 60_000,
  });
}

export function useEnvironment(enabled: boolean) {
  return useQuery({
    queryKey: ['gestion', 'entorno'],
    queryFn: ({ signal }) =>
      management<{ fixturesPermitidos: boolean; accesoLibre?: boolean }>(
        '/entorno',
        'GET',
        undefined,
        signal,
      ),
    enabled,
    retry: false,
    staleTime: 600_000,
  });
}
