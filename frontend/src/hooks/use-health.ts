import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet } from '@/lib/api';

const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.iso.datetime(),
});
const readinessSchema = healthSchema.extend({
  database: z.literal('ok'),
  postgis: z.literal('ok'),
});

export function useHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: async ({ signal }) => healthSchema.parse(await apiGet('/health', signal)),
    refetchInterval: 60_000,
  });
}

export function useReadiness() {
  return useQuery({
    queryKey: ['system', 'ready'],
    queryFn: async ({ signal }) => readinessSchema.parse(await apiGet('/ready', signal)),
    refetchInterval: 60_000,
  });
}
