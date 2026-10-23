# Simbología municipal y modos de mapa

Implementación del 15 de octubre de 2026. Acceso: http://localhost:8080.

## Uso

**Operativo** es la vista inicial: rutas, calles y símbolos documentales. Seleccionar
una ruta la destaca, atenúa las demás y ajusta el encuadre a la superficie libre
entre paneles. La ficha es inferior y expandible en móvil. La leyenda explica los
marcadores I (inicio), F (fin), círculo (parada) y triángulo (sentido).

**Técnico** permite activar contornos CAD, anotaciones, horarios sin validar,
trazados pendientes y rellenos candidatos de cobertura. Cambiar a Operativo vuelve
a ocultar las capas de revisión. El botón de trazados pendientes abre Técnico.

Los colores de presentación conservan las familias de la leyenda: 1001 azul,
2001 magenta, 2002 naranja y La Primavera turquesa. La Primavera conserva su
estado pendiente; no se declara aprobado su servicio. Los nombres de calles del
proveedor se dibujan sobre las rutas; se añaden rótulos CALLES al acercarse.

## Elementos realmente recuperados

| Elemento                       | Cantidad | Evidencia y tratamiento                                                                             |
| ------------------------------ | -------: | --------------------------------------------------------------------------------------------------- |
| Sentidos                       |      739 | Instancias territoriales del bloque 15C9C, idéntico al ejemplo SENTIDO DE RUTA de la leyenda.       |
| Sentidos leídos de PDF         |      274 | Comercial 84, 2001 145 e institucional 45; ver más abajo.                                           |
| Paradas del plano              |       26 | Círculos en SECT. LA PRIMAVERA, color 1 y radio 2,200545380264521, iguales al símbolo PARADA 2A157. |
| Inicios                        |        4 | Centros de marcadores junto a rótulos explícitos INICIO DE RUTA; parejas de referencias guardadas.  |
| Finales                        |        3 | Centros de marcadores junto a rótulos FIN DE RUTA; parejas de referencias guardadas.                |
| Calles                         |      496 | Textos territoriales de la capa CALLES.                                                             |
| Tiempos sin validar            |      406 | Anotaciones con formato de hora, conservadas como textos sin asignación de horario operativo.       |
| Símbolos por interpretar       |       32 | Dos líneas FLECHA sin punta y 30 geometrías HORARIO 2002.                                           |
| Límites de rellenos candidatos |       48 | 47 de RUTA ORGANICO y uno de RUTAS bagua; solo contornos discontinuos en Técnico.                   |

Se excluyeron dos flechas y una parada situadas en la leyenda. Un texto PARADA en
DESC-USOS no se convirtió en parada de recolección. Ningún número aislado se
interpretó automáticamente como parada, secuencia o tiempo. No se creó recorrido
para 1007.

La orientación se calcula desde el punto medio del lado corto del triángulo hacia
su punta. Se exige un triángulo con lado base inequívocamente más corto y la
referencia al bloque contrastado con la leyenda. No interviene el orden de los
vértices de las rutas. La orientación se transforma a norte geográfico para el
marcador, conservando base y punta UTM para revisar el cálculo.

La asociación a una ruta se realiza únicamente con distancia al trazo ≤12 m y
separación respecto a la segunda alternativa ≥5 m. Esta regla espacial se declara
en cada ficha: no es una asignación de servicio aprobada. De las 739 flechas,
311 se asocian espacialmente a 1001, 46 a 2001, 235 a 2002 y 116 a La Primavera;
31 permanecen sin asociación. De las 26 paradas, 24 se asocian a La Primavera y
dos quedan sin asociación. Estas últimas pueden consultarse en la vista general.
Al seleccionar una ruta solo aparecen los símbolos asociados a ese trazo.

**Sentidos leídos de los planos PDF (16 de octubre).** Los PDF dibujan el sentido con
polígonos rellenos que el DWG no contiene como bloques. Se sitúan con la matriz
PDF→CAD ya validada de cada plano, se orientan de la base al vértice-punta y solo se
conservan si caen a ≤3 m del trazo de su ruta (≤6 m en la institucional). Ninguno
se deduce del orden de vértices.

