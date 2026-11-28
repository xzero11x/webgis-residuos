"""Excel de ejemplo del padrón (anexo 03-A, reciclables en viviendas) para probar el importador.

DATOS SINTÉTICOS: nombres de las listas de la simulación y DNI del bloque ficticio 9xxxxxxx. Imita
cómo suele llegar un padrón municipal: títulos encima de la tabla, mayúsculas, «N°» en la dirección,
DNI guardado como número (Excel borra el cero inicial) y algunos errores para corregir en pantalla.

  .venv-gis/Scripts/python scripts/bagua-master/ejemplo_padron.py
"""
import json
import random
import subprocess
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/bagua-master/simulacion/padron-reciclables-03A-ejemplo.xlsx'
NOMBRES = ['Elmer', 'Rosa', 'Wilmer', 'Gladys', 'Nilton', 'Yolanda', 'Hernán', 'Marleny', 'Segundo', 'Doris',
           'Teodoro', 'Flor', 'Julio', 'Milagros', 'Walter', 'Nelly', 'Edwin', 'Carmen', 'Santos', 'Luz']
APELLIDOS = ['Vásquez', 'Díaz', 'Guevara', 'Tapia', 'Huamán', 'Mego', 'Delgado', 'Cubas', 'Montenegro', 'Saldaña',
             'Rimarachín', 'Tantaleán', 'Idrogo', 'Burga', 'Julca', 'Llatas', 'Olano', 'Requejo', 'Fustamante', 'Ushiñahua']


def query(sql):
    out = subprocess.run(['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
                          'exec psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
                         cwd=ROOT, input=f"SELECT coalesce(json_agg(t),'[]') FROM ({sql}) t;", text=True,
                         capture_output=True, encoding='utf8', check=True).stdout
    return json.loads(out.strip())


def shout(address):
    """«Jr. Amazonas 345» → «JR. AMAZONAS N° 345», como en muchas hojas municipales."""
    head, _, number = address.rpartition(' ')
    return f'{head.upper()} N° {number}' if number.isdigit() else address.upper()


def cell(ref, value):
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'


def write_xlsx(path, rows):
    letters = 'ABCDEFGHIJ'
    sheet_rows = []
    for r, row in enumerate(rows, start=1):
        cells = ''.join(cell(f'{letters[c]}{r}', v) for c, v in enumerate(row) if v not in (None, ''))
        sheet_rows.append(f'<row r="{r}">{cells}</row>')
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             f'<sheetData>{"".join(sheet_rows)}</sheetData></worksheet>')
    parts = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '</Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>',
        'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Padrón 03-A" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '</Relationships>',
        'xl/worksheets/sheet1.xml': sheet,
    }
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, text in parts.items():
            z.writestr(name, text)


def main():
    rng = random.Random(2026112703)
    # Viviendas reales de la simulación que aún no están en reciclables: deben reconocerse, no duplicarse.
    existing = query("""SELECT p.direccion, p.sector FROM gestion.predio p
      WHERE p.codigo LIKE 'BG-%' AND p.uso='Casa habitación' AND p.direccion ~ ' [0-9]+$'
        AND NOT EXISTS (SELECT 1 FROM gestion.participacion a JOIN gestion.servicio s ON s.id=a.servicio_id
                        WHERE a.predio_id=p.id AND s.codigo='SIM-RECICLABLES')
      ORDER BY p.codigo LIMIT 24""")
    # Números nuevos en calles con vecinos conocidos: se ubican por interpolación.
    neighbours = query("""SELECT regexp_replace(direccion,' [0-9]+(-[A-Z]+)?$','') AS calle, sector,
        min((regexp_match(direccion,' ([0-9]+)$'))[1]::int) AS lo, max((regexp_match(direccion,' ([0-9]+)$'))[1]::int) AS hi
      FROM gestion.predio WHERE codigo LIKE 'BG-%' AND direccion ~ ' [0-9]+$' GROUP BY 1,2
      HAVING count(*) >= 4 ORDER BY count(*) DESC LIMIT 12""")
    used_dni = {r['documento'] for r in query("SELECT documento FROM gestion.persona WHERE documento IS NOT NULL")}

    def dni():
        while True:
            v = f'9{rng.randint(0, 9_999_999):07d}'
            if v not in used_dni:
                used_dni.add(v)
                return v

    def person():
        return f'{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)} {rng.choice(APELLIDOS)}'

    rows = []
    for e in existing:
        rows.append([shout(e['direccion']), person().upper(), int(dni()), rng.randint(2, 7), e['sector']])
    for n in neighbours:
        number = rng.randint(n['lo'] + 2, max(n['lo'] + 3, n['hi'] - 2))
        rows.append([f"{n['calle']} {number}", person(), dni(), rng.randint(1, 8), n['sector']])
    # Problemas típicos para corregir en pantalla.
    rows.append(['JR. GRAU S/N', person(), dni(), 4, 'Cercado'])                    # sin número de puerta
    rows.append(['Calle Los Girasoles 120', person(), dni(), 3, 'Nueva Esperanza'])  # calle desconocida
    rows.append([shout(existing[0]['direccion']).replace('N°', 'NRO.') + '-A', '', dni(), 5, 'Cercado'])  # sin nombre
    twin = dni()
    rows.append([f"{neighbours[0]['calle']} {neighbours[0]['lo'] + 1}", 'Rosa Mego Díaz', twin, 0, neighbours[0]['sector']])  # 0 habitantes
    rows.append([f"{neighbours[1]['calle']} {neighbours[1]['lo'] + 3}", 'Kevin Julca Saldaña', twin, 4, neighbours[1]['sector']])  # DNI repetido
    rows.append([f"{neighbours[2]['calle']} {neighbours[2]['lo'] + 5}", 'Luz Tapia Cubas', int('0' + dni()[1:]) , 6, neighbours[2]['sector']])  # 7 cifras
    rng.shuffle(rows)
    sheet = [
        ['MUNICIPALIDAD PROVINCIAL DE BAGUA'],
        ['GERENCIA DE GESTIÓN AMBIENTAL'],
        ['PADRÓN DE PARTICIPANTES DEL PROGRAMA DE SEGREGACIÓN EN LA FUENTE Y RECOLECCIÓN SELECTIVA'],
        ['Anexo N.° 03-A · Residuos sólidos inorgánicos aprovechables · Viviendas'],
        [],
        ['N°', 'CÓDIGO', 'DIRECCIÓN', 'NOMBRE Y APELLIDO DEL REPRESENTANTE', 'DNI', 'N° HABITANTES', 'ZONA / SECTOR'],
    ] + [[i + 1, '', *r[:2], r[2], r[3], r[4]] for i, r in enumerate(rows)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    write_xlsx(OUT, sheet)
    print(f'{OUT.relative_to(ROOT)} · {len(rows)} filas (datos sintéticos)')


if __name__ == '__main__':
    main()
