"""Tests for the third-pass forensic tools.

  .venv-gis/Scripts/python -m unittest discover -s scripts/gis/tests -v

Unit tests use synthetic streams. Integration tests run only when the municipal
originals and their exports are present locally (they are not in Git).
"""
from pathlib import Path
import json
import struct
import sys
import unittest

GIS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GIS))
import dwg_native as dn  # noqa: E402
from sources import ROOT, SOURCE_DIR  # noqa: E402

COFOPRI = SOURCE_DIR / 'COFOPRI BAGUA.dwg'
TERCERA = ROOT / 'data/cad/extracted/tercera'


def bits_to_bytes(bits):
    bits = bits + '0' * (-len(bits) % 8)
    return bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))


class Decompression(unittest.TestCase):
    def test_literal_only(self):
        self.assertEqual(dn.decompress(b'\x01abcd\x11', 4), b'abcd')

    def test_back_reference_overlapping(self):
        # literal 'abcd', then opcode 0x50: copy 4 bytes from distance 1 -> 'dddd'
        self.assertEqual(dn.decompress(b'\x01abcd\x50\x00\x11', 8), b'abcddddd')

    def test_literal_code_0x0f_is_eighteen_bytes(self):
        payload = bytes(range(18))
        self.assertEqual(dn.decompress(b'\x0f' + payload + b'\x11', 18), payload)

    def test_header_key_prefix(self):
        self.assertEqual(dn.header_key(4), bytes([0x29, 0x23, 0xBE, 0x84]))


class Bits(unittest.TestCase):
    def test_bitshort_codes(self):
        r = dn.BitReader(bits_to_bytes('10' + '11' + '01' + '00000101' + '00' + '0000000100000000'))
        self.assertEqual([r.BS(), r.BS(), r.BS(), r.BS()], [0, 256, 5, 1])

    def test_bitshort_does_not_overread(self):
        r = dn.BitReader(bits_to_bytes('10' + '1'))
        self.assertEqual(r.BS(), 0)
        self.assertEqual(r.pos, 2)

    def test_bitdouble_codes(self):
        r = dn.BitReader(bits_to_bytes('01' + '10'))
        self.assertEqual((r.BD(), r.BD()), (1.0, 0.0))

    def test_default_double_replaces_low_bytes(self):
        raw = struct.pack('<d', 2.5)
        bits = '01' + ''.join(f'{b:08b}' for b in raw[:4])
        self.assertEqual(dn.BitReader(bits_to_bytes(bits)).DD(2.5), 2.5)

    def test_handle_relative_codes(self):
        r = dn.BitReader(bits_to_bytes('01100000' + '10000000'))
        self.assertEqual((r.H(100), r.H(100)), (101, 99))


@unittest.skipUnless(COFOPRI.exists(), 'originales municipales no disponibles')
class RealFiles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dwg = dn.DwgFile(COFOPRI)

    def test_encrypted_header(self):
        self.assertEqual(self.dwg.header['id'], 'AcFssFcAJMB')

    def test_every_section_decompresses(self):
        for sec in self.dwg.sections:
            if sec['name']:
                self.assertEqual(len(self.dwg.section(sec['name'])), sec['size'], sec['name'])

    def test_summary_dates_match_file_date(self):
        info = dn.summary_info(self.dwg.section('AcDb:SummaryInfo'))
        self.assertTrue(info['modified'].startswith('2023-08-27'))

    def test_native_census_matches_dxf_for_drawing_entities(self):
        import ezdxf
        from collections import Counter
        doc = ezdxf.readfile(ROOT / 'data/cad/converted/COFOPRI BAGUA.dwg.dxf')
        census = dn.census(self.dwg, {500 + i: c.dxf.name for i, c in enumerate(doc.classes)})
        dxf = Counter(e.dxftype() for e in doc.entitydb.values())
        for t in ('LINE', 'TEXT', 'LWPOLYLINE', 'HATCH', 'CIRCLE'):
            self.assertEqual(census['types'].get(t), dxf[t], t)

    def test_xrecord_and_dictionary_decoders_match_dxf(self):
        import ezdxf
        doc = ezdxf.readfile(ROOT / 'data/cad/converted/COFOPRI BAGUA.dwg.dxf')
        census = dn.census(self.dwg, {})
        objs = census['objects_section']
        checked = 0
        for r in census['records']:
            e = doc.entitydb.get(format(r['handle'], 'X'))
            if e is None or r['type'] not in ('XRECORD', 'DICTIONARY') or e.dxftype() != r['type']:
                continue
            if r['type'] == 'DICTIONARY':
                names = sorted(n for n, _ in dn.dictionary(objs, r['location'])['entries'])
                if names == sorted(e.keys()):
                    checked += 1
                continue
            tags = dn.xrecord(objs, r['location'])['tags']
            codes = [t.code for t in e.tags]
            if [c for c, _ in tags] == codes:
                checked += 1
        self.assertGreater(checked, 50)

    def test_entity_decoder_matches_dxf(self):
        import ezdxf
        from forensic_lost import validate
        doc = ezdxf.readfile(ROOT / 'data/cad/converted/COFOPRI BAGUA.dwg.dxf')
        census = dn.census(self.dwg, {})
        result = validate(census['objects_section'], census['records'], doc, n=300)
        self.assertGreaterEqual(result['tasa'], 0.99, result)


@unittest.skipUnless((TERCERA / 'nativo').exists(), 'tercera pasada no ejecutada')
class Outputs(unittest.TestCase):
    def test_originals_match_inventory(self):
        for p in (TERCERA / 'nativo').glob('*.json'):
            rec = json.loads(p.read_text(encoding='utf8'))
            self.assertIs(rec['sha256_matches_inventory'], True, p.name)

    def test_public_outputs_have_no_private_fields(self):
        from forensic_check import private_leaks
        self.assertEqual(private_leaks(), [])


if __name__ == '__main__':
    unittest.main()
