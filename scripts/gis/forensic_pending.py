"""Third pass, part 8: resolution of the documented pending items (native DWG).

Read-only. For every DWG/BAK it decodes, straight from the binary:

- proxy objects (Civil 3D, Map 3D, ADT and other custom classes): class, string
  stream, and a scan of every 64-bit double at every bit offset for Bagua UTM or
  geographic coordinates (territorial content test);
- XRECORD and DICTIONARY objects present only in the DWG (validated decoders);
- dynamic-block parameter objects referenced by ACAD_ENHANCEDBLOCK graphs.

Output: data/cad/extracted/tercera/pendientes/<source>.json and a summary.
"""
from collections import Counter, defaultdict
import io
import json
import re
import sys
import zipfile
import ezdxf
import dwg_native as dn
from forensic_native import sources
from sources import ROOT

OUT = ROOT / 'data/cad/extracted/tercera/pendientes'
PRIVATE = ROOT / 'data/cad/extracted/tercera/privado'


def stem(name):
    return re.sub(r'[^\w.-]+', '_', name)


def zip_listing(tags):
    """Some XRECORDs embed ZIP archives (render assets); list their members."""
    out = []
    for code, value in tags:
        if isinstance(value, str) and value.startswith('504b0304'):
            try:
                with zipfile.ZipFile(io.BytesIO(bytes.fromhex(value))) as z:
                    out += [{'name': i.filename, 'bytes': i.file_size} for i in z.infolist()]
            except zipfile.BadZipFile:
                out.append({'name': '<fragmento ZIP incompleto: el binario continúa en grupos 311 siguientes>'})
    return out


def territorial(tags):
    """Points/reals in the Bagua UTM range inside decoded tags."""
    n = 0
    for code, value in tags:
        vals = value if isinstance(value, list) else [value]
        n += sum(1 for v in vals if isinstance(v, float) and (760000 < v < 800000 or 9360000 < v < 9395000))
    return n


