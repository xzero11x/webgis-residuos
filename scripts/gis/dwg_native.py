"""Read-only reader for the DWG R2004+ container (AC1018 … AC1032).

The DXF route (ODA File Converter -> ezdxf) rewrites header dates, drops the
SummaryInfo/AppInfo/FileDepList/Preview sections and replaces unknown custom
objects with proxies. This module opens the original binary directly to:

- decrypt the file header and read the section page map and section map;
- decompress every section (R2004 LZ77 variant) and hash it;
- decode SummaryInfo, AppInfo, FileDepList and Preview where the layout is known;
- count objects in the handle map and read each object's type code, giving a
  native census to compare with the DXF export.

Layouts follow the Open Design Alliance "Open Design Specification for .dwg
files" (v5.4.1) and libredwg. Nothing is written back to the source file.
"""
from pathlib import Path
import hashlib
import struct

SECTION_PAGE_MAP = 0x41630E3B
SECTION_MAP = 0x4163003B
DATA_PAGE = 0x4163043B
R2004_PLUS = ('AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032')
# Fixed object type codes (ODA spec §20.4). Codes >= 500 index the CLASSES section.
FIXED_TYPES = {
    1: 'TEXT', 2: 'ATTRIB', 3: 'ATTDEF', 4: 'BLOCK', 5: 'ENDBLK', 6: 'SEQEND', 7: 'INSERT', 8: 'MINSERT',
    10: 'VERTEX_2D', 11: 'VERTEX_3D', 12: 'VERTEX_MESH', 13: 'VERTEX_PFACE', 14: 'VERTEX_PFACE_FACE',
    15: 'POLYLINE_2D', 16: 'POLYLINE_3D', 17: 'ARC', 18: 'CIRCLE', 19: 'LINE', 20: 'DIMENSION_ORDINATE',
    21: 'DIMENSION_LINEAR', 22: 'DIMENSION_ALIGNED', 23: 'DIMENSION_ANG3PT', 24: 'DIMENSION_ANG2LN',
    25: 'DIMENSION_RADIUS', 26: 'DIMENSION_DIAMETER', 27: 'POINT', 28: '3DFACE', 29: 'POLYLINE_PFACE',
    30: 'POLYLINE_MESH', 31: 'SOLID', 32: 'TRACE', 33: 'SHAPE', 34: 'VIEWPORT', 35: 'ELLIPSE', 36: 'SPLINE',
    37: 'REGION', 38: '3DSOLID', 39: 'BODY', 40: 'RAY', 41: 'XLINE', 42: 'DICTIONARY', 43: 'OLEFRAME',
    44: 'MTEXT', 45: 'LEADER', 46: 'TOLERANCE', 47: 'MLINE', 48: 'BLOCK_CONTROL', 49: 'BLOCK_HEADER',
    50: 'LAYER_CONTROL', 51: 'LAYER', 52: 'STYLE_CONTROL', 53: 'STYLE', 56: 'LTYPE_CONTROL', 57: 'LTYPE',
    60: 'VIEW_CONTROL', 61: 'VIEW', 62: 'UCS_CONTROL', 63: 'UCS', 64: 'VPORT_CONTROL', 65: 'VPORT',
    66: 'APPID_CONTROL', 67: 'APPID', 68: 'DIMSTYLE_CONTROL', 69: 'DIMSTYLE', 70: 'VX_CONTROL',
    71: 'VX_TABLE_RECORD', 72: 'GROUP', 73: 'MLINESTYLE', 74: 'OLE2FRAME', 75: 'DUMMY', 76: 'LONG_TRANSACTION',
    77: 'LWPOLYLINE', 78: 'HATCH', 79: 'XRECORD', 80: 'ACDBPLACEHOLDER', 81: 'VBA_PROJECT', 82: 'LAYOUT',
    498: 'ACAD_PROXY_ENTITY', 499: 'ACAD_PROXY_OBJECT',
}


