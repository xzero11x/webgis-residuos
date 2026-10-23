import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useBaguaMasterSearch } from '../hooks/use-bagua-master';
import type { SearchResult } from '../types';

// Búsqueda de lugares y calles por nombre, solo en los datos de Overture de BAGUA MASTER.
export function SearchBox({ onPick }: { onPick: (result: SearchResult) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useBaguaMasterSearch(q);
  const items = results.data ?? [];
  return (
    <div className="bm-search">
      <label className="bm-search-field">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={q}
          placeholder="Buscar calle o lugar"
          aria-label="Buscar calle o lugar en Bagua"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQ(event.target.value);
            setOpen(true);
          }}
        />
        {q && (
          <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ('')}>
            <X size={14} />
          </button>
        )}
      </label>
      {open && q.trim().length >= 2 && (
        <ul className="bm-search-results" aria-label="Resultados">
          {results.isPending && <li className="bm-search-empty">Buscando…</li>}
          {!results.isPending && !items.length && (
            <li className="bm-search-empty">Sin resultados.</li>
          )}
          {items.map((item) => (
            <li key={`${item.tabla}-${item.id}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(item);
                  setOpen(false);
                }}
              >
                <strong>{item.nombre}</strong>
                <span>
                  {item.tabla === 'lugar' ? (item.tipo?.replace(/_/g, ' ') ?? 'lugar') : 'calle'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
