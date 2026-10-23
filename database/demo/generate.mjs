import { readFileSync, writeFileSync } from 'node:fs';
const streets = JSON.parse(
  readFileSync(new URL('./streets.geojson', import.meta.url), 'utf8').replace(/^\uFEFF/, ''),
);
const id = (group, n) => `00000000-0000-4000-8000-${String(group * 100 + n).padStart(12, '0')}`;
const polygon = (x1, y1, x2, y2) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1],
    ],
  ],
});
const servicios = ['Convencional', 'Orgánicos', 'Aprovechables'].map((nombre, i) => ({
  id: id(1, i + 1),
  nombre,
  color: ['#3b6ca8', '#388468', '#b37b31'][i],
}));
const sectores = [
  {
    id: id(2, 1),
    nombre: 'Centro oeste · DEMO',
    geometry: polygon(-78.542, -5.644, -78.536, -5.63),
  },
  {
    id: id(2, 2),
    nombre: 'Centro este · DEMO',
    geometry: polygon(-78.536, -5.644, -78.528, -5.63),
  },
];
const routes = [streets.features[0], streets.features[1], streets.features[2]];
const slices = [
  [3, 10],
  [5, 13],
  [0, 8],
];
const rutas = routes.map((street, i) => ({
  id: id(3, i + 1),
  codigo: `R-DEMO-0${i + 1}`,
  nombre: `${street.properties.name} · DEMO`,
  servicioId: servicios[i].id,
  horario: ['06:00 – 09:00', '08:00 – 10:00', '15:00 – 17:00'][i],
  frecuencia: ['Lunes, miércoles y viernes', 'Martes y jueves', 'Sábados'][i],
  geometry: { type: 'LineString', coordinates: street.geometry.coordinates.slice(...slices[i]) },
}));
const predios = [];
const puntos = [];
for (const [i, ruta] of rutas.entries()) {
  const coords = ruta.geometry.coordinates;
  puntos.push({
    id: id(4, i * 2 + 1),
    nombre: `Punto ${i * 2 + 1} · DEMO`,
    rutaId: ruta.id,
    geometry: { type: 'Point', coordinates: coords[1] },
  });
  puntos.push({
    id: id(4, i * 2 + 2),
    nombre: `Punto ${i * 2 + 2} · DEMO`,
    rutaId: ruta.id,
    geometry: { type: 'Point', coordinates: coords.at(-2) },
  });
  for (let n = 0; n < 8; n++) {
    const a = coords[Math.min(Math.floor(n / 2) + 1, coords.length - 2)];
    const b = coords[Math.min(Math.floor(n / 2) + 2, coords.length - 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / length,
      uy = (b[1] - a[1]) / length;
    const side = n % 2 === 0 ? 1 : -1;
    const cx = (a[0] + b[0]) / 2 - uy * 0.00019 * side,
      cy = (a[1] + b[1]) / 2 + ux * 0.00019 * side;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([along, across]) => [
      +(cx + along * ux * 0.000105 - across * uy * 0.0001).toFixed(7),
      +(cy + along * uy * 0.000105 + across * ux * 0.0001).toFixed(7),
    ]);
    corners.push(corners[0]);
    const serial = i * 8 + n + 1;
    predios.push({
      codigo: `DEMO-${String(serial).padStart(3, '0')}`,
      direccion: `${routes[i].properties.name} ${100 + n * 12} · dirección DEMO`,
      sectorId: cx < -78.536 ? sectores[0].id : sectores[1].id,
      observaciones:
        'Geometría y datos ficticios para validación del sistema. No representan catastro ni cobertura municipal.',
      geometry: { type: 'Polygon', coordinates: [corners] },
      personas: [
        {
          nombre: `Persona de prueba ${String(serial).padStart(2, '0')} · DEMO`,
          vinculo: ['Ocupante', 'Responsable', 'Propietario', 'Contribuyente'][n % 4],
        },
      ],
      servicios: [{ servicioId: servicios[i].id, rutaId: ruta.id }],
    });
  }
}
writeFileSync(
  new URL('./seed.json', import.meta.url),
  JSON.stringify({ servicios, sectores, rutas, puntos, predios }, null, 2) + '\n',
);
console.log('Fixture DEMO generado: 24 predios, 3 rutas, 6 puntos y 2 sectores.');