# ------------------------------------------------------------------ primitives
def header_key(length=0x6C):
    """XOR stream for the encrypted R2004 file header (MS rand() LCG, seed 1)."""
    seed, out = 1, bytearray()
    for _ in range(length):
        seed = (seed * 0x343FD + 0x269EC3) & 0xFFFFFFFF
        out.append((seed >> 16) & 0xFF)
    return bytes(out)


def decompress(data, expected_size):
    """R2004 LZ77 variant (ODA spec §4.7), with the opcode 0x10-0x1F and literal
    0x0F semantics used by ACadSharp's DwgLZ77AC18Decompressor."""
    out = bytearray()
    pos = 0

    def byte():
        nonlocal pos
        value = data[pos]
        pos += 1
        return value

    def literal_count(code):
        low = code & 0x0F
        if low == 0:
            b = byte()
            while b == 0:
                low += 0xFF
                b = byte()
            low += 0x0F + b
        return low + 3

    def extended(valid_bits):
        total = 0
        b = byte()
        while b == 0:
            total += 0xFF
            b = byte()
        return total + b + valid_bits

    def copy_literal(count):
        nonlocal pos
        out.extend(data[pos:pos + count])
        pos += count

    opcode = byte()
    if opcode & 0xF0 == 0:
        copy_literal(literal_count(opcode))
        opcode = byte()
    while opcode != 0x11:
        if opcode < 0x10 or opcode >= 0x40:
            count = (opcode >> 4) - 1
            offset = ((opcode >> 2) & 3) | (byte() << 2)
            lit = opcode & 3
        elif opcode < 0x20:
            count = (opcode & 7) or extended(7)
            count += 2
            first = byte()
            offset = (((opcode & 8) << 11) | (first >> 2) | (byte() << 6)) + 0x3FFF
            lit = first & 3
        else:
            count = (opcode & 0x1F) or extended(0x1F)
            count += 2
            first = byte()
            offset = (first >> 2) | (byte() << 6)
            lit = first & 3
        start = len(out) - offset - 1
        if start < 0:
            raise ValueError('referencia anterior al inicio del búfer')
        for i in range(count):  # may overlap: copy byte by byte
            out.append(out[start + i])
        if lit == 0:
            opcode = byte()
            if opcode & 0xF0 == 0:
                lit = literal_count(opcode)
        if lit:
            copy_literal(lit)
            opcode = byte()
        if expected_size is not None and len(out) >= expected_size and pos >= len(data):
            break
    if expected_size is not None and len(out) != expected_size:
        raise ValueError(f'tamaño descomprimido {len(out)} != {expected_size}')
    return bytes(out)


