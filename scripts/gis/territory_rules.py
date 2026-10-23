"""Reglas de conciliación territorial: clasificación, identidad, nombres y privacidad.

Funciones puras, sin entrada/salida, para poder probarlas de forma aislada
(scripts/gis/tests/test_territory.py). Versión de las reglas: RULES_VERSION.

Principios aplicados aquí:
- La coincidencia espacial no implica identidad. Dos elementos solo se funden si
  son de la misma clase y su geometría coincide en el marco adoptado, con una
  tolerancia que depende del tipo de elemento (no hay una tolerancia universal).
- Una misma forma con clases distintas (VIVIENDA frente a Limite Lote) se relaciona,
  no se funde.
- Las calles no tienen geometría de vía en la fuente: se agrupan por nombre
  normalizado y se conservan los rótulos como representaciones.
"""
import re
import unicodedata

RULES_VERSION = 1

# Tolerancias de identidad por tipo de elemento (metros, distancia de Hausdorff).
TOLERANCE_M = {'polygon': 0.05, 'line': 0.20, 'point': 0.05, 'text': 1.0}

# Clase territorial a partir de la capa CAD. El orden no importa: cada capa tiene una sola clase.
MANZANA_LAYERS = {'Limite Manzana', 'MANZANAS', 'MANZANA', 'MANZANAS EXISTENTES',
                  'MANZANA EXISTENTES', 'MANZANA topografia'}
LOTE_LAYERS = {'Limite Lote', 'LOTE', 'lote1', 'LOTES INVADIDOS', 'LOTES LEVAANTADO'}
VIVIENDA_LAYER = 'VIVIENDA'
CALLE_LAYER = 'CALLES'
SECTOR_PREFIX = re.compile(r'^SECT(OR)?\.?\s', re.I)
# Capas de sector que no son un sector (perímetros, secciones o rótulos).
SECTOR_EXCLUDED = {'SECTOR LA PRIMAVERA I', 'SECTOR LA PRIMAVERA', 'SECTOR BRUJO PATA'}

# Nombres que no identifican un sector o una calle: cada rótulo queda separado.
GENERIC_NAMES = {'SECTOR', 'LOTIZACION', 'SECCION', 'CALLE', 'JR', 'AV', 'CA', 'PSJE', 'SECT'}

LOTE_SITUATION = {'LOTES INVADIDOS': 'invadido', 'LOTES LEVAANTADO': 'levantamiento'}

ABBREVIATIONS = {
    'JIRON': 'JR', 'JR': 'JR',
    'AVENIDA': 'AV', 'AV': 'AV',
    'CALLE': 'CA', 'CA': 'CA',
    'PASAJE': 'PSJE', 'PSJE': 'PSJE', 'PJE': 'PSJE', 'PSJ': 'PSJE',
    'PROLONGACION': 'PROLG', 'PROLONG': 'PROLG', 'PROLG': 'PROLG', 'PRLG': 'PROLG', 'PROL': 'PROLG',
    'CARRETERA': 'CARR', 'CARR': 'CARR',
}
CUADRA = re.compile(r'\s+(CD|CDR|CDRA)\.?\s*\d+\s*$', re.I)


def strip_accents(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c))


def classify(layer, entity_type, geometry_type, text=None):
    """Return (kind, detail) for a CAD feature, or (None, reason) if it is not territorial."""
    if layer in MANZANA_LAYERS and geometry_type in ('Polygon', 'LineString'):
        return 'manzana', None
    if layer in LOTE_LAYERS and geometry_type in ('Polygon', 'LineString'):
        return 'lote', LOTE_SITUATION.get(layer)
    if layer == VIVIENDA_LAYER and geometry_type in ('Polygon', 'LineString'):
        return 'vivienda', None
    if layer == CALLE_LAYER and entity_type in ('TEXT', 'MTEXT') and text:
        return 'calle', None
    if (SECTOR_PREFIX.match(layer or '') and layer not in SECTOR_EXCLUDED
            and geometry_type in ('Polygon', 'LineString') and entity_type not in ('TEXT', 'MTEXT')):
        return 'sector', sector_name(layer)
    return None, 'fuera de las clases territoriales consolidadas'


def sector_name(layer):
    return normalize_name(SECTOR_PREFIX.sub('', layer or '', count=1))


def normalize_name(text):
    """Forma canónica de un nombre de vía o sector: sin tildes, mayúsculas, abreviaturas unificadas."""
    if not text:
        return ''
    value = strip_accents(text).upper().replace('\n', ' ')
    value = re.sub(r'[^A-Z0-9 .\-/]', ' ', value)
    value = CUADRA.sub('', value)  # cuadra o cuadrante: se guarda aparte, no cambia la vía
    value = value.replace('.', ' ')
    tokens = [t for t in value.split() if t]
    if tokens and tokens[0] in ABBREVIATIONS:
        tokens[0] = ABBREVIATIONS[tokens[0]]
    return ' '.join(tokens)


def cuadra(text):
    """Cuadra o cuadrante de un nombre (p. ej. «CDR. 3»), o None."""
    match = CUADRA.search(strip_accents(text or '').upper().replace('.', '. '))
    if not match:
        return None
    digits = re.search(r'\d+', match.group(0))
    return digits.group(0) if digits else None


def is_generic_name(normalized):
    return normalized in GENERIC_NAMES


def tolerance(kind_geometry):
    return TOLERANCE_M[kind_geometry]


def geometry_class(geometry_type):
    return {'Polygon': 'polygon', 'LineString': 'line', 'Point': 'point'}.get(geometry_type, 'other')


def is_identity(hausdorff_m, geometry_type_a, geometry_type_b, same_kind):
    """Identidad geométrica: misma clase territorial, mismo tipo de geometría y Hausdorff dentro de tolerancia."""
    if not same_kind or geometry_type_a != geometry_type_b:
        return False
    return hausdorff_m <= tolerance(geometry_class(geometry_type_a))


PERSONAL_NAME_MARKERS = re.compile(
    r'\b(PROPIETARIO|TITULAR|SUCESI|CERTIF|POSES|POSEC|RESOLUC|SUB ?DIVI|TITULO|ESPOSO|VDA\.?)', re.I)


def is_publishable_text(text):
    """Filtro de privacidad: rechaza textos administrativos o de trámite de predios individuales."""
    return not PERSONAL_NAME_MARKERS.search(strip_accents(text or '').upper())


TECHNICAL_TEXT = re.compile(r'^[\d.,:/\- ]+[A-Z]?$|^[A-Z]{1,2}-?\d{1,3}[A-Z]?$|^\d{1,4}[A-Z]$', re.I)
STREET_TEXT = re.compile(r'^(JR|JIRON|AV|AVENIDA|CA|CALLE|PSJE|PASAJE|PJE|PROLG|PROLONG|PRLG|CARR|CARRETERA|MALECON|CAMINO|TROCHA|SECTOR|SECT|LOTE|LOTIZACION|MZ|MANZANA)', re.I)


def is_technical_or_street_text(text):
    """Textos que pueden publicarse sin revisión: medidas, códigos de lote o nombres de vía/sector."""
    value = strip_accents(text or '').strip()
    return bool(TECHNICAL_TEXT.match(value) or STREET_TEXT.match(value))

