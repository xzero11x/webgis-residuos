"""Pruebas de las reglas de conciliación territorial (sin datos reales)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import territory_rules as rules  # noqa: E402


class ClassificationTests(unittest.TestCase):
    def test_manzana_lote_vivienda_by_layer(self):
        self.assertEqual(rules.classify('Limite Manzana', 'LWPOLYLINE', 'Polygon')[0], 'manzana')
        self.assertEqual(rules.classify('MANZANAS', 'LWPOLYLINE', 'Polygon')[0], 'manzana')
        self.assertEqual(rules.classify('Limite Lote', 'LWPOLYLINE', 'Polygon')[0], 'lote')
        self.assertEqual(rules.classify('VIVIENDA', 'LWPOLYLINE', 'Polygon')[0], 'vivienda')

    def test_invadido_is_lote_with_situation(self):
        kind, detail = rules.classify('LOTES INVADIDOS', 'LWPOLYLINE', 'Polygon')
        self.assertEqual((kind, detail), ('lote', 'invadido'))

    def test_street_only_from_text(self):
        self.assertEqual(rules.classify('CALLES', 'TEXT', 'Point', text='JR. TACNA')[0], 'calle')
        self.assertIsNone(rules.classify('CALLES', 'LINE', 'LineString')[0])

    def test_sector_from_layer_name_excludes_perimeters(self):
        kind, name = rules.classify('SECT. CESAR VALLEJO', 'HATCH_BOUNDARY', 'Polygon')
        self.assertEqual((kind, name), ('sector', 'CESAR VALLEJO'))
        self.assertIsNone(rules.classify('PERIMETRO-SECTOR I', 'LINE', 'LineString')[0])
        self.assertIsNone(rules.classify('SECTOR LA PRIMAVERA I', 'MTEXT', 'Point', text='x')[0])

    def test_non_territorial_layer_is_not_consolidated(self):
        self.assertIsNone(rules.classify('ACOTAMIENTO', 'LINE', 'LineString')[0])
        self.assertIsNone(rules.classify('DETALLES', 'LINE', 'LineString')[0])


class NameTests(unittest.TestCase):
    def test_abbreviations_and_accents_collapse(self):
        self.assertEqual(rules.normalize_name('Jirón Tacna'), 'JR TACNA')
        self.assertEqual(rules.normalize_name('JR. TACNA'), 'JR TACNA')
        self.assertEqual(rules.normalize_name('Psje. San Martín'), 'PSJE SAN MARTIN')
        self.assertEqual(rules.normalize_name('AV. CIRCUNVALACIÓN'), 'AV CIRCUNVALACION')
        self.assertEqual(rules.normalize_name('Prolg Av. CIRCUNVALACION'), 'PROLG AV CIRCUNVALACION')

    def test_cuadra_is_kept_apart_from_street(self):
        self.assertEqual(rules.normalize_name('AV MARIANO MELGAR CDR. 3'), 'AV MARIANO MELGAR')
        self.assertEqual(rules.cuadra('AV MARIANO MELGAR CDR. 3'), '3')
        self.assertIsNone(rules.cuadra('AV. MARIANO MELGAR'))

    def test_sector_name_from_layer(self):
        self.assertEqual(rules.sector_name('SECT. URB. MARAÑON'), 'URB MARANON')
        self.assertEqual(rules.sector_name('SECTOR SAN MARTIN'), 'SAN MARTIN')


class IdentityTests(unittest.TestCase):
    def test_identical_polygons_within_tolerance_are_identity(self):
        self.assertTrue(rules.is_identity(0.03, 'Polygon', 'Polygon', True))

    def test_polygon_beyond_tolerance_is_not_identity(self):
        self.assertFalse(rules.is_identity(0.06, 'Polygon', 'Polygon', True))

    def test_lines_have_their_own_tolerance(self):
        self.assertTrue(rules.is_identity(0.15, 'LineString', 'LineString', True))
        self.assertFalse(rules.is_identity(0.15, 'Polygon', 'LineString', True))

    def test_different_kind_never_identity_even_if_same_geometry(self):
        # VIVIENDA y Limite Lote con la misma forma: relación, no identidad.
        self.assertFalse(rules.is_identity(0.0, 'Polygon', 'Polygon', False))


class PrivacyTests(unittest.TestCase):
    def test_administrative_trámite_text_is_withheld(self):
        self.assertFalse(rules.is_publishable_text('CERTIFICADO DE POSESION 10/10/18'))
        self.assertFalse(rules.is_publishable_text('RESOLUCION DE SUB DIVICION 17/08/18'))

    def test_street_and_lot_text_is_published(self):
        self.assertTrue(rules.is_publishable_text('JR. LA VERDAD'))
        self.assertTrue(rules.is_publishable_text('LOTE 13A'))


if __name__ == '__main__':
    unittest.main()
