import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { management, type Predio } from './api';
import { useWorkspaceEdits } from './workspace-edits-context';
export function PredioArchive({ predio }: { predio: Predio }) {
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const client = useQueryClient(),
    edits = useWorkspaceEdits();
  return (
    <div>
      <Button variant="outline" onClick={() => edits.run(() => setOpen(!open))}>
        {predio.archivado ? 'Restaurar predio' : 'Archivar predio'}
      </Button>
      {open && (
        <form
          className="gm-form"
          data-unsaved-form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError('');
            try {
              await management(`/predios/${predio.id}/archivo`, 'POST', {
                archivado: !predio.archivado,
                version: predio.version,
                motivo: new FormData(e.currentTarget).get('motivo'),
              });
              edits.saved();
              setOpen(false);
              await client.invalidateQueries({ queryKey: ['gestion'] });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'No se pudo guardar.');
            } finally {
              setPending(false);
            }
          }}
        >
          <p>Se conservan relaciones, eventos e historial. Archivar impide nuevas operaciones.</p>
          <label>
            Motivo de archivo o restauración
            <input name="motivo" required minLength={5} maxLength={1000} />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button disabled={pending} type="submit">
            Confirmar estado del predio
          </Button>
        </form>
      )}
    </div>
  );
}
