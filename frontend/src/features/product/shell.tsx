import { useEffect, useState, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  KeyRound,
  LogOut,
  Map as MapIcon,
  MapPinned,
  Moon,
  Settings2,
  Sun,
  Truck,
} from 'lucide-react';
import { env } from '@/config/env';
import { management } from '@/features/gestion/api';
import { WorkspaceEdits } from '@/features/gestion/workspace-edits';
import { useWorkspaceEdits } from '@/features/gestion/workspace-edits-context';
import { UniversalSearch } from './search';
import { useEnvironment, useSession } from './use-session';
import './product.css';

const spaces = [
  { to: '/bagua-master', end: true, label: 'Explorar', icon: MapIcon },
  { to: '/bagua-master/operacion', end: false, label: 'Operación', icon: Truck },
  { to: '/bagua-master/expedientes', end: false, label: 'Expedientes', icon: FolderOpen },
  { to: '/bagua-master/servicios', end: false, label: 'Servicios', icon: ClipboardList },
  { to: '/bagua-master/campo', end: false, label: 'Campo', icon: ClipboardCheck },
  { to: '/bagua-master/resultados', end: false, label: 'Resultados', icon: BarChart3 },
] as const;

const THEME_KEY = 'bagua-theme';
function storedTheme(): 'light' | 'dark' {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    /* sin almacenamiento: se usa la preferencia del sistema */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(storedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <button
      type="button"
      className="pr-icon-button"
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={() =>
        setTheme((current) => {
          const next = current === 'dark' ? 'light' : 'dark';
          try {
            localStorage.setItem(THEME_KEY, next);
          } catch {
            /* preferencia solo para esta sesión */
          }
          return next;
        })
      }
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function UserMenu() {
  const session = useSession();
  const client = useQueryClient();
  const environment = useEnvironment(session.isSuccess);
  const user = session.data;
  const open = !!environment.data?.accesoLibre;
  async function logout() {
    await management('/salir', 'POST', {});
    client.removeQueries({ queryKey: ['gestion'] });
    await client.invalidateQueries({ queryKey: ['gestion', 'sesion'] });
  }
  return (
    <div className="pr-header-end">
      {environment.data?.fixturesPermitidos && (
        <span className="pr-env-badge" title="Registros de ensayo, sin validez municipal">
          <span className="pr-dot" />
          <span className="pr-env-text">Demostración · datos sintéticos</span>
        </span>
      )}
      <ThemeToggle />
      {user ? (
        <Menu.Root>
          <Menu.Trigger className="pr-user" aria-label={`Cuenta de ${user.usuario}`}>
            <span className="pr-avatar" aria-hidden="true">
              {user.usuario.slice(0, 1).toUpperCase()}
            </span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="pr-menu" align="end" sideOffset={8} collisionPadding={12}>
              <div className="pr-menu-label">
                <strong>{user.nombre}</strong>
                {open
                  ? 'Acceso libre local · sin inicio de sesión'
                  : `${user.usuario} · ${user.rol}`}
              </div>
              <Menu.Separator className="pr-menu-sep" />
              {user.rol === 'administrador' && (
                <Menu.Item asChild className="pr-menu-item">
                  <Link to="/bagua-master/administracion">
                    <Settings2 size={15} /> Administración
                  </Link>
                </Menu.Item>
              )}
              {!open && (
                <Menu.Item asChild className="pr-menu-item">
                  <Link to="/bagua-master/administracion?vista=password">
                    <KeyRound size={15} /> Cambiar mi contraseña
                  </Link>
                </Menu.Item>
              )}
              {env.VITE_MUNICIPAL_MAP_ENABLED === 'true' && (
                <Menu.Item asChild className="pr-menu-item">
                  <Link to="/">
                    <MapIcon size={15} /> Mapa general · histórico
                  </Link>
                </Menu.Item>
              )}
              <Menu.Item asChild className="pr-menu-item">
                <Link to="/sistema">
                  <MapPinned size={15} /> Estado del sistema
                </Link>
              </Menu.Item>
              {!open && (
                <>
                  <Menu.Separator className="pr-menu-sep" />
                  <Menu.Item className="pr-menu-item" onSelect={() => void logout()}>
                    <LogOut size={15} /> Salir
                  </Menu.Item>
                </>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      ) : (
        !session.isPending && (
          <Link to="/bagua-master/expedientes" className="pr-user">
            Ingresar
          </Link>
        )
      )}
    </div>
  );
}

// Marca el espacio con cambios sin guardar cuando se edita un formulario protegido.
function MainRegion({ isMap, children }: { isMap: boolean; children: ReactNode }) {
  const edits = useWorkspaceEdits();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`pr-main${isMap ? ' is-map' : ''}`}
      onChangeCapture={(event) => {
        if ((event.target as HTMLElement).closest('[data-unsaved-form]')) edits.dirty();
      }}
    >
      {children}
    </main>
  );
}

const titles: [string, string][] = [
  ['/bagua-master/operacion', 'Operación'],
  ['/bagua-master/campo/ruta', 'Ruta del vehículo'],
  ['/bagua-master/expedientes', 'Expedientes'],
  ['/bagua-master/servicios', 'Servicios'],
  ['/bagua-master/campo', 'Campo'],
  ['/bagua-master/resultados', 'Resultados'],
  ['/bagua-master/administracion', 'Administración'],
];

// Carcasa común de BAGUA MASTER: una aplicación con cuatro espacios de trabajo (explorar,
// consultar expedientes, gestionar servicios y analizar resultados) unidos por una misma
// búsqueda, la misma sesión y una navegación coherente.
export function ProductShell() {
  const location = useLocation();
  const isMap = !!useMatch({ path: '/bagua-master', end: true });
  useEffect(() => {
    const space = titles.find(([path]) => location.pathname.startsWith(path))?.[1] ?? 'Explorar';
    document.title = `${space} · WEBGIS BAGUA`;
  }, [location.pathname]);
  useEffect(() => {
    document.documentElement.dataset.theme = storedTheme();
  }, []);
  return (
    <div className="pr-shell">
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <header className="pr-header">
        <Link to="/bagua-master" className="pr-brand" aria-label="WEBGIS BAGUA, ir a Explorar">
          <span className="pr-brand-mark" aria-hidden="true">
            <MapPinned size={16} />
          </span>
          <span>
            <strong>WEBGIS BAGUA</strong>
            <small>Municipalidad Provincial de Bagua</small>
          </span>
        </Link>
        <nav className="pr-nav" aria-label="Espacios de trabajo">
          {spaces.map(({ to, end, label }) => (
            <NavLink key={to} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </nav>
        <UniversalSearch />
        <UserMenu />
      </header>
      <WorkspaceEdits>
        <MainRegion isMap={isMap}>
          <Outlet />
        </MainRegion>
      </WorkspaceEdits>
      <nav className="pr-tabbar" aria-label="Espacios de trabajo (móvil)">
        {spaces.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={19} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export { ProductShell as Component };
