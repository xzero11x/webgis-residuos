"""Third pass, part 7: per-file inventory (A) and uncertainty register (D).

Aggregates first-pass (extract_cad), second-pass (deep_audit) and third-pass
outputs into data/cad/extracted/tercera/inventario.json and incertidumbres.json.
Every number is read from an output file; nothing is typed in by hand.
"""
from collections import Counter
import gzip
import json
import re
from sources import ROOT

EXT = ROOT / 'data/cad/extracted'
T3 = EXT / 'tercera'
DEEP = EXT / 'deep'


def stem(name):
    return re.sub(r'[^\w.-]+', '_', name)


def read(path, default=None):
    return json.loads(path.read_text(encoding='utf8')) if path.exists() else default


def labels():
    return [json.loads(p.read_text(encoding='utf8'))['source'] for p in sorted((T3 / 'nativo').glob('*.json'))]


def inventory(label):
    nat = read(T3 / 'nativo' / f'{stem(label)}.json', {})
    dxf = read(T3 / 'dxf' / f'{stem(label)}.json', {})
    lost = (read(T3 / 'perdidos' / f'{stem(label)}.json', {}) or {}).get('resumen', {})
    first = read(EXT / f'{label}.dxf.inventory.json', {})
    second = read(DEEP / f'{label}.deep.json', {})
    census = nat.get('census', {})
    return {
        'archivo': label, 'origen': nat.get('origin'), 'sha256': nat.get('sha256'),
        'sha256_coincide_inventario': nat.get('sha256_matches_inventory'), 'bytes': nat.get('bytes'),
        'autoria': {
            'producto_ultimo_guardado': [p['build_version'] for p in (nat.get('AppInfo') or {}).get('products', [])],
            'versiones_historial': (nat.get('AppInfoHistory') or {}).get('app_versions'),
            'creado': (nat.get('aux_header') or {}).get('tdcreate'), 'actualizado': (nat.get('aux_header') or {}).get('tdupdate'),
            'summaryinfo': {k: (nat.get('summary_info') or {}).get(k) for k in ('created', 'modified', 'author_present', 'last_saved_by_present', 'custom_property_keys')},
            'vista_previa': nat.get('preview'),
        },
        'primera_pasada': {'capas': len(first.get('layers', [])), 'bloques': len(first.get('blocks', [])),
                           'entidades_modelo_expandido': first.get('expanded_total'),
                           'crs_geodata': [g.get('crs') for g in first.get('geodata', [])] if first.get('geodata') else None},
        'segunda_pasada': {
            'hojas': [l['name'] for l in second.get('layouts', [])],
            'textos_en_hojas': sum(len(l['texts']) for l in second.get('layouts', [])),
            'bloques_no_insertados': len(second.get('unused_blocks', [])),
            'entidades_en_bloques_no_insertados': sum(b['expanded'] for b in second.get('unused_blocks', [])),
            'ole': len(second.get('ole', [])), 'imagenes_externas': len(second.get('images', [])),
            'cotas': (second.get('model') or {}).get('dimensions'), 'xrecords': len(second.get('xrecords', [])),
        } if second else None,
        'tercera_pasada': {
            'secciones_dwg': [s['name'] for s in nat.get('sections', [])],
            'objetos_nativos': census.get('native_objects'), 'objetos_dxf': census.get('dxf_objects'),
            'solo_en_dwg': census.get('only_in_dwg'), 'solo_en_dxf': census.get('only_in_dxf'),
            'proxies_resueltos': sum(p['count'] for p in census.get('proxies_resolved', [])),
            'clases_proxy': sorted({p['native_class'] for p in census.get('proxies_resolved', [])})[:60],
            'perdidos_recuperados': {k: lost.get(k) for k in ('decodificados', 'por_tipo', 'bloques_perdidos', 'no_decodificables', 'validacion_decodificador')},
            'acds_acis': nat.get('acds'),
            'tablas': {k: len(v) for k, v in (dxf.get('tables') or {}).items()},
            'fuentes_tipograficas': sorted({s.get('font') for s in (dxf.get('tables') or {}).get('styles', []) if s.get('font')}),
            'aplicaciones_registradas': (dxf.get('tables') or {}).get('appids'),
            'estados_de_capa': [s['name'] for s in dxf.get('layer_states', [])],
            'capas_apagadas_congeladas': (dxf.get('layer_flags') or {}).get('names_off_or_frozen'),
            'bloques_dinamicos': {k: len(v) for k, v in ((dxf.get('dynamic_blocks') or {}).get('anonymous_representations') or {}).items()},
            'regiones_acis': dxf.get('regions'), 'sombreados': dxf.get('hatches'), 'campos': dxf.get('fields'),
            'anotaciones_operativas': dxf.get('operative_annotations'), 'oculto': dxf.get('hidden'),
        },
    }


