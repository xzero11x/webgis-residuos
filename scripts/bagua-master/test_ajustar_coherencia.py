"""Pruebas del ajuste de coherencia con geometrías sintéticas en metros (UTM).

  .venv-gis/Scripts/python -m unittest discover -s scripts/bagua-master -p "test_ajustar_coherencia.py"
"""
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, box

import ajustar_coherencia as ajuste


def grid_roads():
    """Cuadrícula de calles cada 100 m (residenciales), como un damero urbano."""
    roads = []
    for i in range(4):
        roads.append((f'h{i}', 'residential', LineString([(0, i * 100), (300, i * 100)])))
        roads.append((f'v{i}', 'residential', LineString([(i * 100, 0), (i * 100, 300)])))
    # Partir en los cruces, como hace Overture con sus conectores.
    split = []
    for rid, clase, line in roads:
        coords = sorted(set(line.coords) | {(x, y) for x in range(0, 301, 100) for y in range(0, 301, 100)
                                             if line.distance(LineString([(x, y), (x, y + 1e-9)])) < 1e-6})
        split.append((rid, clase, LineString(sorted(coords))))
    return split


class MapMatchingTest(unittest.TestCase):
    def setUp(self):
        self.net = ajuste.Network(grid_roads())

    def test_una_ruta_desplazada_queda_sobre_la_calle(self):
        # Recorrido en L dibujado 4 m al lado de las calles.
        route = LineString([(10, 4), (196, 4), (196, 190)])
        coords, sin_calle = ajuste.match_line(self.net, route)
        line = LineString(coords)
        pts = ajuste.sample(line, 2.0)
        dist = [min(abs(y % 100 if y % 100 < 50 else 100 - y % 100), abs(x % 100 if x % 100 < 50 else 100 - x % 100))
                for x, y in pts]
        self.assertLess(max(dist), 0.01)
        self.assertEqual(sin_calle, 0)

    def test_gira_por_el_cruce_y_no_corta_la_manzana(self):
        route = LineString([(10, 3), (198, 3), (198, 190)])
        coords, _ = ajuste.match_line(self.net, route)
        self.assertTrue(any(abs(x - 200) < 0.01 and abs(y) < 0.01 for x, y in coords))
        # Ningún vértice dentro de la manzana (0,0)-(100,100) sin estar en su borde.
        for x, y in coords:
            inside = 1 < x % 100 < 99 and 1 < y % 100 < 99
            self.assertFalse(inside, (x, y))

    def test_sin_calle_cercana_conserva_el_trazo(self):
        far = LineString([(1000, 1000), (1100, 1000)])
        coords, sin_calle = ajuste.match_line(self.net, far)
        self.assertGreater(sin_calle, 0)
        self.assertAlmostEqual(coords[0][0], 1000)

    def test_la_traslacion_por_ruta_recupera_el_desfase(self):
        route = LineString([(20, 6), (180, 6)])
        dx, dy = ajuste.best_translation(self.net, [route])
        self.assertAlmostEqual(dy, -6, delta=0.5)


class LimpiezaTest(unittest.TestCase):
    def test_quita_picos_de_ida_y_vuelta(self):
        coords = [(0, 0), (50, 0), (50, 8), (50, 0.1), (100, 0)]
        cleaned = ajuste.clean(coords)
        self.assertNotIn((50, 8), cleaned)

    def test_conserva_los_giros_reales(self):
        coords = [(0, 0), (100, 0), (100, 100)]
        self.assertEqual(ajuste.clean(coords), coords)


class InvasionTest(unittest.TestCase):
    def test_mide_la_fraccion_de_huella_sobre_la_calzada(self):
        roads = [('r', 'residential', LineString([(0, 0), (100, 0)]))]
        corr, tree = ajuste.corridors(roads)
        on_road, _ = ajuste.invasion_of(box(10, -2, 20, 2), corr, tree)
        beside, _ = ajuste.invasion_of(box(10, 3, 20, 13), corr, tree)
        half, _ = ajuste.invasion_of(box(10, 1, 20, 5), corr, tree)
        self.assertAlmostEqual(on_road, 1.0)
        self.assertAlmostEqual(beside, 0.0)
        self.assertAlmostEqual(half, 0.5)


class EspaciosAbiertosTest(unittest.TestCase):
    def test_una_glorieta_dentro_de_la_plaza_se_reconoce_y_una_casa_vecina_no(self):
        plaza = np.asarray([box(0, 0, 80, 80)], dtype=object)
        tree = ajuste.STRtree(plaza)
        glorieta = box(35, 35, 45, 45)
        casa_en_el_borde = box(75, 10, 95, 20)  # solo 25 % dentro
        self.assertGreaterEqual(ajuste.in_open_space(glorieta, plaza, tree), ajuste.DENTRO_ESPACIO_ABIERTO)
        self.assertLess(ajuste.in_open_space(casa_en_el_borde, plaza, tree), ajuste.DENTRO_ESPACIO_ABIERTO)


class OriginalesTest(unittest.TestCase):
    def test_nunca_ajusta_dos_veces_y_detecta_un_original_nuevo(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'capa.geojsonl'
            path.write_text('original\n', encoding='utf8')
            folder = Path(tmp) / 'original'
            self.assertEqual(ajuste.keep_original(path, folder).read_text(encoding='utf8'), 'original\n')
            # El ajuste escribe su salida y la marca: la siguiente corrida sigue partiendo del original.
            path.write_text('ajustada\n', encoding='utf8')
            ajuste.mark_adjusted(path)
            self.assertEqual(ajuste.keep_original(path, folder).read_text(encoding='utf8'), 'original\n')
            # Un proceso anterior regenera la capa: el original se renueva.
            path.write_text('original nuevo\n', encoding='utf8')
            self.assertEqual(ajuste.keep_original(path, folder).read_text(encoding='utf8'), 'original nuevo\n')
            self.assertTrue(json.loads((folder / '.ajustado.json').read_text(encoding='utf8')))


if __name__ == '__main__':
    unittest.main()