| Plano PDF                    | Ruta              | Flechas | Evidencia                                                                                                         |
| ---------------------------- | ----------------- | ------: | ----------------------------------------------------------------------------------------------------------------- |
| RUTA DE RECICLAJE COMERCIAL  | MUN-COMERCIAL     |      84 | Triángulos verdes del color de la ruta; RMS de registro 0,059 m.                                                  |
| RUTA DE RECICLAJE-A0         | MUN-2001          |     145 | Triángulos morado oscuro (100,33,101) sobre el trazo; RMS 0,063 m. Elevan las flechas de 2001 de 46 a 191.        |
| RUTA INSTITUCIONAL (Tomaque) | MUN-INSTITUCIONAL |      45 | Puntas de flecha verde oscuro; 47 de 47 apuntan en el sentido de dibujo de su trazo. Trasladadas +3,589/+2,352 m. |

Quedaron fuera 7 triángulos del A0 a 3,1–6,7 m del trazo de 2001 y 2 puntas del
institucional sin vértice-punta inequívoco; constan en `audit.excluded`. Un símbolo
del PDF que ya existe como bloque en el DWG para la misma ruta no se duplica.

Siguen **sin flechas** la orgánica (sus flechas del DWG pertenecen a capas de
1001/2002) y la capa RUTAS: ninguna fuente trae símbolos de sentido propios para ellas.
La ruta institucional es lo que el PDF dibuja: seis fragmentos en cuatro ventanas
(una por parada), no un itinerario continuo. No se inventan conexiones.

Las flechas se muestran desde zoom 13, con colisión de etiquetas para evitar
saturación. Calles CAD desde 15,5 y tiempos desde 17. No todos los símbolos se
dibujan simultáneamente en cualquier escala. Los conteos de leyenda corresponden
al conjunto disponible, no al número de símbolos en pantalla.

## Cobertura: lo que sigue sin confirmarse

En RUTAS CON TIEMPO los colores de muestra de áreas 241 (2001), 61 (1001) y 9
(2002) aparecen únicamente en las dos leyendas. Se inspeccionaron también las
cachés de los otros cuatro DWG: aparecen 48 límites HATCH territoriales con
colores coincidentes en Orgánico y RUTAS bagua. La coincidencia de color no prueba
su significado ni vigencia. No se reconstruyeron huecos, unieron rellenos,
generaron buffers ni envolventes para inventar coberturas. No se halló un límite
territorial inequívoco de cobertura 2001 bajo esta evidencia.

Los 48 candidatos se almacenan como revisión y se muestran **sin relleno**, con
archivo/capa/referencia y advertencia en la ficha. La geometría válida no equivale
a una interpretación semántica confirmada. También siguen pendientes los
horarios, el servicio/vigencia de varias rutas y la aprobación en terreno de
inicios, fines y paradas. Georreferenciación y vigencia operativa son estados distintos.

## Persistencia y reproducción

No se repitió DWG→DXF ni se sustituyeron rutas, predios o staging CAD. Se reutilizaron
las entidades expandidas existentes. La migración 003 añade municipal_cartography,
separada de cad_features y de puntos_recoleccion. Guarda geometría original UTM,
geometría de representación, validez, referencias, interpretación y hash del paquete.
Solo se publican geometrías válidas. No crea paradas operativas en la tabla de negocio.

```powershell
npm run gis:cartography
docker compose build backend frontend
docker compose up -d --no-deps --wait backend frontend
npm run db:migrate
npm run import:cartography
```

La importación es transaccional y reemplaza únicamente interpretaciones generadas
de esta entrega en municipal_cartography. No elimina datos municipales originales
ni registros operativos. No ejecutar nuevamente la conversión completa para esta
actualización. Los datos son locales y están excluidos de Git como el resto del
paquete municipal.

- Script: scripts/gis/cartography.py.
- Paquete: database/municipal/cartography.json.
- Auditoría: data/cad/extracted/cartography-audit.json.
- API PostGIS: /api/municipal/cartografia, documentada en Swagger.
- Evidencia visual: artifacts/screenshots/*-operativo.png y *-tecnico.png.
- Pruebas: tests/e2e/cartography.spec.ts y suites previas de territorio.

## Verificación final

`npm run check` aprobado: TypeScript, ESLint, Prettier, 17 pruebas unitarias y compilaciones. Playwright: 22 pruebas funcionales aprobadas, 8 repeticiones de integridad omitidas en tablet/móvil. Se verificó selección y encuadre de ruta, flechas renderizadas, cambio Operativo/Técnico, capas, fichas y CRUD existente. Los 12 originales coinciden con sus SHA-256 del inventario.