# ------------------------------------------------------------------ container
class DwgFile:
    def __init__(self, path):
        self.path = Path(path)
        self.raw = self.path.read_bytes()
        self.version = self.raw[:6].decode('ascii', 'replace')
        if self.version not in R2004_PLUS:
            raise ValueError(f'{self.version}: solo se admite R2004+')
        if self.version == 'AC1021':
            raise ValueError('AC1021 (R2007) usa otro contenedor; no implementado')
        self.sha256 = hashlib.sha256(self.raw).hexdigest()
        self.file_header = self._file_header()
        self.header = self._encrypted_header()
        self.pages = self._page_map()
        self.sections = self._section_map()

    def _file_header(self):
        r = self.raw
        return {
            'version': self.version, 'maintenance_release': r[0x0B],
            'preview_address': struct.unpack_from('<I', r, 0x0D)[0],
            'app_dwg_version': r[0x11], 'app_maintenance_version': r[0x12],
            'codepage': struct.unpack_from('<H', r, 0x13)[0],
            'security_flags': struct.unpack_from('<I', r, 0x18)[0],
            'summary_info_address': struct.unpack_from('<I', r, 0x20)[0],
            'vba_project_address': struct.unpack_from('<I', r, 0x24)[0],
        }

    def _encrypted_header(self):
        key = header_key()
        dec = bytes(a ^ b for a, b in zip(self.raw[0x80:0x80 + 0x6C], key))
        if not dec.startswith(b'AcFssFcAJMB'):
            raise ValueError('cabecera cifrada no reconocida')
        u = lambda off: struct.unpack_from('<I', dec, off)[0]
        q = lambda off: struct.unpack_from('<Q', dec, off)[0]
        return {'id': dec[:11].decode(), 'last_section_page_id': u(0x28), 'last_section_page_end': q(0x2C),
                'second_header_address': q(0x34), 'gap_amount': u(0x3C), 'section_page_amount': u(0x40),
                'section_page_map_id': u(0x50), 'section_page_map_address': q(0x54) + 0x100,
                'section_map_id': u(0x5C), 'section_page_array_size': u(0x60), 'gap_array_size': u(0x64),
                'crc32': u(0x68)}

    def _system_page(self, address, expected_type):
        typ, dsize, csize, ctype, _ = struct.unpack_from('<5I', self.raw, address)
        if typ != expected_type:
            raise ValueError(f'página de sistema 0x{typ:08x} en {address}, se esperaba 0x{expected_type:08x}')
        body = self.raw[address + 0x14:address + 0x14 + csize]
        return decompress(body, dsize) if ctype == 2 else body

    def _page_map(self):
        data = self._system_page(self.header['section_page_map_address'], SECTION_PAGE_MAP)
        pages, address, pos = {}, 0x100, 0
        while pos + 8 <= len(data):
            number, size = struct.unpack_from('<iI', data, pos)
            pos += 8
            if number < 0:
                pos += 16  # gap: parent, left, right, 0
            else:
                pages[number] = {'address': address, 'size': size}
            address += size
        return pages

    def _section_map(self):
        page = self.pages[self.header['section_map_id']]
        data = self._system_page(page['address'], SECTION_MAP)
        count = struct.unpack_from('<I', data, 0)[0]
        pos, sections = 20, []
        for _ in range(count):
            size, npages, max_size, _, compressed, sid, encrypted = struct.unpack_from('<QIIIIII', data, pos)
            name = data[pos + 32:pos + 96].split(b'\0')[0].decode('latin1')
            pos += 96
            entries = []
            for _ in range(npages):
                number, dsize, start = struct.unpack_from('<IIQ', data, pos)
                pos += 16
                entries.append({'page': number, 'data_size': dsize, 'start': start})
            sections.append({'name': name, 'size': size, 'pages': entries, 'max_page_size': max_size,
                             'compressed': compressed == 2, 'id': sid, 'encrypted': encrypted})
        return sections

    def section(self, name):
        sec = next((s for s in self.sections if s['name'] == name), None)
        if sec is None:
            return None
        if sec['encrypted'] == 1:
            raise ValueError(f'{name}: sección cifrada')
        out = bytearray(sec['size'])
        for entry in sec['pages']:
            address = self.pages[entry['page']]['address']
            mask = 0x4164536B ^ address
            head = struct.unpack_from('<8I', self.raw, address)
            typ, _, csize, _, start = (v ^ mask for v in head[:5])
            if typ != DATA_PAGE:
                raise ValueError(f'{name}: página de datos 0x{typ:08x}')
            body = self.raw[address + 32:address + 32 + csize]
            # Decompressed page size is the section's max page size; trailing pages
            # may still decompress to the full size, so only the section size is cut.
            chunk = decompress(body, None) if sec['compressed'] else body[:sec['max_page_size']]
            out[start:start + len(chunk)] = chunk
        return bytes(out[:sec['size']])


# ------------------------------------------------------------------ section decoders
def _tu(data, pos):
    """R2007+ string: uint16 character count (incl. terminator) + UTF-16LE."""
    n = struct.unpack_from('<H', data, pos)[0]
    raw = data[pos + 2:pos + 2 + 2 * n]
    return raw.decode('utf-16le', 'replace').rstrip('\0'), pos + 2 + 2 * n


def _julian(day, ms):
    import datetime
    if not day:
        return None
    try:
        return (datetime.datetime(1970, 1, 1) + datetime.timedelta(days=day - 2440588, milliseconds=ms)).isoformat(timespec='seconds')
    except OverflowError:
        return None


