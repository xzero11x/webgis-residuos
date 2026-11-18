// Los enlaces anteriores abrían la gestión como panel dentro del mapa (`?trabajo=gestion`).
// Ahora cada tarea tiene su espacio; esta función traduce el enlace antiguo al nuevo.
export function legacyWorkTarget(params: URLSearchParams): string | null {
  if (params.get('trabajo') !== 'gestion') return null;
  const view = params.get('vista') || 'predios';
  const record = (params.has('registro') ? params.get('registro') : params.get('predio')) || '';
  const keep = (names: string[]) => {
    const next = new URLSearchParams();
    for (const name of names) {
      const value = params.get(name);
      if (value) next.set(name, value);
    }
    const text = next.toString();
    return text ? `?${text}` : '';
  };
  if (view === 'servicios') return `/bagua-master/servicios${keep(['servicio', 'operacion'])}`;
  if (view === 'reportes') return '/bagua-master/resultados';
  if (['importaciones', 'catalogos', 'usuarios', 'auditoria', 'password'].includes(view))
    return `/bagua-master/administracion?vista=${view}`;
  if (params.get('accion') === 'entrega')
    return record
      ? `/bagua-master/expedientes/predio/${record}?accion=entrega`
      : '/bagua-master/servicios?registrar=1';
  if (record) return `/bagua-master/expedientes/predio/${record}${keep(['unidad'])}`;
  return `/bagua-master/expedientes${keep(['q'])}`;
}
