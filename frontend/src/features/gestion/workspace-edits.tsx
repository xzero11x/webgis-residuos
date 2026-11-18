import { useEffect, useRef, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { EditContext } from './workspace-edits-context';

const message = 'Hay cambios sin guardar. ¿Quieres descartarlos y continuar?';
export function WorkspaceEdits({ children }: { children: ReactNode }) {
  const dirty = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) {
      dirty.current = false;
      blocker.proceed();
    } else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return (
    <EditContext.Provider
      value={{
        dirty: () => {
          dirty.current = true;
        },
        saved: () => {
          dirty.current = false;
        },
        run: (action) => {
          if (!dirty.current || window.confirm(message)) {
            dirty.current = false;
            action();
          }
        },
      }}
    >
      {children}
    </EditContext.Provider>
  );
}