def summary_info(data):
    """SummaryInfo (ODA spec §26). Personal fields are returned; callers decide publication."""
    pos, out = 0, {}
    for key in ('title', 'subject', 'author', 'keywords', 'comments', 'last_saved_by', 'revision_number', 'hyperlink_base'):
        out[key], pos = _tu(data, pos)
    edit_day, edit_ms, c_day, c_ms, m_day, m_ms = struct.unpack_from('<6I', data, pos)
    pos += 24
    out['total_editing_days'] = round(edit_day + edit_ms / 86_400_000, 4)
    out['created'] = _julian(c_day, c_ms)
    out['modified'] = _julian(m_day, m_ms)
    count = struct.unpack_from('<H', data, pos)[0]
    pos += 2
    props = {}
    for _ in range(count):
        k, pos = _tu(data, pos)
        v, pos = _tu(data, pos)
        props[k] = v
    out['custom_properties'] = props
    return out


def utf16_strings(data, minimum=4):
    """Every run of printable UTF-16LE text: robust fallback for AppInfo/FileDepList."""
    out, cur = [], []
    for i in range(0, len(data) - 1, 2):
        ch = data[i] | (data[i + 1] << 8)
        if 0x20 <= ch < 0xD800 and chr(ch).isprintable():
            cur.append(chr(ch))
        else:
            if len(cur) >= minimum:
                out.append(''.join(cur))
            cur = []
    if len(cur) >= minimum:
        out.append(''.join(cur))
    return out


def ascii_strings(data, minimum=4):
    out, cur = [], bytearray()
    for b in data:
        if 0x20 <= b < 0x7F:
            cur.append(b)
        else:
            if len(cur) >= minimum:
                out.append(cur.decode('ascii'))
            cur = bytearray()
    if len(cur) >= minimum:
        out.append(cur.decode('ascii'))
    return out


def file_dependencies(data):
    """FileDepList (ODA spec §28): features, then one record per dependent file."""
    pos = 0
    def text():
        nonlocal pos
        n = struct.unpack_from('<I', data, pos)[0]
        pos += 4
        s = data[pos:pos + n].decode('utf-8', 'replace')
        pos += n
        return s
    nfeat = struct.unpack_from('<I', data, pos)[0]
    pos += 4
    features = [text() for _ in range(nfeat)]
    nfiles = struct.unpack_from('<I', data, pos)[0]
    pos += 4
    files = []
    for _ in range(nfiles):
        rec = {'full_name': text(), 'found_path': text(), 'fingerprint_guid': text(), 'version_guid': text()}
        feature, timestamp, size, affects, refs = struct.unpack_from('<IIIHI', data, pos)
        pos += 18
        rec.update({'feature': features[feature] if feature < len(features) else feature,
                    'timestamp': timestamp, 'file_size': size, 'affects_graphics': affects, 'reference_count': refs})
        files.append(rec)
    return {'features': features, 'files': files}


def preview_images(data):
    """Preview (ODA spec §27): sentinel, size, entries; returns [(kind, bytes)]."""
    if len(data) < 21:
        return []
    count = data[20]
    images, pos = [], 21
    for _ in range(count):
        code, start, size = struct.unpack_from('<BII', data, pos)
        pos += 9
        kind = {1: 'header', 2: 'bmp', 3: 'wmf', 6: 'png'}.get(code, f'code{code}')
        # Start offsets are absolute file positions; caller re-reads from the raw file.
        images.append({'kind': kind, 'start': start, 'size': size})
    return images


# ------------------------------------------------------------------ handle map and object census
def _modular_char(data, pos, signed):
    value, shift = 0, 0
    while True:
        b = data[pos]
        pos += 1
        if b & 0x80:
            value |= (b & 0x7F) << shift
            shift += 7
            continue
        if signed:
            negative = b & 0x40
            value |= (b & 0x3F) << shift
            return (-value if negative else value), pos
        value |= b << shift
        return value, pos


def handle_map(data):
    """AcDb:Handles: big-endian page size, then (handle delta, location delta) pairs."""
    handles, handle, location, pos = [], 0, 0, 0
    while pos + 2 <= len(data):
        size = struct.unpack_from('>H', data, pos)[0]
        if size <= 2:
            break
        end = pos + size
        pos += 2
        handle = location = 0  # each page restarts the running sums (ODA spec §23)
        while pos < end:
            dh, pos = _modular_char(data, pos, False)
            dl, pos = _modular_char(data, pos, True)
            handle += dh
            location += dl
            handles.append((handle, location))
        pos = end + 2  # CRC
    return handles


