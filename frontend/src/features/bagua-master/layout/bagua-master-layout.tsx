import { useEffect, useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { SidebarContent } from '@/components/layout/app-sidebar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

// Carcasa propia de BAGUA MASTER: comparte solo la navegación lateral con el resto de la app;
// no incluye la búsqueda territorial ni ningún componente del mapa municipal.
export function BaguaMasterLayout({
  search,
  children,
}: {
  search: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.title = 'BAGUA MASTER · Bagua WebGIS';
  }, []);

  return (
    <div className="app-shell bm-shell">
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      {!collapsed && (
        <aside className="desktop-sidebar">
          <SidebarContent onCollapse={() => setCollapsed(true)} />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bm-header">
          <div className="flex min-w-0 items-center gap-2">
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
                  Accede a los módulos cartográficos.
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
            <div className="bm-header-title">
              <h1>BAGUA MASTER</h1>
              <p>Nueva cartografía urbana</p>
            </div>
          </div>
          {search}
        </header>
        <main id="main-content" tabIndex={-1} className="bm-main">
          {children}
        </main>
      </div>
    </div>
  );
}
