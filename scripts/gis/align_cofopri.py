"""Measure where COFOPRI BAGUA.dwg sits relative to the EPSG:32717 route CAD.

COFOPRI declares no CRS. Its vertices coincide with RUTAS CON TIEMPO after a
uniform translation close to the PSAD56 -> WGS84 shift, which identifies the
route base as COFOPRI moved by a constant offset. The measured translation, not
the generic PSAD56 transform, is what places it on top of the routes.

Writes data/cad/extracted/cofopri-alineacion.json, read by reconcile_cad.py.
The translation was adopted as COFOPRI's CRS on 16/10/2026 ('adoptado').
"""
import json
from deep_derive import EXT, estimate_shift

SOURCE = 'COFOPRI BAGUA.dwg'
NOTE = ('Coincidencia milimétrica con el CAD EPSG:32717 tras una traslación uniforme próxima '
        'al cambio PSAD56 → WGS84. El dibujo está en PSAD56 / UTM 17S y la base de rutas es '
        'COFOPRI desplazado con un valor constante. La traslación medida reproduce esa base '
        'mejor que la transformación PSAD56 genérica (diferencia ≈3 m).')

if __name__ == '__main__':
    result = estimate_shift(SOURCE, NOTE)
    t, e = result['translation_m'], result['psad56_expected_shift_m']
    result['psad56_difference_m'] = round(((t['dE'] - e['dE']) ** 2 + (t['dN'] - e['dN']) ** 2) ** 0.5, 2)
    (EXT / 'cofopri-alineacion.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({k: result[k] for k in ('translation_m', 'vertices_within_5cm', 'rms_within_5cm_m',
                                            'psad56_expected_shift_m', 'psad56_difference_m')}, ensure_ascii=False))
