import { create } from 'zustand';
import type { Role, AppModule } from '../types';

type PermissionAction = 'canView' | 'canCreate' | 'canEdit' | 'canDelete' | 'canApprove' | 'canExport' | 'canImport';

interface RbacStore {
  role: Role | null;
  // Computed permission map: { [module]: { [action]: boolean } }
  permMap: Partial<Record<string, Partial<Record<PermissionAction, boolean>>>>;
  setRole: (role: Role | null) => void;
  can: (module: AppModule | string, action: PermissionAction) => boolean;
  canView: (module: AppModule | string) => boolean;
}

function buildPermMap(role: Role | null): RbacStore['permMap'] {
  if (!role) return {};
  const map: RbacStore['permMap'] = {};
  for (const p of role.permissions) {
    map[p.module] = {
      canView: p.canView,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      canApprove: p.canApprove,
      canExport: p.canExport,
      canImport: p.canImport,
    };
  }
  return map;
}

export const useRbacStore = create<RbacStore>((set, get) => ({
  role: null,
  permMap: {},

  setRole: (role) => {
    set({ role, permMap: buildPermMap(role) });
  },

  can: (module, action) => {
    const state = get();
    // Admins (isAdmin flag) are handled at the component level via useAuthStore
    return state.permMap[module]?.[action] ?? false;
  },

  canView: (module) => {
    return get().permMap[module]?.canView ?? false;
  },
}));
