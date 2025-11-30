import { create } from 'zustand';

type ActiveCollectionState = {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
};

export const useActiveCollectionStore = create<ActiveCollectionState>((set) => ({
  activeId: null,
  setActiveId: (id) => set({ activeId: id }),
}));
