import { createContext, useContext } from 'react';

export const EditContext = createContext({
  dirty: () => {},
  saved: () => {},
  run: (action: () => void) => action(),
});
export function useWorkspaceEdits() {
  return useContext(EditContext);
}
