import { useState } from 'react';
import { Link } from 'react-router-dom';
import './ayuda.css';

// Manual corto dentro de la aplicación: qué hace cada persona, en pasos, con enlaces directos. Para
// que la Gerencia opere sola y para capacitar en la calle, no en el aula.

const ROLES = [
  {
    id: 'chofer',
    titulo: 'Chofer',
    resumen: 'Tres botones en el celular. No hay que escribir nada.',
    pasos: [
      ['Abre Campo › Ruta del vehículo y elige tu ruta de hoy.', '/bagua-master/campo/ruta'],
      ['Al salir del garaje toca «Salí».', null],
      [
        'En cada punto de control toca «Pasé por aquí». Si pasaste por otro, usa «Pasé por otro punto».',
        null,
      ],
      [
        'En el relleno toca «Llegué al relleno». Si haces otro viaje, sigue marcando los puntos.',
        null,
      ],
      ['Si algo falla (avería, lluvia, calle bloqueada) toca «Reportar un problema».', null],
    ],
    nota: 'Sin señal también funciona: lo marcado se guarda en el teléfono y se envía solo cuando vuelve la conexión. Arriba verás «Todo enviado» o cuántos registros esperan.',
  },
  {
    id: 'promotor',
    titulo: 'Promotor o reciclador',
    resumen: 'El recorrido del día, ordenado por hora, y la visita en uno o dos toques.',
    pasos: [
      ['Abre Campo, elige Orgánicos o Reciclables y la fecha.', '/bagua-master/campo'],
      [
        'En cada puerta toca «Entregó» (con material y kilos si pesas), «No entregó» o «Ausente».',
        null,
      ],
      [
        'Con el sticker en la puerta, toca «Escanear sticker QR»: la visita queda con origen QR.',
        null,
      ],
      ['¿Te equivocaste? Toca «Corregir» y vuelve a registrar.', null],
      [
        'Para un vecino nuevo toca «Inscribir vecino»: marca la casa en el mapa, nombre, DNI, programa y su autorización.',
        null,
      ],
    ],
    nota: 'El recorrido queda guardado en el teléfono. Las visitas sin señal aparecen como «por enviar» y se envían solas.',
  },
  {
    id: 'oficina',
    titulo: 'Técnico de la Gerencia',
    resumen: 'Pesaje, avisos, programación, padrón y comprobantes.',
    pasos: [
      [
        'Cada mañana registra los tickets de balanza del día anterior en Operación › Pesaje.',
        '/bagua-master/operacion?vista=pesaje',
      ],
      [
        'Ante un feriado, una avería o un cambio, publica el aviso en Operación › Avisos: lo ven el vecino, el chofer y el promotor.',
        '/bagua-master/operacion?vista=avisos',
      ],
      [
        'Para cambiar días u horarios usa Operación › Programación: pide motivo y publica el aviso al vecino.',
        '/bagua-master/operacion?vista=programacion',
      ],
      [
        'Cuando llegue el Excel del padrón, cárgalo en Administración › Cargar padrón: valida fila por fila y deja corregir.',
        '/bagua-master/administracion?vista=padron',
      ],
      [
        'Registra cada factura o registro de planta en Servicios › Recicladores y valorización.',
        '/bagua-master/servicios',
      ],
    ],
    nota: 'Todo cambio queda con tu nombre, la fecha y el motivo. Nada se borra: se anula o se revierte con motivo.',
  },
  {
    id: 'supervisor',
    titulo: 'Supervisor y gerente',
    resumen: 'Cómo va el servicio hoy, la semana y el mes, y los reportes oficiales.',
    pasos: [
      [
        'Mira Operación › Hoy cada mañana: rutas en curso, terminadas, con problema y lo que falta pesar.',
        '/bagua-master/operacion',
      ],
      [
        'Atiende primero el recuadro «Atención»: sin salida, atrasos, rutas que no salieron y tickets pendientes.',
        null,
      ],
      [
        'Revisa el cumplimiento por ruta (30 o 90 días) en Operación › Cumplimiento.',
        '/bagua-master/operacion?vista=cumplimiento',
      ],
      [
        'A inicio de mes cierra el mes anterior en Resultados › Cierre del mes: revisa los pendientes y ciérralo.',
        '/bagua-master/resultados?vista=cierre',
      ],
      [
        'Descarga el reporte para SIGERSOL y abre el resumen para el concejo desde el mismo mes.',
        null,
      ],
    ],
    nota: 'Un mes cerrado ya no cambia. Si hay que corregir algo, se reabre con motivo y queda registrado.',
  },
  {
    id: 'vecino',
    titulo: 'Atención al vecino',
    resumen: '«¿Cuándo pasa el camión?» en segundos.',
    pasos: [
      [
        'En Explorar busca la dirección o toca la casa en el mapa: la ficha dice qué servicio pasa, qué días y a qué hora.',
        '/bagua-master',
      ],
      [
        'Si hay recorridos registrados, la hora es la habitual (la real), no solo la programada.',
        null,
      ],
      [
        'El vecino con sticker puede escanear el QR de su puerta y ver lo mismo, con los avisos del servicio.',
        null,
      ],
    ],
    nota: 'El QR no lleva datos personales: solo un código que abre el horario de ese punto.',
  },
] as const;

