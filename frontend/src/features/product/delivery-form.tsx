import { useState } from 'react';

// Formulario corto de una entrega: materiales (reciclables) y kilos opcionales.
export type Kind = 'organicos' | 'reciclables';
const MATERIALS: Record<Kind, string[]> = {
  organicos: ['Residuos orgánicos'],
  reciclables: [
    'Papel y cartón',
    'Plástico PET',
    'Plástico rígido',
    'Vidrio',
    'Metales',
    'Tetra Pak',
  ],
};

export function DeliveryForm({
  kind,
  saving,
  onSave,
  onCancel,
}: {
  kind: Kind;
  saving: boolean;
  onSave: (entregas: { material: string; cantidad: number | null }[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>(
    kind === 'organicos' ? { 'Residuos orgánicos': '' } : {},
  );
  const entries = Object.entries(picked);
  const valid =
    entries.length > 0 &&
    entries.every(([, value]) => value === '' || Number(value.replace(',', '.')) > 0);
  return (
    <form
      className="cp-entrega"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(
          entries.map(([material, value]) => ({
            material,
            cantidad: value === '' ? null : Math.round(Number(value.replace(',', '.')) * 10) / 10,
          })),
        );
      }}
    >
      {kind === 'reciclables' && (
        <div className="cp-materiales" role="group" aria-label="Materiales entregados">
          {MATERIALS.reciclables.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m in picked}
              onClick={() =>
                setPicked((current) => {
                  const next = { ...current };
                  if (m in next) delete next[m];
                  else next[m] = '';
                  return next;
                })
              }
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {entries.map(([material, value]) => (
        <label key={material} className="cp-kg">
          <span>{material}</span>
          <input
            inputMode="decimal"
            placeholder="kg (opcional)"
            aria-label={`Kilos de ${material}`}
            value={value}
            onChange={(event) =>
              setPicked((current) => ({ ...current, [material]: event.target.value }))
            }
          />
        </label>
      ))}
      <div className="cp-acciones">
        <button type="submit" className="is-ok" disabled={!valid || saving}>
          {saving ? 'Guardando…' : 'Guardar entrega'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
