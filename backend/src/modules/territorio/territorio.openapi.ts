const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const uuid = { type: 'string', format: 'uuid' };
const response = (description: string, schema?: object) => ({
  description,
  ...(schema ? { content: json(schema) } : {}),
});
const errors = {
  '400': response('Entrada inválida, polígono inválido o ruta incompatible con el servicio'),
  '404': response('Predio inexistente'),
  '409': response('Código duplicado o versión desactualizada: recargar antes de editar'),
};
const filterParameters = ['q', 'servicio', 'ruta', 'sector'].map((name) => ({
  name,
  in: 'query',
  required: false,
  description:
    name === 'q'
      ? 'Búsqueda parcial por código, dirección o persona (máximo 120 caracteres)'
      : `UUID de ${name}`,
  schema: name === 'q' ? { type: 'string', maxLength: 120 } : uuid,
}));
const body = (name: string) => ({ required: true, content: json(ref(name)) });
const featureCollection = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['FeatureCollection'] },
    features: { type: 'array', items: { type: 'object' } },
  },
};

export const territorioSchemas = {
  Polygon: {
    type: 'object',
    required: ['type', 'coordinates'],
    description:
      'GeoJSON Polygon EPSG:4326 [longitud, latitud]. Anillos cerrados, 4 a 250 posiciones, geometría válida y superficie mayor a 1 m². Ámbito provisional: [-78.552,-5.662,-78.512,-5.616].',
    properties: {
      type: { type: 'string', enum: ['Polygon'] },
      coordinates: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: {
          type: 'array',
          minItems: 4,
          maxItems: 250,
          items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
        },
      },
    },
  },
  PersonaVinculada: {
    type: 'object',
    required: ['nombre', 'vinculo'],
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 2, maxLength: 120 },
      vinculo: {
        type: 'string',
        enum: ['Propietario', 'Ocupante', 'Responsable', 'Contribuyente', 'Otro'],
      },
    },
  },
  Asignacion: {
    type: 'object',
    required: ['servicioId', 'rutaId'],
    additionalProperties: false,
    properties: { servicioId: uuid, rutaId: { ...uuid, nullable: true } },
  },
  PredioInput: {
    type: 'object',
    required: ['codigo', 'direccion', 'sectorId', 'geometry'],
    properties: {
      codigo: {
        type: 'string',
        minLength: 3,
        maxLength: 40,
        pattern: '^[A-Za-z0-9-]+$',
        example: 'DEMO-025',
      },
      direccion: { type: 'string', minLength: 3, maxLength: 200 },
      sectorId: uuid,
      observaciones: { type: 'string', maxLength: 1000, default: '' },
      geometry: ref('Polygon'),
      personas: { type: 'array', maxItems: 10, items: ref('PersonaVinculada'), default: [] },
      servicios: { type: 'array', maxItems: 10, items: ref('Asignacion'), default: [] },
    },
  },
  PredioUpdate: {
    allOf: [
      ref('PredioInput'),
      {
        type: 'object',
        required: ['version'],
        properties: { version: { type: 'integer', minimum: 1 } },
      },
    ],
  },
  Predio: {
    allOf: [
      ref('PredioInput'),
      {
        type: 'object',
        properties: {
          id: uuid,
          sector: { type: 'string' },
          isDemo: { type: 'boolean' },
          version: { type: 'integer' },
          areaM2: { type: 'number' },
          updatedAt: { type: 'string', format: 'date-time' },
          servicios: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                servicioId: uuid,
                rutaId: { ...uuid, nullable: true },
                nombre: { type: 'string' },
                color: { type: 'string' },
                ruta: { type: 'string', nullable: true },
                codigoRuta: { type: 'string', nullable: true },
                horario: { type: 'string', nullable: true },
                frecuencia: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    ],
  },
};

export const territorioPaths = {
  '/catalogos': {
    get: {
      tags: ['Territorio DEMO'],
      summary: 'Servicios, rutas y sectores disponibles',
      responses: {
        '200': response('Catálogos', {
          type: 'object',
          properties: {
            servicios: { type: 'array', items: { type: 'object' } },
            rutas: { type: 'array', items: { type: 'object' } },
            sectores: { type: 'array', items: { type: 'object' } },
          },
        }),
      },
    },
  },
  '/capas': {
    get: {
      tags: ['Territorio DEMO'],
      summary: 'Capas GeoJSON de rutas, puntos y sectores',
      description:
        'Aplica filtros espaciales y de servicio/ruta. q no se utiliza para estas capas.',
      parameters: filterParameters.filter((p) => p.name !== 'q'),
      responses: {
        '200': response('Capas EPSG:4326', {
          type: 'object',
          properties: {
            rutas: featureCollection,
            puntos: featureCollection,
            sectores: featureCollection,
          },
        }),
        '400': errors['400'],
      },
    },
  },
  '/predios': {
    get: {
      tags: ['Predios DEMO'],
      summary: 'Buscar y filtrar predios',
      description:
        'Máximo 1000 elementos; total informa el número de coincidencias. Los filtros se combinan con AND.',
      parameters: filterParameters,
      responses: {
        '200': response('Predios encontrados', {
          type: 'object',
          properties: {
            items: { type: 'array', items: ref('Predio') },
            total: { type: 'integer' },
            limit: { type: 'integer', example: 1000 },
          },
        }),
        '400': errors['400'],
      },
    },
    post: {
      tags: ['Predios DEMO'],
      summary: 'Crear predio y asociaciones en una transacción',
      description:
        'Todos los registros creados en esta fase se marcan DEMO. No envíes campos adicionales.',
      requestBody: body('PredioInput'),
      responses: { '201': response('Predio creado', ref('Predio')), ...errors },
    },
  },
  '/predios/{id}': {
    parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
    get: {
      tags: ['Predios DEMO'],
      summary: 'Ficha del predio con personas, servicios, rutas y horarios',
      responses: {
        '200': response('Ficha', ref('Predio')),
        '400': errors['400'],
        '404': errors['404'],
      },
    },
    put: {
      tags: ['Predios DEMO'],
      summary: 'Reemplazar datos y asociaciones del predio',
      description:
        'Exige la versión leída previamente. Una versión antigua produce 409 sin sobrescribir cambios.',
      requestBody: body('PredioUpdate'),
      responses: { '200': response('Predio actualizado', ref('Predio')), ...errors },
    },
    delete: {
      tags: ['Predios DEMO'],
      summary: 'Eliminar un predio y sus asociaciones',
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: ['version'],
          properties: { version: { type: 'integer', minimum: 1 } },
        }),
      },
      responses: { '204': response('Predio eliminado'), ...errors },
    },
  },
};