def run(label, path, dxf_path):
    dwg = dn.DwgFile(path)
    doc = ezdxf.readfile(dxf_path)
    class_names = {500 + i: c.dxf.name for i, c in enumerate(doc.classes)}
    census = dn.census(dwg, class_names)
    objects = census['objects_section']
    in_dxf = {int(h, 16): e.dxftype() for h, e in doc.entitydb.items()}
    records = {r['handle']: r for r in census['records']}

    # 1. Proxy objects: native class, strings, coordinate scan.
    proxies = defaultdict(lambda: {'count': 0, 'bytes': 0, 'strings': Counter(), 'utm_e': 0, 'utm_n': 0,
                                   'utm_pairs': 0, 'lonlat': 0, 'objects_with_utm_pairs': []})
    for h, r in records.items():
        if in_dxf.get(h) not in ('ACAD_PROXY_OBJECT', 'ACAD_PROXY_ENTITY') or not r.get('type'):
            continue
        rdr, bitsize, _, _, obj = dn.object_reader(objects, r['location'])
        p = proxies[r['type']]
        p['count'] += 1
        p['bytes'] += len(obj)
        for s in dn.string_stream(obj, bitsize):
            if s.strip():
                p['strings'][s.strip()] += 1
        hits = dn.utm_doubles(obj)
        for k, v in hits.items():
            p[k] += v
        if hits['utm_pairs'] and len(p['objects_with_utm_pairs']) < 20:
            p['objects_with_utm_pairs'].append(format(h, 'X'))
    proxy_out = [{'class': c, **{k: v for k, v in p.items() if k != 'strings'},
                  'distinct_strings': len(p['strings']), 'strings_sample': [s for s, _ in p['strings'].most_common(25)]}
                 for c, p in sorted(proxies.items(), key=lambda kv: -kv[1]['count'])]

    # 2. Objects only in the DWG: XRECORD and DICTIONARY.
    only = [r for h, r in records.items() if h not in in_dxf and r.get('type') in ('XRECORD', 'DICTIONARY')]
    xrecs, dicts, failures = [], [], Counter()
    for r in only:
        try:
            if r['type'] == 'XRECORD':
                x = dn.xrecord(objects, r['location'])
                x['zip_members'] = zip_listing(x['tags'])
                x['utm_values'] = territorial(x['tags'])
                x['tags'] = [[c, (v[:120] + f'… ({len(v) // 2} bytes)') if isinstance(v, str) and len(v) > 120 and c in range(310, 320) else v]
                             for c, v in x['tags']]
                xrecs.append(x)
            else:
                dicts.append(dn.dictionary(objects, r['location']))
        except Exception as ex:
            failures[(r['type'], str(ex)[:80])] += 1
    # Name each exclusive XRECORD/DICTIONARY by the dictionary entry that owns it.
    names = {}
    for h, r in records.items():
        if r.get('type') == 'DICTIONARY':
            try:
                for name, target in dn.dictionary(objects, r['location'])['entries']:
                    if target:
                        names[target] = (name, format(h, 'X'))
            except Exception:
                pass
    for x in xrecs + dicts:
        x['entry_name'], x['parent_dictionary'] = names.get(x['handle'], (None, None))

    # 3. Dynamic-block parameters: objects referenced from ACAD_ENHANCEDBLOCK graphs.
    params = []
    for b in doc.blocks:
        br = b.block_record
        if not br.has_extension_dict or 'ACAD_ENHANCEDBLOCK' not in br.get_extension_dict():
            continue
        graph = br.get_extension_dict()['ACAD_ENHANCEDBLOCK']
        refs = set()
        for sub in graph.xtags.subclasses:
            refs |= {t.value for t in sub if t.code in (360, 330, 340, 350) and isinstance(t.value, str)}
        for ref in sorted(refs):
            r = records.get(int(ref, 16))
            if not r or not r.get('type') or r['type'] in ('BLOCK_HEADER', 'DICTIONARY'):
                continue
            rdr, bitsize, _, _, obj = dn.object_reader(objects, r['location'])
            params.append({'block': b.name, 'handle': ref, 'class': r['type'],
                           'strings': [s for s in dn.string_stream(obj, bitsize) if s.strip()][:20],
                           'utm': dn.utm_doubles(obj)})
    summary = {
        'source': label,
        'proxies': {'objects': sum(p['count'] for p in proxy_out), 'classes': len(proxy_out),
                    'utm_pairs_total': sum(p['utm_pairs'] for p in proxy_out),
                    'classes_with_utm_pairs': [p['class'] for p in proxy_out if p['utm_pairs']]},
        'xrecords_only_dwg': len(xrecs), 'dictionaries_only_dwg': len(dicts), 'decode_failures': dict(failures),
        'xrecord_entry_names': dict(Counter(x['entry_name'] for x in xrecs).most_common(30)),
        'xrecord_utm_values': sum(x['utm_values'] for x in xrecs),
        'zip_assets': sum(1 for x in xrecs if x['zip_members']),
        'dynamic_parameters': dict(Counter((p['block'], p['class']) for p in params).most_common(40)) if False else
                              [{'block': b, 'class': c, 'count': n} for (b, c), n in Counter((p['block'], p['class']) for p in params).most_common(60)],
    }
    return summary, {'proxies': proxy_out, 'xrecords': xrecs, 'dictionaries': dicts, 'dynamic_parameters': params}


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    report = []
    for label, path, dxf, _, _ in sources():
        if only and label not in only:
            continue
        print('Pendientes', label, flush=True)
        summary, detail = run(label, path, dxf)
        (OUT / f'{stem(label)}.json').write_text(json.dumps({'resumen': summary, **detail}, ensure_ascii=False, indent=1, default=str), encoding='utf8')
        report.append(summary)
        print(json.dumps(summary, ensure_ascii=False, default=str)[:1500], flush=True)
    if not only:
        (OUT / 'resumen.json').write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str), encoding='utf8')
