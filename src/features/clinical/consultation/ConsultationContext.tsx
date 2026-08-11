import { createContext, useCallback, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ConsultationBoardSlug, ConsultationContextValue, ConsultationDraft } from "./types";

interface ConsultationState {
  context: ConsultationContextValue;
  draft: ConsultationDraft;
  setDraft: Dispatch<SetStateAction<ConsultationDraft>>;
  updateDraft(updater: (draft: ConsultationDraft) => ConsultationDraft, dirtyBoard?: ConsultationBoardSlug): void;
  markBoardDirty(board: ConsultationBoardSlug): void;
  isDirty: boolean;
}

const Context = createContext<ConsultationState | null>(null);

export function ConsultationProvider({ context, initialDraft, children }: { context: ConsultationContextValue; initialDraft: ConsultationDraft; children: ReactNode }) {
  const [draft, setDraft] = useState(initialDraft);
  const updateDraft = useCallback((updater: (current: ConsultationDraft) => ConsultationDraft, dirtyBoard?: ConsultationBoardSlug) => {
    setDraft((current) => {
      const next = updater(current);
      if (!dirtyBoard || next.dirtyBoards.includes(dirtyBoard)) return next;
      return { ...next, dirtyBoards: [...next.dirtyBoards, dirtyBoard] };
    });
  }, []);
  const markBoardDirty = useCallback((board: ConsultationBoardSlug) => setDraft((current) => current.dirtyBoards.includes(board) ? current : { ...current, dirtyBoards: [...current.dirtyBoards, board] }), []);
  const value = useMemo(() => ({ context, draft, setDraft, updateDraft, markBoardDirty, isDirty: draft.dirtyBoards.length > 0 }), [context, draft, markBoardDirty, updateDraft]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useConsultation(): ConsultationState {
  const value = useContext(Context);
  if (!value) throw new Error("useConsultation debe usarse dentro de ConsultationProvider");
  return value;
}
