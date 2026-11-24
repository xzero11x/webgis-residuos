import { z } from 'zod';
import { csvInput } from './gestion.csv.js';
import { resolutionsInput } from './gestion.reconciliation.js';
import { spatialProposal, spatialDecision } from './gestion.spatial.js';
import { resetPasswordInput } from './gestion.users.js';
import { reversalInput } from './gestion.import-reversal.js';
import { deliveryCorrection } from './gestion.delivery-corrections.js';
import { mapCorrectionAnnul, mapCorrectionInput } from './gestion.map-corrections.js';
import { valorizationInput, visitInput } from './gestion.operacion.js';
import { qrBatchInput, qrRevokeInput } from './gestion.qr.js';
import {
  predioInput,
  predioUpdate,
  linkInput,
  serviceInput,
  participationInput,
  deliveryInput,
} from './gestion.schema.js';

const json = (schema: z.ZodType) => ({
  required: true,
  content: {
    'application/json': { schema: z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) },
  },
});
const headers = [
  {
    in: 'header',
    name: 'X-Bagua-Request',
    required: true,
    schema: { type: 'string', enum: ['1'] },
    description:
      'Cabecera requerida en escrituras para proteger frente a solicitudes de otros orígenes.',
  },
];
const qrCode = {
  in: 'path',
  name: 'codigo',
  required: true,
  description: '8 caracteres Crockford base32 con dígito de control; se acepta XXXX-XXXX',
  schema: { type: 'string', pattern: '^[0-9A-Za-z-]{8,9}$' },
};
const id = { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } };
function op(summary: string, body?: z.ZodType, hasId = false) {
  return {
    tags: ['Gestión BAGUA MASTER'],
    summary,
    security: [{ GestionSesion: [] }],
    parameters: [...(hasId ? [id] : []), ...(body ? headers : [])],
    ...(body ? { requestBody: json(body) } : {}),
    responses: {
      200: { description: 'Operación completada; fuente sintética identificada' },
      201: { description: 'Registro creado' },
      400: { description: 'Datos inválidos' },
      401: { description: 'Sesión requerida' },
      403: { description: 'Perfil sin permiso' },
      409: { description: 'Duplicado, versión concurrente o conflicto de conciliación' },
    },
  };
}
export const gestionPaths = {
  '/gestion/importaciones': {
    get: op('Historial paginado de lotes de importación; administración'),
  },
  '/gestion/importaciones/{id}/cambios': {
    get: op('Manifest exacto, bloqueos y reversiones del lote; administración', undefined, true),
  },
  '/gestion/importaciones/{id}/revertir': {
    post: op(
      'Reversión selectiva transaccional e idempotente, sin borrar altas',
      reversalInput,
      true,
    ),
  },
  '/gestion/entregas/{id}': {
    patch: op(
      'Corregir una entrega conservando identidad y versiones con motivo',
      deliveryCorrection,
      true,
    ),
  },
  '/gestion/entregas/{id}/revisiones': {
    get: op('Revisiones de la misma entrega; registro o administración', undefined, true),
  },
  '/gestion/usuarios/{id}/password': {
    post: op(
      'Restablecimiento administrativo con reautenticación, motivo, versión y revocación de sesiones',
      resetPasswordInput,
      true,
    ),
  },
  '/gestion/servicios/{id}/operacion': {
    get: {
      ...op(
        'Consulta paginada de asignaciones, participaciones, entregas o unidades, sin datos personales',
        undefined,
        true,
      ),
      parameters: [
        id,
        {
          in: 'query',
          name: 'tipo',
          schema: {
            type: 'string',
            enum: ['asignaciones', 'participaciones', 'entregas', 'unidades'],
          },
        },
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
      ],
    },
  },
  '/gestion/unidades/buscar': {
    get: {
      ...op('Buscar unidades activas de predios activos sin datos personales'),
      parameters: [
        {
          in: 'query',
          name: 'q',
          required: true,
          schema: { type: 'string', minLength: 2, maxLength: 100 },
        },
      ],
    },
  },
  '/gestion/auditoria': {
    get: {
      ...op('Auditoría global de administración: metadatos sin contenido personal'),
      parameters: [
        { in: 'query', name: 'antes', schema: { type: 'string', pattern: '^[1-9][0-9]*$' } },
        {
          in: 'query',
          name: 'limite',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
        },
        { in: 'query', name: 'accion', schema: { type: 'string', maxLength: 100 } },
        { in: 'query', name: 'predio', schema: { type: 'string', format: 'uuid' } },
      ],
    },
  },
  '/gestion/predios/{id}/unidades/{unidad}/relaciones/{relacion}/cerrar': {
    post: {
      ...op(
        'Cerrar relación específica de unidad conservando historial',
        z.object({
          hasta: z.iso.date(),
          motivo: z.string().min(5).max(1000),
          version: z.number().int().positive(),
        }),
      ),
      parameters: [
        ...headers,
        id,
        ...['unidad', 'relacion'].map((name) => ({
          in: 'path',
          name,
          required: true,
          schema: { type: 'string', format: 'uuid' },
        })),
      ],
    },
  },
  '/gestion/espacial/candidatos': {
    get: {
      ...op(
        'Edificios Overture que intersectan una ventana explícita; no confirma correspondencia',
      ),
      parameters: ['oeste', 'sur', 'este', 'norte'].map((name) => ({
        in: 'query',
        name,
        required: true,
        schema: { type: 'number' },
      })),
    },
  },
  '/gestion/espacial/edificios/{edificio}': {
    get: {
      ...op('Geometría original de un edificio para revisión autorizada'),
      parameters: [{ in: 'path', name: 'edificio', required: true, schema: { type: 'string' } }],
    },
  },
  '/gestion/espacial/edificios/{edificio}/predios': {
    get: {
      ...op('Predios con vínculo cartográfico confirmado, sin identidad personal'),
      parameters: [{ in: 'path', name: 'edificio', required: true, schema: { type: 'string' } }],
    },
  },
  '/gestion/predios/{id}/espacial': {
    get: op('Candidatos e historial de estado espacial', undefined, true),
    post: op('Proponer candidato sin modificar ubicación administrativa', spatialProposal, true),
  },
  '/gestion/predios/{id}/espacial/{vinculo}': {
    patch: {
      ...op(
        'Decidir vínculo espacial con versión, motivo y revisión de relación compartida',
        spatialDecision,
        true,
      ),
      parameters: [
        ...headers,
        id,
        { in: 'path', name: 'vinculo', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
    },
  },
  '/gestion/predios/{id}/unidades/{unidad}/relaciones': {
    get: {
      ...op('Relaciones específicas; personas omitidas para consulta'),
      parameters: [
        id,
        { in: 'path', name: 'unidad', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
    },
    post: {
      ...op(
        'Crear vínculo o asignación explícita de unidad',
        z.object({
          personaId: z.string().uuid().optional(),
          servicioId: z.string().uuid().optional(),
          tipo: z.string(),
          estado: z.string().optional(),
          periodo: z.object({
            desde: z.string().date(),
            hasta: z.string().date().nullable(),
            evidencia: z.string().min(5),
          }),
        }),
      ),
      parameters: [
        ...headers,
        id,
        { in: 'path', name: 'unidad', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
    },
  },
  '/gestion/sesion': {
    get: op('Consultar sesión y perfil técnico provisional'),
    post: {
      ...op('Iniciar sesión', z.object({ usuario: z.string(), password: z.string() })),
      security: [],
    },
  },
  '/gestion/salir': { post: op('Cerrar sesión', z.object({})) },
  '/gestion/catalogos': { get: op('Catálogos sintéticos y fuentes disponibles') },
  '/gestion/catalogos/materiales': {
    get: op('Materiales de prueba activos sugeridos para entregas'),
  },
  '/gestion/catalogos/configuracion': {
    get: op('Catálogos de prueba configurables; solo administración'),
  },
  '/gestion/catalogos/{tipo}': {
    post: {
      ...op(
        'Crear servicio o material de prueba; solo administración',
        z.object({
          codigo: z.string().regex(/^TEST-[A-Z0-9_-]{1,50}$/),
          nombre: z.string().min(2).max(120),
        }),
      ),
      parameters: [
        ...headers,
        {
          in: 'path',
          name: 'tipo',
          required: true,
          schema: { type: 'string', enum: ['servicios', 'materiales'] },
        },
      ],
    },
  },
  '/gestion/catalogos/{tipo}/{id}': {
    patch: {
      ...op(
        'Activar/desactivar conservando referencias; solo administración',
        z.object({ activo: z.boolean() }),
        true,
      ),
      parameters: [
        ...headers,
        id,
        {
          in: 'path',
          name: 'tipo',
          required: true,
          schema: { type: 'string', enum: ['servicios', 'materiales'] },
        },
      ],
    },
  },
  '/gestion/entorno': {
    get: op('Comprobar si el destino permite fixtures; no expone datos de conexión'),
  },
  '/gestion/predios': {
    get: {
      ...op('Padrón administrativo, independiente del DEMO histórico'),
      parameters: [
        { in: 'query', name: 'q', schema: { type: 'string' } },
        { in: 'query', name: 'ubicacion', schema: { type: 'string' } },
        { in: 'query', name: 'page', schema: { type: 'integer' } },
      ],
    },
    post: op('Crear predio sintético, ubicación opcional', predioInput),
  },
  '/gestion/predios/{id}': {
    get: op('Ficha con relaciones según permisos', undefined, true),
    put: op('Actualizar con control de versión e historial', predioUpdate, true),
  },
  '/gestion/personas/{id}/predios': {
    get: op('Persona y hasta 100 vínculos históricos; registro/administración', undefined, true),
  },
  '/gestion/usuarios': {
    get: op('Listar cuentas sin contraseñas; solo administración'),
    post: op(
      'Crear cuenta provisional en destino de prueba',
      z.object({
        usuario: z.string(),
        nombre: z.string(),
        rol: z.enum(['consulta', 'registro', 'administrador']),
        password: z.string().min(16).max(200),
      }),
    ),
  },
  '/gestion/usuarios/{id}': {
    patch: op(
      'Actualizar cuenta con versión y revocar sesiones; solo administración',
      z.object({
        nombre: z.string(),
        rol: z.enum(['consulta', 'registro', 'administrador']),
        activo: z.boolean(),
        version: z.number().int().positive(),
      }),
      true,
    ),
  },
  '/gestion/password': {
    post: op(
      'Cambiar contraseña propia y revocar todas las sesiones',
      z.object({ actual: z.string(), nueva: z.string().min(16).max(200) }),
    ),
  },
  '/gestion/predios/{id}/vinculos': {
    post: op('Vincular persona existente o crearla atómicamente', linkInput, true),
  },
  '/gestion/predios/{id}/asignaciones': {
    post: op('Asignar servicio; no acredita prestación efectiva', serviceInput, true),
  },
  '/gestion/predios/{id}/participaciones': {
    post: op('Registrar participación con periodo y evidencia', participationInput, true),
  },
  '/gestion/entregas': {
    post: op('Registrar evento con clave de idempotencia, medición opcional', deliveryInput),
  },
  '/gestion/predios/{id}/operacion': {
    get: op(
      'Horario de recolección del predio y su participación (padrón, tasa de entrega, visitas)',
      undefined,
      true,
    ),
  },
  '/gestion/campo': {
    get: op('Recorrido de campo del día por servicio, ordenado por hora estimada de paso'),
  },
  '/gestion/qr/etiquetas': {
    get: {
      ...op('Stickers QR vigentes de los inscritos por programa y sector, y cuántos faltan'),
      parameters: [
        {
          in: 'query',
          name: 'servicio',
          schema: { type: 'string', enum: ['organicos', 'reciclables'] },
        },
        { in: 'query', name: 'sector', schema: { type: 'string' } },
      ],
    },
  },
  '/gestion/qr/{codigo}': {
    get: {
      ...op(
        'Resolver un sticker escaneado: predio, programas del día con hora estimada y visita registrada',
      ),
      parameters: [
        qrCode,
        { in: 'query', name: 'fecha', schema: { type: 'string', format: 'date' } },
      ],
    },
  },
  '/gestion/qr/{codigo}/revocar': {
    post: {
      ...op(
        'Reemplazar un sticker perdido o dañado (el anterior deja de funcionar)',
        qrRevokeInput,
      ),
      parameters: [qrCode, ...headers],
    },
  },
  '/gestion/qr/lote': {
    post: op('Generar los stickers que faltan a los inscritos de un programa', qrBatchInput),
  },
  '/gestion/predios/{id}/qr': {
    get: op('Sticker QR vigente del predio e historial de reemplazos', undefined, true),
    post: op('Generar el sticker QR del predio si aún no tiene uno', z.object({}), true),
  },
  '/gestion/visitas': {
    post: op(
      'Registrar una visita (entregó, no entregó o ausente) con sus entregas; idempotente por clave',
      visitInput,
    ),
  },
  '/gestion/visitas/{id}/anular': {
    post: op(
      'Anular una visita y sus entregas sin borrarlas',
      z.object({ motivo: z.string().min(5) }),
      true,
    ),
  },
  '/gestion/resultados/operacion': {
    get: op(
      'Participación, kilos por mes, sector y material, y valorización por actor en un periodo',
    ),
  },
  '/gestion/resultados/visitas': {
    get: op('Visitas que sustentan una cifra de resultados'),
  },
  '/gestion/padron.csv': {
    get: op('Padrón de participantes en el formato MINAM (anexos 03-A a 03-D)'),
  },
  '/gestion/actores': { get: op('Asociaciones de recicladores, EO-RS y planta municipal') },
  '/gestion/valorizacion': {
    get: op('Comprobantes de valorización del periodo'),
    post: op('Registrar toneladas valorizadas con su comprobante', valorizationInput),
  },
  '/gestion/correcciones-mapa': {
    get: op('Correcciones cartográficas vigentes, con autor y motivo'),
    post: op(
      'Ocultar un lugar o edificación inexistente, mover un lugar o agregar una edificación',
      mapCorrectionInput,
    ),
  },
  '/gestion/correcciones-mapa/{id}/anular': {
    post: op('Anular una corrección cartográfica sin borrarla', mapCorrectionAnnul, true),
  },
  '/gestion/entregas/{id}/anular': {
    post: op('Anular sin eliminar el historial', z.object({ motivo: z.string().min(5) }), true),
  },
  '/gestion/reportes': {
    get: {
      ...op('Eventos no anulados agrupados por servicio, material y unidad'),
      parameters: [
        { in: 'query', name: 'desde', required: true, schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'hasta', required: true, schema: { type: 'string', format: 'date' } },
      ],
    },
  },
  '/gestion/importaciones/columnas': {
    post: op(
      'Inspeccionar estructura CSV; solo administración',
      z.object({ contenido: z.string().max(700000), separador: z.enum([',', ';', '\t']) }),
    ),
  },
  '/gestion/reportes/exportar': {
    get: op('Exportar agregado CSV; registro/administración, sin personas'),
  },
  '/gestion/importaciones/validar': {
    post: op(
      'Validar y guardar staging sin modificar el padrón',
      z.union([
        z
          .object({
            version: z.literal(1),
            sintetico: z.literal(true),
            predios: z.array(predioInput).min(1).max(500),
          })
          .strict(),
        csvInput.extend({ formato: z.literal('csv') }),
      ]),
    ),
  },
  '/gestion/importaciones/{id}/aplicar': {
    post: op(
      'Aplicar lote con decisiones explícitas y versiones comprobadas',
      resolutionsInput,
      true,
    ),
  },
  '/gestion/predios/{id}/archivo': {
    post: op(
      'Archivar/restaurar sin borrar historia; solo administración',
      z.object({
        archivado: z.boolean(),
        motivo: z.string().min(5).max(1000),
        version: z.number().int().positive(),
      }),
      true,
    ),
  },
  '/gestion/predios/{id}/unidades': {
    get: op('Consultar unidades administrativas del predio', undefined, true),
    post: op(
      'Crear unidad/sección con evidencia; registro/administración',
      z.object({
        codigo: z.string().max(60),
        nombre: z.string().max(120),
        tipo: z.enum(['unidad', 'seccion']),
        evidencia: z.string().min(5).max(1000),
      }),
      true,
    ),
  },
  '/gestion/predios/{id}/unidades/{unidad}': {
    patch: {
      ...op(
        'Editar unidad y conservar historia con versión',
        z.object({
          nombre: z.string().max(120),
          evidencia: z.string().min(5).max(1000),
          activa: z.boolean(),
          version: z.number().int().positive(),
        }),
        true,
      ),
      parameters: [
        ...headers,
        id,
        { in: 'path', name: 'unidad', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
    },
  },
};
