"""Pruebas de las reglas de fusión con geometrías sintéticas en metros (UTM).

  .venv-gis/Scripts/python -m unittest discover -s scripts/bagua-master -p "test_fusionar_edificaciones.py"
"""
import unittest

import numpy as np
from shapely import STRtree
from shapely.geometry import Polygon, box

import fusionar_edificaciones as fusion


def house(x, y, w=8, h=6):
    return box(x, y, x + w, y + h)


def run(base, candidates, confidences=None, water=(), filter_area=True):
    accepted = np.asarray(base, dtype=object)
    tree = STRtree(accepted)
    water = np.asarray(list(water), dtype=object)
    water_tree = STRtree(water) if len(water) else None
    cands = np.asarray(candidates, dtype=object)
    keys = np.asarray(confidences if confidences is not None else [0.5] * len(candidates))
    return fusion.conflate(cands, keys, tree, accepted, water_tree, water, filter_area)


class ConflacionTest(unittest.TestCase):
    def test_acepta_una_casa_nueva_sin_vecinas(self):
        chosen, funnel = run([house(0, 0)], [house(100, 100)])
        self.assertEqual(chosen, [0])
        self.assertEqual(funnel['aceptadas'], 1)

    def test_rechaza_la_misma_casa_con_un_metro_de_desfase(self):
        chosen, funnel = run([house(0, 0)], [house(1, 1)])
        self.assertEqual(chosen, [])
        self.assertEqual(funnel['duplicadas_de_fuentes_previas'], 1)

    def test_conserva_una_vecina_pegada_que_solo_comparte_pared(self):
        chosen, _ = run([house(0, 0)], [house(8, 0)])
        self.assertEqual(chosen, [0])

    def test_rechaza_candidata_que_cubre_una_huella_ya_aceptada(self):
        # Una huella grande que contiene a la ya aceptada duplicaría la misma construcción.
        chosen, funnel = run([house(10, 10, 8, 6)], [box(0, 0, 30, 25)])
        self.assertEqual(chosen, [])
        self.assertEqual(funnel['duplicadas_de_fuentes_previas'], 1)

    def test_filtra_por_area_solo_en_fuentes_inferidas(self):
        tiny, huge = box(0, 0, 3, 3), box(500, 500, 600, 600)
        chosen, funnel = run([house(1000, 1000)], [tiny, huge])
        self.assertEqual(chosen, [])
        self.assertEqual(funnel['descartadas_por_area'], 2)
        chosen, _ = run([house(1000, 1000)], [tiny], filter_area=False)
        self.assertEqual(chosen, [0])

    def test_descarta_candidatas_sobre_agua(self):
        river = [box(-50, -50, 50, 50)]
        chosen, funnel = run([house(1000, 1000)], [house(5, 5)], water=river)
        self.assertEqual(chosen, [])
        self.assertEqual(funnel['descartadas_por_agua'], 1)

    def test_entre_candidatas_de_la_misma_fuente_gana_la_de_mayor_confianza(self):
        a, b = house(100, 100), house(101, 100)
        chosen, funnel = run([house(0, 0)], [a, b], confidences=[0.66, 0.91])
        self.assertEqual(chosen, [1])
        self.assertEqual(funnel['duplicadas_en_la_misma_fuente'], 1)

    def test_no_cambia_la_base(self):
        base = [house(0, 0)]
        before = [g.wkt for g in base]
        run(base, [house(1, 1), house(100, 100)])
        self.assertEqual([g.wkt for g in base], before)


class RegularizacionTest(unittest.TestCase):
    def test_una_huella_casi_rectangular_se_endereza(self):
        wobbly = Polygon([(0, 0), (8, 0.2), (8.1, 6), (0, 5.9)])
        geom, method, iou = fusion.regularize(wobbly)
        self.assertEqual(method, 'rectangulo')
        self.assertGreaterEqual(iou, 0.9)
        self.assertLess(abs(geom.area - wobbly.area) / wobbly.area, 0.1)

    def test_una_huella_en_ele_no_se_convierte_en_rectangulo(self):
        ele = Polygon([(0, 0), (10, 0), (10, 3), (3, 3), (3, 10), (0, 10)])
        _, method, _ = fusion.regularize(ele)
        self.assertNotEqual(method, 'rectangulo')

    def test_el_resultado_sigue_siendo_un_poligono_valido(self):
        geom, _, _ = fusion.regularize(house(0, 0))
        self.assertEqual(geom.geom_type, 'Polygon')
        self.assertTrue(geom.is_valid)


class IdentificadoresTest(unittest.TestCase):
    def test_el_identificador_es_estable_y_lleva_la_fuente(self):
        a = fusion.stable_id('ms_buildings', 'ms:abc')
        self.assertEqual(a, fusion.stable_id('ms_buildings', 'ms:abc'))
        self.assertTrue(a.startswith('cmp-ms_buildings-'))
        self.assertNotEqual(a, fusion.stable_id('osm', 'ms:abc'))


if __name__ == '__main__':
    unittest.main()
