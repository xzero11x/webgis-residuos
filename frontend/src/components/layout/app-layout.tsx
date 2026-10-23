import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, Menu, UserRound } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SidebarContent } from './app-sidebar';
import { Button } from '@/components/ui/button';
import { TerritorialSearch } from './territorial-search';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHealth } from '@/hooks/use-health';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const health = useHealth();
  const title =
    location.pathname === '/'
      ? 'Mapa general'
      : location.pathname === '/sistema'
        ? 'Estado del sistema'
        : 'Página no encontrada';

  useEffect(() => {
    document.title = `${title} · Bagua WebGIS`;
  }, [title]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      {!collapsed && (
        <aside className="desktop-sidebar">
          <SidebarContent onCollapse={() => setCollapsed(true)} />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-header">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Abrir navegación"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetTitle className="sr-only">Navegación de Bagua WebGIS</SheetTitle>
                <SheetDescription className="sr-only">
                  Accede al mapa y al estado del sistema.
                </SheetDescription>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            {collapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                aria-label="Expandir navegación"
                onClick={() => setCollapsed(false)}
              >
                <Menu />
              </Button>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className="hidden text-muted-foreground xl:inline">Espacio de trabajo</span>
              <ChevronRight className="hidden size-3 text-muted-foreground/60 xl:block" />
              <span className="whitespace-nowrap font-medium">{title}</span>
            </div>
          </div>
          <TerritorialSearch />
          <div className="flex items-center gap-4">
            <span
              className="hidden items-center gap-1.5 text-[11px] text-muted-foreground 2xl:flex"
              role="status"
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  health.isError
                    ? 'bg-amber-500'
                    : health.isPending
                      ? 'bg-muted-foreground'
                      : 'bg-emerald-600',
                )}
              />
              {health.isError
                ? 'API sin conexión'
                : health.isPending
                  ? 'Conectando'
                  : 'API conectada'}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 gap-2 px-1.5" aria-label="Menú de usuario">
                  <span className="flex size-8 items-center justify-center rounded-full border bg-muted">
                    <UserRound className="size-4 text-foreground/70" />
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <span className="block font-medium text-foreground">Acceso de desarrollo</span>
                  <span className="mt-1 block max-w-52 leading-relaxed">
                    La autenticación se incorporará en una próxima etapa.
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => navigate('/sistema')}>
                  <ArrowUpRight />
                  Estado del sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