def _modular_short(data, pos):
    value, shift = 0, 0
    while True:
        word = struct.unpack_from('<H', data, pos)[0]
        pos += 2
        if word & 0x8000:
            value |= (word & 0x7FFF) << shift
            shift += 15
        else:
            return value | (word << shift), pos


def object_type(objects, location):
    """Object type code at a handle-map location (R2010+: MS size, MC handle bits, OT)."""
    _, pos = _modular_short(objects, location)
    _, pos = _modular_char(objects, pos, False)
    bits = int.from_bytes(objects[pos:pos + 3], 'big')
    code = bits >> 22
    if code == 0:
        return (bits >> 14) & 0xFF
    if code == 1:
        return ((bits >> 14) & 0xFF) + 0x1F0
    raw = (bits >> 6) & 0xFFFF
    return ((raw & 0xFF) << 8) | (raw >> 8)  # little-endian short across the bit stream


def object_bytes(objects, location):
    """Raw bytes of one object: MS counts the bytes after the handle-size MC."""
    size, pos = _modular_short(objects, location)
    _, mc_end = _modular_char(objects, pos, False)
    return objects[mc_end:mc_end + size]


def census(dwg, class_names):
    """Native census: every object in the handle map with its type code and size."""
    handles = handle_map(dwg.section('AcDb:Handles'))
    objects = dwg.section('AcDb:AcDbObjects')
    records, counts, failures = [], {}, 0
    for handle, loc in handles:
        try:
            code = object_type(objects, loc)
            size, _ = _modular_short(objects, loc)
        except (IndexError, struct.error):
            failures += 1
            records.append({'handle': handle, 'location': loc, 'type': None})
            continue
        name = FIXED_TYPES.get(code) or (class_names.get(code) if code >= 500 else None) or f'tipo-{code}'
        counts[name] = counts.get(name, 0) + 1
        records.append({'handle': handle, 'location': loc, 'code': code, 'type': name, 'size': size})
    return {'objects': len(handles), 'types': dict(sorted(counts.items(), key=lambda kv: -kv[1])),
            'unreadable': failures, 'records': records, 'objects_section': objects}


# ------------------------------------------------------------------ entity decoding (R2010+)
class BitReader:
    """MSB-first bit reader over one object's bytes (positions in bits)."""

    def __init__(self, data, pos=0):
        self.data = data
        self.pos = pos

    def bits(self, n):
        value = 0
        for _ in range(n):
            byte = self.data[self.pos >> 3]
            value = (value << 1) | ((byte >> (7 - (self.pos & 7))) & 1)
            self.pos += 1
        return value

    def B(self):
        return self.bits(1)

    def BB(self):
        return self.bits(2)

    def RC(self):
        return self.bits(8)

    def raw(self, n):
        return bytes(self.RC() for _ in range(n))

    def RS(self):
        return struct.unpack('<H', self.raw(2))[0]

    def RL(self):
        return struct.unpack('<I', self.raw(4))[0]

    def RD(self):
        return struct.unpack('<d', self.raw(8))[0]

    def BS(self):
        code = self.BB()
        if code == 0:
            return self.RS()
        if code == 1:
            return self.RC()
        return 0 if code == 2 else 256

    def BL(self):
        code = self.BB()
        if code == 0:
            return self.RL()
        if code == 1:
            return self.RC()
        return 0

    def BLL(self):
        n = self.bits(3)
        return int.from_bytes(self.raw(n), 'little') if n else 0

    def BD(self):
        code = self.BB()
        return (None, 1.0, 0.0, None)[code] if code else self.RD()

    def DD(self, default):
        code = self.BB()
        if code == 0:
            return default
        if code == 3:
            return self.RD()
        buf = bytearray(struct.pack('<d', default))
        if code == 2:
            buf[4], buf[5] = self.RC(), self.RC()
            buf[0:4] = self.raw(4)
        else:
            buf[0:4] = self.raw(4)
        return struct.unpack('<d', bytes(buf))[0]

    def BT(self):
        return 0.0 if self.B() else self.BD()

    def BE(self):
        return (0.0, 0.0, 1.0) if self.B() else (self.BD(), self.BD(), self.BD())

    def P3(self):
        return [self.BD(), self.BD(), self.BD()]

    def H(self, base=None):
        code_counter = self.RC()
        code, counter = code_counter >> 4, code_counter & 0x0F
        value = int.from_bytes(self.raw(counter), 'big') if counter else 0
        if base is not None:
            if code == 6:
                return base + 1
            if code == 8:
                return base - 1
            if code == 0x0A:
                return base + value
            if code == 0x0C:
                return base - value
        return value

    def TU(self):
        n = self.BS()
        return ''.join(chr(self.RS()) for _ in range(n)).rstrip('\0')