const FAQ = [
  [
    '¿Qué pasa si se va la señal?',
    'El chofer y el promotor pueden seguir registrando. Los registros se guardan en el teléfono y se envían solos al volver la conexión; el servidor no los duplica aunque lleguen dos veces.',
  ],
  [
    '¿Cómo se corrige un error?',
    'Una visita se corrige desde Campo; un ticket o un aviso se anulan con motivo; una carga del padrón se revierte mientras no tenga visitas; un mes cerrado se reabre con motivo. Todo queda en la auditoría.',
  ],
  [
    '¿Qué datos personales se guardan y quién los ve?',
    'Nombre, DNI y dirección del representante, solo para el programa (Ley 29733). El perfil de consulta no ve personas; los documentos se muestran enmascarados; el QR y el mapa público no llevan datos personales.',
  ],
  [
    '¿De dónde sale la hora habitual de paso?',
    'De lo que marca el chofer en los puntos de control: es la hora programada más el atraso típico de las últimas ocho semanas en el punto más cercano. Con menos de tres recorridos se muestra la hora programada.',
  ],
  [
    '¿Qué es lo que dice «Demostración · datos sintéticos»?',
    'En este servidor los predios, personas, visitas y toneladas son simulados para mostrar el producto. Cuando se carguen los datos reales, en el servidor oficial, ese distintivo no aparece.',
  ],
] as const;

export function AyudaPage() {
  const [role, setRole] = useState<string>('chofer');
  const current = ROLES.find((r) => r.id === role) ?? ROLES[0];
  return (
    <div className="pr-page pr-embed">
      <div className="pr-container">
        <header className="pr-page-head">
          <div>
            <p className="pr-eyebrow">Ayuda</p>
            <h1>Cómo se usa WEBGIS BAGUA</h1>
            <p>Lo que hace cada persona, en pocos pasos. Toca tu rol.</p>
          </div>
        </header>
        <div className="pr-toolbar">
          <div className="pr-segmented ay-roles" role="group" aria-label="Rol">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={role === r.id}
                onClick={() => setRole(r.id)}
              >
                {r.titulo}
              </button>
            ))}
          </div>
        </div>
        <section className="pr-card pr-card-pad ay" aria-labelledby="ay-rol">
          <h2 id="ay-rol">{current.titulo}</h2>
          <p className="ay-resumen">{current.resumen}</p>
          <ol className="ay-pasos">
            {current.pasos.map(([texto, link]) => (
              <li key={texto}>
                {texto}
                {link && (
                  <>
                    {' '}
                    <Link to={link}>Ir ahí</Link>
                  </>
                )}
              </li>
            ))}
          </ol>
          <p className="ay-nota">{current.nota}</p>
        </section>
        <section
          className="pr-card pr-card-pad ay"
          style={{ marginTop: 20 }}
          aria-labelledby="ay-faq"
        >
          <h2 id="ay-faq">Preguntas frecuentes</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="ay-faq">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}
