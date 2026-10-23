"""Folder holding the municipal originals: rutas/ (current) or rustas/ (first delivery)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = next((ROOT / name for name in ('rutas', 'rustas') if (ROOT / name).is_dir()), ROOT / 'rutas')