def _string_stream(rdr, bitsize):
    """R2007+: strings live in a stream at the end of the data bits (libredwg obj_string_stream)."""
    start = bitsize - 1
    rdr.pos = start
    if not rdr.B():
        return None
    start -= 16
    rdr.pos = start
    size = rdr.RS()
    if size & 0x8000:
        start -= 16
        rdr.pos = start
        size = (size & 0x7FFF) | (rdr.RS() << 15)
    rdr.pos = start - size
    return rdr.pos


def decode_entity(objects, location):
    """Common entity data plus geometry for a few entity types. Returns None if unsupported.

    Validated against entities present in both the DWG and its DXF export
    (forensic_lost.py); only use results when that validation passes.
    """
    size, pos = _modular_short(objects, location)
    hsize, mc_end = _modular_char(objects, pos, False)
    # MS counts the bytes after the MC field; bit positions are relative to it.
    obj = objects[mc_end:mc_end + size]
    bitsize = size * 8 - hsize
    rdr = BitReader(obj, 0)
    code = rdr.BB()
    typ = rdr.RC() if code == 0 else rdr.RC() + 0x1F0 if code == 1 else (lambda lo, hi: lo | hi << 8)(rdr.RC(), rdr.RC())
    handle = rdr.H()
    while True:  # extended entity data
        eed = rdr.BS()
        if not eed:
            break
        rdr.H()
        rdr.pos += eed * 8
    if rdr.B():  # graphic image present
        rdr.pos += rdr.BLL() * 8
    entmode = rdr.BB()
    reactors = rdr.BL()
    xdic_missing = rdr.B()
    rdr.B()  # has DS binary data (R2013+)
    color_raw = rdr.BS()
    color_flag = color_raw >> 8
    if color_flag & 0x80:
        rdr.BL()
    if color_flag & 0x20:
        rdr.BL()
    rdr.BD()  # linetype scale
    ltype_flags = rdr.BB()
    plot_flags = rdr.BB()
    material_flags = rdr.BB()
    rdr.RC()  # shadow flags
    vs = [rdr.B(), rdr.B(), rdr.B()]  # full / face / edge visual style present
    invisible = rdr.BS()
    lineweight = rdr.RC()
    rec = {'handle': handle, 'type_code': typ, 'type': FIXED_TYPES.get(typ, f'tipo-{typ}'), 'entmode': entmode,
           'color_index': color_raw & 0x1FF, 'invisible': invisible, 'lineweight': lineweight}
    t = rec['type']
    if t == 'LINE':
        z_zero = rdr.B()
        x1 = rdr.RD(); x2 = rdr.DD(x1); y1 = rdr.RD(); y2 = rdr.DD(y1)
        z1 = z2 = 0.0
        if not z_zero:
            z1 = rdr.RD(); z2 = rdr.DD(z1)
        rdr.BT(); rdr.BE()
        rec['geometry'] = {'type': 'LineString', 'coordinates': [[x1, y1, z1], [x2, y2, z2]]}
    elif t == 'POINT':
        p = rdr.P3()
        rec['geometry'] = {'type': 'Point', 'coordinates': p}
    elif t in ('ARC', 'CIRCLE'):
        c = rdr.P3(); r = rdr.BD(); rdr.BT(); rdr.BE()
        rec['center'], rec['radius'] = c, r
        if t == 'ARC':
            rec['start_angle'], rec['end_angle'] = rdr.BD(), rdr.BD()
    elif t == 'SOLID':
        rdr.BT(); elev = rdr.BD()
        corners = [[rdr.RD(), rdr.RD(), elev] for _ in range(4)]
        rec['geometry'] = {'type': 'Polygon', 'coordinates': [corners[:2] + corners[3:4] + corners[2:3] + corners[:1]]}
    elif t in ('TEXT', 'MTEXT', 'BLOCK'):
        if t == 'TEXT':
            f = rdr.RC()
            elev = 0.0 if f & 1 else rdr.RD()
            x, y = rdr.RD(), rdr.RD()
            if not f & 2:
                rdr.DD(x); rdr.DD(y)
            rdr.BE(); rdr.BT()
            if not f & 4: rdr.RD()
            rec['rotation'] = 0.0 if f & 8 else rdr.RD()
            rec['height'] = rdr.RD()
            rec['geometry'] = {'type': 'Point', 'coordinates': [x, y, elev]}
        elif t == 'MTEXT':
            p = rdr.P3(); rdr.P3(); rdr.P3(); rdr.BD(); rdr.BD()
            rec['height'] = rdr.BD()
            rec['geometry'] = {'type': 'Point', 'coordinates': p}
        string_pos = _string_stream(BitReader(obj), bitsize)
        if string_pos is not None:
            rec['text'] = BitReader(obj, string_pos).TU()
    else:
        return rec | {'unsupported': True}
    # Handle stream: owner (entmode 0), reactors, xdictionary, [color book], layer.
    hr = BitReader(obj, bitsize)
    try:
        if entmode == 0:
            rec['owner'] = hr.H(handle)
        for _ in range(reactors):
            hr.H(handle)
        if not xdic_missing:
            hr.H(handle)
        if color_flag & 0x40:
            hr.H(handle)
        rec['layer_handle'] = hr.H(handle)
    except IndexError:
        rec['handle_stream_error'] = True
    return rec


