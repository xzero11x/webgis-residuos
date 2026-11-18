import {
  ArrowUpRight,
  AudioLines,
  Layers3,
  Map,
  MapPinned,
  ClipboardList,
  PanelLeftClose,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { env } from '@/config/env';
import { cn } from '@/lib/utils';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-2xs">
        <Layers3 className="size-4" strokeWidth={1.75} />
      </span>
      {!compact && (
        <div className="leading-none">
          <span className="block text-[15px] font-semibold tracking-[-0.03em] text-foreground">
            bagua<span className="text-primary">.</span>
          </span>
          <span className="mt-0.5 block text-[9px] font-medium tracking-[0.08em] whitespace-nowrap text-muted-foreground">
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
        { to: '/bagua-master/gestion', label: 'Predios y operación', icon: ClipboardList },
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
      <div className="flex h-10 items-center justify-between px-1">
        <Brand />
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Contraer navegación"
            onClick={onCollapse}
            className="size-7 text-muted-foreground"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>
      <div className="mt-6">
        <p className="sidebar-label">Espacio de trabajo</p>
        <nav aria-label="Navegación principal" className="mt-2 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, subtitle, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-2xs ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'size-4 shrink-0 transition-colors',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground group-hover:text-foreground',
                    )}
                    strokeWidth={1.75}
                  />
                  {subtitle ? (
                    <span className="min-w-0 leading-tight">
                      <span className="block">{label}</span>
                      <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
                        {subtitle}
                      </span>
                    </span>
                  ) : (
                    label
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto pt-6">
        <a
          href={`${env.VITE_API_BASE_URL}/docs/`}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex min-h-8 items-center justify-between rounded-md px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          Documentación de la API
          <ArrowUpRight className="size-3.5" />
        </a>
        <div className="border-t border-border/80 pt-3.5 px-1">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-[9px] font-semibold tracking-wider text-muted-foreground">
              MPB
            </span>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Municipalidad
              <span className="block font-medium text-foreground/85">Provincial de Bagua</span>
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Versión de trabajo</span>
            <span className="font-mono">v0.3.0</span>
          </div>
        </div>
      </div>
    </>
  );
}
