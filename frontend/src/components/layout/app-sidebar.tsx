import {
  ArrowUpRight,
  AudioLines,
  Layers3,
  Map,
  MapPinned,
  PanelLeftClose,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { env } from '@/config/env';
import { cn } from '@/lib/utils';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-primary text-primary-foreground">
        <Layers3 className="size-[23px]" strokeWidth={1.6} />
      </span>
      {!compact && (
        <div>
          <span className="block text-[23px] leading-6 font-semibold tracking-[-1px]">
            bagua<span className="text-primary">.</span>
          </span>
          <span className="mt-0.5 block text-[8px] font-semibold tracking-[1.4px] whitespace-nowrap text-muted-foreground">
            WEBGIS MUNICIPAL
          </span>
        </div>
      )}
    </div>
  );
}

// Cada módulo cartográfico se muestra solo si su indicador está activo.
const NAV_ITEMS: { to: string; label: string; subtitle?: string; icon: LucideIcon }[] = [
  ...(env.VITE_MUNICIPAL_MAP_ENABLED === 'true'
    ? [{ to: '/', label: 'Mapa general', icon: Map }]
    : []),
  ...(env.VITE_BAGUA_MASTER_ENABLED === 'true'
    ? [
        {
          to: '/bagua-master',
          label: 'BAGUA MASTER',
          subtitle: 'Nueva cartografía urbana',
          icon: MapPinned,
        },
      ]
    : []),
  { to: '/sistema', label: 'Estado del sistema', icon: AudioLines },
];

export function SidebarContent({
  onNavigate,
  onCollapse,
}: {
  onNavigate?: () => void;
  onCollapse?: () => void;
}) {
  return (
    <>
      <div className="flex h-16 items-center justify-between">
        <Brand />
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Contraer navegación"
            onClick={onCollapse}
            className="size-8 text-muted-foreground"
          >
            <PanelLeftClose />
          </Button>
        )}
      </div>
      <div className="mt-10">
        <p className="sidebar-label">Espacio de trabajo</p>
        <nav aria-label="Navegación principal" className="mt-3 space-y-1">
          {NAV_ITEMS.map(({ to, label, subtitle, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.7} />
              {subtitle ? (
                <span className="min-w-0 py-1.5 leading-tight">
                  <span className="block">{label}</span>
                  <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
                    {subtitle}
                  </span>
                </span>
              ) : (
                label
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto pt-8">
        <a
          href={`${env.VITE_API_BASE_URL}/docs/`}
          target="_blank"
          rel="noreferrer"
          className="mb-6 flex min-h-10 items-center justify-between px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          Documentación de la API
          <ArrowUpRight className="size-3.5" />
        </a>
        <div className="border-t pt-5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border text-[9px] font-semibold tracking-wide">
              MPB
            </span>
            <p className="text-[11px] leading-[1.6] text-muted-foreground">
              Municipalidad
              <br />
              <span className="font-medium text-foreground/80">Provincial de Bagua</span>
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Versión de trabajo</span>
            <span>v0.3.0</span>
          </div>
        </div>
      </div>
    </>
  );
}