# ------------------------------------------------------------------ non-entity objects (R2010+)
def object_reader(objects, location):
    """(reader at object-specific data, bitsize, handle, type code, raw object bytes)."""
    size, pos = _modular_short(objects, location)
    hsize, mc_end = _modular_char(objects, pos, False)
    obj = objects[mc_end:mc_end + size]
    rdr = BitReader(obj, 0)
    code = rdr.BB()
    typ = rdr.RC() if code == 0 else rdr.RC() + 0x1F0 if code == 1 else (lambda lo, hi: lo | hi << 8)(rdr.RC(), rdr.RC())
    handle = rdr.H()
    while True:
        eed = rdr.BS()
        if not eed:
            break
        rdr.H()
        rdr.pos += eed * 8
    return rdr, size * 8 - hsize, handle, typ, obj


def string_stream(obj, bitsize):
    """All TU strings of an object's string stream (R2007+), in stored order."""
    rdr = BitReader(obj, 0)
    end = bitsize - 1
    rdr.pos = end
    if not rdr.B():
        return []
    end -= 16
    rdr.pos = end
    size = rdr.RS()
    if size & 0x8000:
        end -= 16
        rdr.pos = end
        size = (size & 0x7FFF) | (rdr.RS() << 15)
    rdr.pos = end - size
    out = []
    while rdr.pos < end - 16:
        n = rdr.BS()
        if n > 4096 or rdr.pos + 16 * n > end:
            break
        out.append(''.join(chr(rdr.RS()) for _ in range(n)).rstrip('\0'))
    return out


