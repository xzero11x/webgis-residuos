import { territorioPaths, territorioSchemas } from '../modules/territorio/territorio.openapi.js';

const healthSchema = {
  type: 'object',
  required: ['status', 'service', 'timestamp'],
  properties: {
    status: { type: 'string', enum: ['ok'] },
    service: { type: 'string', example: 'bagua-webgis-api' },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

const readinessSchema = (status: 'ok' | 'unavailable') => ({
  ...healthSchema,
  required: [...healthSchema.required, 'database', 'postgis'],
  properties: {
    ...healthSchema.properties,
    status: { type: 'string', enum: [status] },
    database: { type: 'string', enum: [status] },
    postgis: { type: 'string', enum: [status] },
  },
});

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Bagua WebGIS · API',
    version: '0.3.0',
    description:
      'Versión funcional local con información DEMO y modelo provisional. /health comprueba el proceso; /ready verifica PostgreSQL y PostGIS. Autenticación pendiente de una fase posterior.',
  },
  servers: [{ url: '/api', description: 'Mismo origen mediante Vite o Nginx' }],
  tags: [{ name: 'Infraestructura' }, { name: 'Territorio DEMO' }, { name: 'Predios DEMO' }],
  components: { schemas: territorioSchemas },
  paths: {
    ...territorioPaths,
    '/municipal/cad-inventario': {
      get: {
        tags: ['Archivo municipal'],
        summary: 'Inventario por DWG y capa, geometrías y estado de georreferenciación',
        responses: { 200: { description: 'Capas y auditoría de los seis DWG' } },
      },
    },
    '/municipal/cad-revision': {
      get: {
        tags: ['Archivo municipal'],
        summary: 'Geometrías originales para revisión técnica por archivo y capa',
        parameters: [
          { in: 'query', name: 'archivo', required: true, schema: { type: 'string' } },
          { in: 'query', name: 'capa', required: true, schema: { type: 'string' } },
          {
            in: 'query',
            name: 'bbox',
            required: true,
            schema: { type: 'string' },
            description: 'Oeste,sur,este,norte; ventana máxima 0.03 grados',
          },
        ],
        responses: {
          200: {
            description:
              'GeoJSON, máximo 8000 elementos; truncated indica si es necesario acercar el mapa. Textos privados omitidos.',
          },
          400: { description: 'Ventana ausente o inválida' },
        },
      },
    },
    '/municipal/cartografia': {
      get: {
        tags: ['Archivo municipal'],
        summary: 'Símbolos, calles y candidatos documentales conservados en PostGIS',
        responses: {
          200: {
            description:
              'GeoJSON con estado documental, procedencia, orientación del símbolo y auditoría. No acredita vigencia operativa.',
          },
        },
      },
    },
    '/bagua-master/resumen': {
      get: {
        tags: ['BAGUA MASTER'],
        summary: 'Versión de Overture, conjuntos descargados y conteos (módulo independiente)',
        description:
          'Solo existe con BAGUA_MASTER_ENABLED=true. Datos exclusivos de Overture Maps 2026-09-23.1; sin rutas, predios ni catastro.',
        responses: { 200: { description: 'Versión, inventario y alturas publicadas' } },
      },
    },
    '/bagua-master/elementos/{tabla}/{id}': {
      get: {
        tags: ['BAGUA MASTER'],
        summary: 'Atributos reales de un elemento de Overture',
        parameters: [
          {
            name: 'tabla',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: [
                'red_vial',
                'conector',
                'edificio',
                'parte_edificio',
                'uso_suelo',
                'agua',
                'terreno',
                'lugar',
              ],
            },
          },
          { name: 'id', in: 'path', required: true, schema: { type: 'string', maxLength: 64 } },
        ],
        responses: {
          200: {
            description: 'Identificador Overture, tipo, altura solo si existe, fuentes y geometría',
          },
          400: { description: 'Tabla o identificador no válidos' },
          404: { description: 'No existe' },
        },
      },
    },
    '/bagua-master/buscar': {
      get: {
        tags: ['BAGUA MASTER'],
        summary: 'Búsqueda de lugares y calles por nombre (máximo 25, una entrada por calle)',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 2, maxLength: 60 },
          },
        ],
        responses: {
          200: { description: 'Resultados con punto de referencia' },
          400: { description: 'Consulta inválida' },
        },
      },
    },
    '/bagua-master/rutas': {
      get: {
        tags: ['BAGUA MASTER'],
        summary: 'Rutas municipales documentadas: estado, longitud, sectores, fuente y flechas',
        responses: {
          200: { description: 'Fichas de las rutas (sin geometría) y aviso documental' },
        },
      },
    },
    '/bagua-master/rutas/mapa': {
      get: {
        tags: ['BAGUA MASTER'],
        summary: 'Trazos originales, flechas verificadas y marcadores de las rutas (GeoJSON)',
        responses: { 200: { description: 'Tres FeatureCollection: trazos, flechas y marcadores' } },
      },
    },
    '/bagua-master/teselas/bagua-master.pmtiles': {
      get: {
        tags: ['BAGUA MASTER'],
        summary: 'Teselas vectoriales PMTiles (admite cabecera Range)',
        responses: {
          200: { description: 'Archivo completo' },
          206: { description: 'Rango solicitado' },
          416: { description: 'Rango fuera del archivo' },
        },
      },
    },
    '/municipal/resumen': {
      get: {
        tags: ['Archivo municipal'],
        summary: 'Inventario de fuentes, huellas SHA-256 y entidades CAD',
        responses: { '200': { description: 'Fuentes, conteos y procedencia de la importaci�n' } },
      },
    },
    '/municipal/referencias': {
      get: {
        tags: ['Archivo municipal'],
        summary: 'Contornos CAD o anotaciones con CRS expl�cito',
        description:
          'GeoJSON EPSG:4326 del archivo RUTAS CON TIEMPO. No son predios registrados ni horarios confirmados. M�ximo 15000; truncated indica recorte.',
        parameters: [
          {
            name: 'clase',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['lote_cad', 'anotacion_ruta'] },
          },
        ],
        responses: {
          '200': { description: 'FeatureCollection de referencia' },
          '400': { description: 'Clase no v�lida' },
        },
      },
    },
    '/municipal/segunda-pasada': {
      get: {
        tags: ['Archivo municipal'],
        summary: 'Segunda pasada DWG: conteos, auditoría y decisiones pendientes',
        description:
          'Capas de revisión técnica. RUTA TOMAQUE usa el CRS adoptado el 16/10/2026 (traslación medida); los trazos de bloques no insertados son provisionales y no forman parte de las rutas municipales.',
        responses: { '200': { description: 'Huella del paquete, auditoría y conteos por capa' } },
      },
    },
    '/municipal/segunda-pasada/{capa}': {
      get: {
        tags: ['Archivo municipal'],
        summary: 'Capa de la segunda pasada DWG (solo lectura)',
        description:
          'GeoJSON EPSG:4326 con procedencia, nota crs, estado del CRS, traslación aplicada y estado de revisión. Máximo 8000 elementos; truncated indica recorte. etiquetas-lote exige bbox de hasta 0,03°.',
        parameters: [
          {
            name: 'capa',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: [
                'rutas-bloques',
                'puntos-topograficos',
                'manzanas',
                'etiquetas-lote',
                'toponimia',
                'hojas-planos',
                'cotas',
              ],
            },
          },
          {
            name: 'bbox',
            in: 'query',
            required: false,
            description: 'oeste,sur,este,norte en grados',
            schema: { type: 'string', example: '-78.54,-5.64,-78.53,-5.63' },
          },
        ],
        responses: {
          '200': { description: 'FeatureCollection de revisión' },
          '400': { description: 'Capa o bbox no válidos' },
        },
      },
    },
    '/health': {
      get: {
        operationId: 'getHealth',
        summary: 'Disponibilidad del proceso API',
        tags: ['Infraestructura'],
        responses: {
          '200': {
            description: 'API disponible',
            content: { 'application/json': { schema: healthSchema } },
          },
        },
      },
    },
    '/ready': {
      get: {
        operationId: 'getReadiness',
        summary: 'Conectividad con PostgreSQL y extensión PostGIS',
        tags: ['Infraestructura'],
        responses: {
          '200': {
            description: 'Base espacial disponible',
            content: { 'application/json': { schema: readinessSchema('ok') } },
          },
          '503': {
            description: 'Base espacial no disponible',
            content: { 'application/json': { schema: readinessSchema('unavailable') } },
          },
        },
      },
    },
  },
};
