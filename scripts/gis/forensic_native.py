"""Third pass, part 1: native DWG forensics for every DWG/BAK (read-only).

For each source it records what the DXF route could not show: container layout
and per-section hashes, authoring products and save history, SummaryInfo and
AuxHeader dates, embedded preview, AcDs (ACIS/ASM) store, and a native object
census compared handle by handle with the DXF export.

Sources: rutas/*.dwg, plus the BAK working copies in data/cad/converted/input/
whose SHA-256 matches source-inventory.json (the BAK originals are no longer in
rutas/). Personal fields (authors, user names, local paths) go only to
tercera/privado/; tercera/nativo/ holds the publishable record.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import struct
import sys
import ezdxf
import dwg_native as dn
from sources import ROOT, SOURCE_DIR

EXT = ROOT / 'data/cad/extracted'
OUT = EXT / 'tercera'
NATIVE = OUT / 'nativo'
PRIVATE = OUT / 'privado'
PREVIEW = OUT / 'preview'
VERSION = 1
# DXF names of fixed native types that ezdxf reports differently.
DXF_ALIASES = {'BLOCK_HEADER': 'BLOCK_RECORD', 'POLYLINE_2D': 'POLYLINE', 'POLYLINE_3D': 'POLYLINE',
               'POLYLINE_PFACE': 'POLYLINE', 'POLYLINE_MESH': 'POLYLINE', 'VERTEX_2D': 'VERTEX',
               'VERTEX_3D': 'VERTEX', 'VERTEX_MESH': 'VERTEX', 'VERTEX_PFACE': 'VERTEX',
               'VERTEX_PFACE_FACE': 'VERTEX', 'OLEFRAME': 'OLEFRAME', 'MINSERT': 'INSERT'}
DIM_PREFIX = 'DIMENSION_'


def sources():
    """(label, binary path, dxf path, original sha256, origin note)."""
    inventory = {s['name']: s['sha256'] for s in json.loads((EXT / 'source-inventory.json').read_text(encoding='utf8'))}
    cofopri = EXT / 'cofopri-source.json'  # recorded when COFOPRI arrived after the first inventory
    if cofopri.exists():
        c = json.loads(cofopri.read_text(encoding='utf8'))
        inventory[c['source']] = c['sha256']
    out = []
    for dwg in sorted(SOURCE_DIR.glob('*.dwg')):
        out.append((dwg.name, dwg, ROOT / 'data/cad/converted' / f'{dwg.name}.dxf', inventory.get(dwg.name), 'rutas/'))
    for copy in sorted((ROOT / 'data/cad/converted/input').glob('*.bak.dwg')):
        name = copy.name.removesuffix('.dwg')
        out.append((name, copy, ROOT / 'data/cad/converted' / f'{name}.dxf', inventory.get(name),
                    'copia de trabajo de la primera entrega (rustas/)'))
    return out


def product_info(strings):
    products = []
    for s in strings:
        for m in re.finditer(r'<ProductInformation name\s*=\s*\\?"([^"\\]+)\\?"\s+build_version=\\?"([^"\\]+)\\?"(?:\s+registry_version=\\?"([^"\\]+)\\?")?', s):
            products.append({'name': m.group(1), 'build_version': m.group(2), 'registry_version': m.group(3)})
    versions = [s for s in strings if re.fullmatch(r'\d+\.\d+\.\d+\.\d+\.\d+', s)]
    return products, versions


def private_strings(strings):
    """prop_set entries carry user names; keep them out of the public record."""
    found = []
    for s in strings:
        for m in re.finditer(r'<prop id(?:_str)?="([^"]+)"><string>([^<]*)</string>', s):
            if m.group(2):
                found.append({'prop': m.group(1), 'value': m.group(2)})
    return found


def aux_dates(data):
    """AuxHeader: scan for (julian day, ms) pairs; the first two are TDCREATE and TDUPDATE."""
    pairs = []
    for off in range(0, len(data) - 7):
        day, ms = struct.unpack_from('<II', data, off)
        if 2_415_021 <= day <= 2_488_070 and ms < 86_400_000:
            pairs.append({'offset': off, 'date': dn._julian(day, ms)})
    return {'td_pairs': pairs[:4], 'tdcreate': pairs[0]['date'] if pairs else None,
            'tdupdate': pairs[1]['date'] if len(pairs) > 1 else None,
            'dwg_version_code': struct.unpack_from('<H', data, 3)[0],
            'header_hex': data[:40].hex(), 'note': 'TDCREATE/TDUPDATE leídos del DWG original; '
            'el resto de campos se conserva en hexadecimal sin interpretar.'}


def preview(data, stem):
    out = []
    start = data.find(b'\x89PNG\r\n\x1a\n')
    if start >= 0:
        end = data.find(b'IEND', start)
        blob = data[start:end + 8] if end > 0 else data[start:]
        w, h = struct.unpack_from('>II', blob, 16)
        path = PREVIEW / f'{stem}.png'
        path.write_bytes(blob)
        out.append({'format': 'png', 'width': w, 'height': h, 'bytes': len(blob),
                    'file': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(blob).hexdigest()})
    return out


def acds(data):
    if not data:
        return None
    blobs = [m.start() for m in re.finditer(rb'(ACIS|ASM) BinaryFile', data)]
    strings = dn.ascii_strings(data, 5)
    return {'bytes': len(data), 'acis_asm_blobs': len(blobs),
            'modeler_versions': sorted({s for s in strings if re.match(r'(ASM|ACIS) \d', s)}),
            'blob_dates': sorted({s for s in strings if re.match(r'\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4}', s)}),
            'schemas': sorted({s for s in dn.utf16_strings(data, 6) if 'Schema' in s or 'AcDb' in s})[:20],
            'segments': sorted({s for s in strings if s in ('segidx', 'datidx', '_data_', 'schidx', 'search', 'prvsav', 'freesp', 'schdat')})}


def dxf_census(dxf_path):
    doc = ezdxf.readfile(dxf_path)
    types = {int(h, 16): e.dxftype() for h, e in doc.entitydb.items()}
    classes = {500 + i: c.dxf.name for i, c in enumerate(doc.classes)}
    return types, classes


def normalise(native_type):
    if native_type.startswith(DIM_PREFIX):
        return 'DIMENSION'
    return DXF_ALIASES.get(native_type, native_type)


def audit(label, path, dxf_path, expected_sha, origin):
    stem = re.sub(r'[^\w.-]+', '_', label)
    target = NATIVE / f'{stem}.json'
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    if target.exists():
        cached = json.loads(target.read_text(encoding='utf8'))
        if cached.get('sha256') == sha and cached.get('version') == VERSION:
            return cached
    dwg = dn.DwgFile(path)
    rec = {'source': label, 'origin': origin, 'version': VERSION, 'sha256': sha,
           'sha256_matches_inventory': (sha == expected_sha) if expected_sha else None,
           'bytes': len(dwg.raw), 'file_header': dwg.file_header,
           'container': {k: v for k, v in dwg.header.items() if k != 'crc32'}, 'sections': []}
    private = {'source': label}
    decoded = {}
    for sec in dwg.sections:
        if not sec['name']:
            continue
        try:
            data = dwg.section(sec['name'])
            decoded[sec['name']] = data
            rec['sections'].append({'name': sec['name'], 'size': sec['size'], 'pages': len(sec['pages']),
                                    'compressed': sec['compressed'], 'encrypted': sec['encrypted'],
                                    'sha256': hashlib.sha256(data).hexdigest()})
        except Exception as ex:  # record, never hide
            rec['sections'].append({'name': sec['name'], 'size': sec['size'], 'error': str(ex)[:200]})

    if 'AcDb:SummaryInfo' in decoded:
        si = dn.summary_info(decoded['AcDb:SummaryInfo'])
        private['summary_info'] = si
        rec['summary_info'] = {
            'title': si['title'], 'subject': si['subject'], 'keywords': si['keywords'], 'comments': si['comments'],
            'revision_number': si['revision_number'], 'hyperlink_base': si['hyperlink_base'],
            'author_present': bool(si['author']), 'last_saved_by_present': bool(si['last_saved_by']),
            'created': si['created'], 'modified': si['modified'],
            'custom_property_keys': sorted(si['custom_properties']),
            'note': 'Autor, último usuario y valores de propiedades personalizadas solo en tercera/privado/.'}
    for name in ('AcDb:AppInfo', 'AcDb:AppInfoHistory'):
        if name in decoded:
            strings = dn.utf16_strings(decoded[name])
            products, versions = product_info(strings)
            rec[name.split(':')[1]] = {'products': products, 'app_versions': versions,
                                       'trusted_dwg': any('Trusted DWG' in s for s in strings),
                                       'property_entries': len(private_strings(strings))}
            private[name] = private_strings(strings)
    if 'AcDb:AuxHeader' in decoded:
        rec['aux_header'] = aux_dates(decoded['AcDb:AuxHeader'])
    if 'AcDb:Preview' in decoded:
        rec['preview'] = preview(decoded['AcDb:Preview'], stem)
    if 'AcDb:RevHistory' in decoded:
        rec['rev_history_hex'] = decoded['AcDb:RevHistory'].hex()
    if 'AcDb:FileDepList' in decoded:
        deps = dn.file_dependencies(decoded['AcDb:FileDepList'])
        private['file_dependencies'] = deps
        rec['file_dependencies'] = {'features': deps['features'],
                                    'files': [{'name': Path(f['full_name'].replace('\\', '/')).name, 'feature': f['feature']}
                                              for f in deps['files']]}
    else:
        rec['file_dependencies'] = None
    rec['acds'] = acds(decoded.get('AcDb:AcDsPrototype_1b'))

    # Native census vs DXF, handle by handle.
    dxf_types, class_names = dxf_census(dxf_path)
    census = dn.census(dwg, class_names)
    native = {r['handle']: r for r in census['records']}
    only_native = [native[h] for h in sorted(set(native) - set(dxf_types))]
    only_dxf = sorted(set(dxf_types) - set(native))
    type_mismatch = Counter()
    proxies = Counter()
    for h, r in native.items():
        if h in dxf_types and r.get('type'):
            dxf_t = dxf_types[h]
            nat = normalise(r['type'])
            if dxf_t in ('ACAD_PROXY_OBJECT', 'ACAD_PROXY_ENTITY') and nat != dxf_t:
                proxies[(dxf_t, r['type'])] += 1
            elif nat != dxf_t:
                type_mismatch[(r['type'], dxf_t)] += 1
    objects = census['objects_section']
    lost = []
    for r in only_native:
        raw = dn.object_bytes(objects, r['location']) if r.get('type') else b''
        lost.append({'handle': format(r['handle'], 'X'), 'type': r.get('type'), 'size': r.get('size'),
                     'strings': sorted(set(dn.ascii_strings(raw, 4) + dn.utf16_strings(raw, 4)))[:20]})
    private['objects_only_in_dwg'] = lost
    dxf_counts = Counter(dxf_types.values())
    native_counts = Counter(normalise(r['type']) for r in census['records'] if r.get('type'))
    rec['census'] = {
        'native_objects': census['objects'], 'native_unreadable': census['unreadable'],
        'dxf_objects': len(dxf_types), 'native_types': census['types'],
        'only_in_dwg': {'count': len(only_native), 'types': dict(Counter(r.get('type') for r in only_native))},
        'only_in_dxf': {'count': len(only_dxf), 'types': dict(Counter(dxf_types[h] for h in only_dxf))},
        'proxies_resolved': [{'dxf': a, 'native_class': b, 'count': n} for (a, b), n in proxies.most_common()],
        'type_mismatches': [{'native': a, 'dxf': b, 'count': n} for (a, b), n in type_mismatch.most_common(30)],
        'count_differences': {t: {'native': native_counts.get(t, 0), 'dxf': dxf_counts.get(t, 0)}
                              for t in sorted(set(native_counts) | set(dxf_counts))
                              if native_counts.get(t, 0) != dxf_counts.get(t, 0)},
        'class_mapping_note': 'Códigos >= 500 resueltos con el orden de CLASSES del DXF de ODA.',
    }
    (PRIVATE / f'{stem}.json').write_text(json.dumps(private, ensure_ascii=False, indent=1, default=str), encoding='utf8')
    target.write_text(json.dumps(rec, ensure_ascii=False, indent=1, default=str), encoding='utf8')
    return rec


if __name__ == '__main__':
    for d in (NATIVE, PRIVATE, PREVIEW):
        d.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    summary = []
    for label, path, dxf, sha, origin in sources():
        if only and label not in only:
            continue
        print('Nativo', label, flush=True)
        r = audit(label, path, dxf, sha, origin)
        c = r['census']
        summary.append({'source': label, 'sha_ok': r['sha256_matches_inventory'],
                        'sections': len(r['sections']), 'native': c['native_objects'], 'dxf': c['dxf_objects'],
                        'only_dwg': c['only_in_dwg']['count'], 'only_dxf': c['only_in_dxf']['count'],
                        'proxies_resolved': sum(p['count'] for p in c['proxies_resolved']),
                        'created': (r.get('aux_header') or {}).get('tdcreate'),
                        'updated': (r.get('aux_header') or {}).get('tdupdate'),
                        'products': [p['build_version'] for p in (r.get('AppInfo') or {}).get('products', [])]})
        print(json.dumps(summary[-1], ensure_ascii=False), flush=True)
    if not only:
        (OUT / 'nativo-resumen.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')