def _group_kind(code):
    if 0 <= code <= 9 or code in (100, 102, 105) or 300 <= code <= 309 or 410 <= code <= 419 \
            or 430 <= code <= 439 or 470 <= code <= 479 or code == 999 or 1000 <= code <= 1009:
        return 'str'
    if 10 <= code <= 39 or 110 <= code <= 139 or 210 <= code <= 239 or 1010 <= code <= 1039:
        return 'point'
    if 40 <= code <= 59 or 140 <= code <= 149 or 460 <= code <= 469 or 1040 <= code <= 1042:
        return 'real'
    if 60 <= code <= 79 or 170 <= code <= 179 or 270 <= code <= 279 or 370 <= code <= 389 \
            or 400 <= code <= 409 or 1060 <= code <= 1070:
        return 'int16'
    if 90 <= code <= 99 or 420 <= code <= 429 or 440 <= code <= 459 or code == 1071:
        return 'int32'
    if 160 <= code <= 169:
        return 'int64'
    if 280 <= code <= 299:
        return 'int8'
    if 310 <= code <= 319 or code == 1004:
        return 'binary'
    if 320 <= code <= 369 or 390 <= code <= 399 or 480 <= code <= 481:
        return 'handle'
    return None


def xrecord(objects, location):
    """XRECORD data as [code, value] pairs (R2007+ strings are UTF-16 inline)."""
    rdr, bitsize, handle, typ, obj = object_reader(objects, location)
    rdr.BL()   # reactors
    rdr.B()    # xdictionary missing
    rdr.B()    # has DS data (R2013+)
    nbytes = rdr.BL()
    end = rdr.pos + nbytes * 8
    tags = []
    while rdr.pos < end:
        code = rdr.RS()
        kind = _group_kind(code)
        if kind == 'str':
            n = rdr.RS()
            value = rdr.raw(2 * n).decode('utf-16le', 'replace')
        elif kind == 'point':
            value = [rdr.RD(), rdr.RD(), rdr.RD()]
        elif kind == 'real':
            value = rdr.RD()
        elif kind == 'int16':
            value = struct.unpack('<h', rdr.raw(2))[0]
        elif kind == 'int32':
            value = struct.unpack('<i', rdr.raw(4))[0]
        elif kind == 'int64':
            value = struct.unpack('<q', rdr.raw(8))[0]
        elif kind == 'int8':
            value = rdr.RC()
        elif kind == 'binary':
            value = rdr.raw(rdr.RC()).hex()
        elif kind == 'handle':
            value = format(struct.unpack('<Q', rdr.raw(8))[0], 'X')
        else:
            raise ValueError(f'código de grupo {code} no admitido')
        tags.append([code, value])
    return {'handle': format(handle, 'X'), 'type_code': typ, 'tags': tags}


def dictionary(objects, location):
    """DICTIONARY entry names (string stream) and entry handles (handle stream)."""
    rdr, bitsize, handle, typ, obj = object_reader(objects, location)
    reactors = rdr.BL()
    xdic_missing = rdr.B()
    rdr.B()
    n = rdr.BL()
    rdr.BS()   # cloning flag
    rdr.RC()   # hard owner flag
    names = string_stream(obj, bitsize)[:n]
    hr = BitReader(obj, bitsize)
    hr.H(handle)  # owner
    for _ in range(reactors):
        hr.H(handle)
    if not xdic_missing:
        hr.H(handle)
    entries = []
    for name in names:
        try:
            entries.append([name, format(hr.H(handle), 'X')])
        except IndexError:
            entries.append([name, None])
    return {'handle': format(handle, 'X'), 'entries': entries}


def utm_doubles(obj):
    """Doubles at any bit offset that fall in the Bagua UTM, geographic or elevation ranges."""
    hits = {'utm_e': 0, 'utm_n': 0, 'utm_pairs': 0, 'lonlat': 0}
    for shift in range(8):
        r = BitReader(obj, shift)
        values = []
        while r.pos + 64 <= len(obj) * 8:
            values.append(struct.unpack('<d', r.raw(8))[0])
        for i, v in enumerate(values):
            if 760000 < v < 800000:
                hits['utm_e'] += 1
                if i + 1 < len(values) and 9360000 < values[i + 1] < 9395000:
                    hits['utm_pairs'] += 1
            elif 9360000 < v < 9395000:
                hits['utm_n'] += 1
            elif -79.0 < v < -78.0 and i + 1 < len(values) and -6.0 < values[i + 1] < -5.0:
                hits['lonlat'] += 1
    return hits
