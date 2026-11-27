// Cifras de un mes tal como las calcula el servidor (y como quedan en la foto del cierre).

export interface Resumen {
  mes: string;
  desde: string;
  hasta: string;
  recoleccion: {
    toneladas: number;
    tickets: number;
    viajes: number;
    programadas: number;
    ejecutadas: number;
    completadas: number;
    interrumpidas: number;
    pasos: number;
    puntuales: number;
    vehiculos: number;
    rutas: {
      id: string;
      nombre: string;
      programadas: number;
      completadas: number;
      toneladas: number;
    }[];
  };
  selectiva: {
    codigo: string;
    nombre: string;
    inscritos: number;
    domiciliarios: number;
    noDomiciliarios: number;
    visitas: number;
    conEntrega: number;
    participantes: number;
    kg: number;
  }[];
  materiales: { material: string; kg: number; entregas: number; medidas: number }[];
  valorizacion: {
    actor: string;
    tipo: string;
    material: string;
    toneladas: number;
    comprobantes: number;
  }[];
  recicladores: { asociaciones: number; socios: number };
  avisos: number;
}

export interface Pendiente {
  clave: string;
  titulo: string;
  cantidad: number;
  nivel: 'importante' | 'revisar' | 'ok';
  accion: string;
  detalle: string[];
}