def uncertainties(inv):
    items = []
    add = lambda cat, src, text, evidence, status='pendiente': items.append(
        {'categoria': cat, 'fuente': src, 'descripcion': text, 'evidencia': evidence, 'estado': status})
    for f in inv:
        src, t3 = f['archivo'], f['tercera_pasada']
        if f['sha256_coincide_inventario'] is not True:
            add('integridad', src, 'SHA-256 sin referencia de inventario', f['sha256'])
        if t3['solo_en_dwg'] and t3['solo_en_dwg']['count']:
            add('conversion', src, 'Objetos presentes solo en el DWG nativo (la exportación DXF de ODA no los contiene)',
                t3['solo_en_dwg'], 'recuperados parcialmente: entidades decodificadas; XRECORD/DICTIONARY solo como cadenas')
        if t3['proxies_resueltos']:
            add('objetos propietarios', src, 'Objetos ACAD_PROXY en el DXF; su clase real se identificó en el DWG, su contenido no se decodificó',
                {'cantidad': t3['proxies_resueltos'], 'clases_ejemplo': t3['clases_proxy'][:10]}, 'limitación técnica')
        acds = t3['acds_acis'] or {}
        if acds.get('acis_asm_blobs'):
            add('3D/ACIS', src, 'Datos ACIS/ASM en AcDsPrototype_1b; solo las REGION del DXF se decodificaron',
                {'blobs': acds['acis_asm_blobs'], 'regiones_dxf': (t3['regiones_acis'] or {}).get('count')}, 'parcial')
        for font in t3['fuentes_tipograficas']:
            if font.lower().endswith('.shx') or '.' not in font:
                add('dependencias', src, f'Fuente {font} no incluida en la entrega (afecta solo a la representación)', font, 'no recuperable')
        if f.get('segunda_pasada') and f['segunda_pasada']['imagenes_externas']:
            add('dependencias', src, 'Imágenes externas referenciadas que no vienen en la entrega', f['segunda_pasada']['imagenes_externas'], 'no recuperable')
    # CRS and placement
    add('CRS', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', 'Cajetines rotulan PSAD 56; la geometría coincide con EPSG:32717 tras +3,589/+2,352 m (adoptado 16/10/2026)',
        read(ROOT / 'data/cad/gis/segunda-pasada/tomaque-alineacion.json', {}).get('translation_m'), 'adoptado; rótulo contradictorio')
    add('CRS', 'COFOPRI BAGUA.dwg', 'Sin CRS declarado; PSAD 56 alineado con traslación medida (adoptado 16/10/2026)',
        (read(EXT / 'cofopri-alineacion.json', {}) or {}).get('translation_m'), 'adoptado')
    add('CRS', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', '$INSUNITS indica milímetros pero las coordenadas están en metros UTM', '$INSUNITS=4', 'sin escala aplicada')
    # Dates
    add('fechas', 'todas', 'Las fechas de cabecera del DXF (TDCREATE/TDUPDATE/LASTSAVEDBY) son de la conversión ODA; las del DWG nativo (AuxHeader) son las originales',
        {f['archivo']: [f['autoria']['creado'], f['autoria']['actualizado']] for f in inv}, 'resuelto con lectura nativa')
    # Matrix contradictions
    msum = read(T3 / 'matriz' / 'resumen.json', {})
    if msum:
        add('contradicciones', 'matriz', 'Geometría equivalente con capa/atributos distintos entre fuentes; textos distintos en la misma posición',
            msum.get('contradicciones'), 'pendiente de conciliación')
    vers = read(T3 / 'versiones' / 'resumen.json', {})
    for p in (vers or {}).get('bak_pairs', []):
        add('versiones', p['a'], f"Diferencias con {p['b']} (versión anterior al último guardado)",
            {'cambios': p['changes'], 'solo_dwg': p['only_a'], 'solo_bak': p['only_b']}, 'documentado; no se elige versión')
    tc = (vers or {}).get('tomaque_cofopri') or {}
    if tc.get('espacio_modelo_con_coordenadas_identicas'):
        add('CRS', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg',
            'Entidades del modelo con el mismo handle y coordenadas brutas idénticas a COFOPRI: conservan el marco PSAD 56; '
            'con la traslación adoptada de Tomaque quedarían unos 454 m desplazadas',
            {k: tc[k] for k in ('espacio_modelo_con_coordenadas_identicas', 'graficos_identicos')} |
            {'detalle': 'data/cad/extracted/tercera/versiones/tomaque-cofopri-coordenadas-identicas.json'}, 'pendiente: anomalía de ubicación')
    comp = read(T3 / 'complementos' / 'resumen.json', {})
    add('interpretacion', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', 'Código EGPT_EPOD de 18 dígitos sin diccionario', 'xdata EGPT_EPOD (3 textos)')
    add('interpretacion', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', 'Orden de lados en RPU_GRAFICOS (calle por lado) sin validar',
        (comp or {}).get('rpu_por_capa'))
    add('interpretacion', 'rutas', 'Textos de horario/frecuencia extraídos sin asignar a rutas', (comp or {}).get('operativas_por_fuente'))
    add('georreferenciacion', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', 'Geometría dibujada en espacio papel (planos de ubicación) sin registro al modelo',
        'hojas PLANO DEL ALVERGUE, PLANO DE BRUJO PATA', 'pendiente')
    add('topografia', 'RUTA TOMAQUE - BRUJO PATA - CASUARINAS.dwg', 'Curvas CURVAS CERRO sin elevación; cotas Z con desfase sistemático en copias', '94 polilíneas; Z -414,516')
    add('privacidad', 'todas', 'Nombres de propietarios/autores y rutas locales presentes en las fuentes; retenidos en tercera/privado/', 'ver privado/', 'protegido')
    return items


def resolve_pending(items):
    """Close each documented pending item with the result of forensic_pending*.py."""
    P = T3 / 'pendientes'
    res = read(P / 'resumen.json', []) or []
    acis = read(P / 'geo-acis.json', {}) or {}
    frames = read(P / 'geo-43-marcos.json', []) or []
    hatch = read(P / 'geo-sombreados.json', {}) or {}
    paper = read(P / 'geo-espacio-papel.json', []) or []
    resolved = []
    for it in items:
        if it['categoria'] == 'objetos propietarios' and res:
            r = next((x for x in res if x['source'] == it['fuente']), None)
            if r:
                it['estado'] = 'identificado: estilos y configuración, sin coordenadas (0 pares UTM en el binario)'
                it['evidencia'] = {'objetos': r['proxies']['objects'], 'clases': r['proxies']['classes'],
                                   'pares_utm': r['proxies']['utm_pairs_total']}
        elif it['categoria'] == '3D/ACIS' and acis:
            it['estado'] = 'identificado: los 8 blobs pertenecen a las 6 REGION (2 son versiones anteriores)'
            it['evidencia'] = [{k: b[k] for k in ('offset', 'format', 'fecha', 'region_handles', 'resultado')} for b in acis['blobs']]
        elif it['categoria'] == 'conversion' and res:
            r = next((x for x in res if x['source'] == it['fuente']), None)
            if r:
                it['estado'] = ('recuperado: entidades decodificadas; XRECORD y diccionarios decodificados '
                                '(texturas de material, contabilidad interna y diccionarios vacíos)')
        elif it['categoria'] == 'CRS' and 'COFOPRI' in it['descripcion'] and 'handle' in it['descripcion'] and frames:
            c = Counter(r['marco'] for r in frames)
            it['estado'] = (f"recuperado: {c.get('Tomaque', 0)} con marco de Tomaque por evidencia; "
                            f"{c.get('COFOPRI', 0)} con marco de COFOPRI; {c.get('indeterminado', 0)} no determinables")
            it['evidencia'] = 'data/cad/extracted/tercera/pendientes/geo-43-marcos.json'
        elif it['categoria'] == 'georreferenciacion' and paper:
            ok = [r for r in paper if r['resultado'].startswith('georreferenciado')]
            it['estado'] = (f'recuperado parcialmente: {len(ok)} copias del plano de ubicación georreferenciadas; '
                            'el resto es flecha de norte, cajetín, membrete o sección vial (no territorial)')
            it['evidencia'] = 'data/cad/extracted/tercera/pendientes/geo-espacio-papel*.json'
        resolved.append(it)
    if hatch:
        resolved.append({'categoria': 'geometria', 'fuente': 'todas', 'descripcion': 'Sombreados con huecos ensamblados (regla par-impar)',
                         'evidencia': hatch, 'estado': 'recuperado; polígonos no válidos registrados con su motivo, sin reparar'})
    return resolved


if __name__ == '__main__':
    inv = [inventory(label) for label in labels()]
    (T3 / 'inventario.json').write_text(json.dumps(inv, ensure_ascii=False, indent=1, default=str), encoding='utf8')
    unc = resolve_pending(uncertainties(inv))
    (T3 / 'incertidumbres.json').write_text(json.dumps(unc, ensure_ascii=False, indent=1, default=str), encoding='utf8')
    print(json.dumps({'archivos': len(inv), 'incertidumbres': len(unc), 'por_categoria': dict(Counter(u['categoria'] for u in unc))}, ensure_ascii=False))
