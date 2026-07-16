import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import type { User, Permission, PermissionModule } from '../../types';
import { getUser, createUser, updateUser } from '../../api/userManagementApi';
import { ApiError } from '../../api/client';

// Exact field labels the backend's Permission rows use — must match
// backend/src/prisma/seed.ts's field constants exactly (see
// docs/FRONTEND_BUILD_PLAN.md Section 5.2) so a saved grant actually
// targets a real Permission row.
const MODULE_FIELDS: Record<PermissionModule, string[]> = {
  sales: ['Customer', 'Customer Address', 'Sales Person', 'Product', 'Ordered Quantity', 'Delivered Quantity', 'Sales Price', 'Status', 'Total', 'Creation Date'],
  purchase: ['Vendor', 'Vendor Address', 'Responsible Person', 'Product', 'Ordered Quantity', 'Received Quantity', 'Cost Price', 'Total', 'Creation Date'],
  manufacturing: ['Product to Manufacture', 'Product Quantity', 'BoM', 'Responsible Person', 'Finished Quantity', 'Creation Date'],
  product: ['Product', 'Sales Price', 'Cost Price', 'On Hand Qty', 'Free To Use Qty', 'Procure On Demand', 'Procurement Method', 'Vendor', 'Bill of Materials'],
};

const MODULES: { key: PermissionModule; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'product', label: 'Product' },
];

const ACTIONS: { key: keyof Pick<Permission, 'canCreate' | 'canView' | 'canEdit' | 'canDelete'>; label: string }[] = [
  { key: 'canCreate', label: 'Create' },
  { key: 'canView', label: 'View' },
  { key: 'canEdit', label: 'Edit' },
  { key: 'canDelete', label: 'Delete' },
];

function buildGrid(existing: Permission[]): Record<PermissionModule, Record<string, Permission>> {
  const grid = {} as Record<PermissionModule, Record<string, Permission>>;
  for (const mod of MODULES) {
    grid[mod.key] = {};
    for (const field of MODULE_FIELDS[mod.key]) {
      const found = existing.find((p) => p.module === mod.key && p.field === field);
      grid[mod.key][field] = found ?? { module: mod.key, field, canCreate: false, canView: false, canEdit: false, canDelete: false };
    }
  }
  return grid;
}

export function UserForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [user, setUser] = useState<Partial<User> & { password?: string } | null>(null);
  const [grid, setGrid] = useState<Record<PermissionModule, Record<string, Permission>>>(buildGrid([]));
  const [activeTab, setActiveTab] = useState<PermissionModule>('sales');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      getUser(Number(id)).then((u) => { setUser(u); setGrid(buildGrid(u.permissions)); }).catch((e) => setError(e.message));
    } else {
      setUser({ loginId: '', name: '', email: '', position: '', isAdmin: false, password: '' });
    }
  }, [id, isNew]);

  if (!user) return <div>Loading...</div>;

  const toggle = (mod: PermissionModule, field: string, action: keyof Permission) => {
    setGrid((g) => ({
      ...g,
      [mod]: { ...g[mod], [field]: { ...g[mod][field], [action]: !(g[mod][field] as any)[action] } },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const permissions = MODULES.flatMap((m) => Object.values(grid[m.key]));
      if (isNew) {
        await createUser({ loginId: user.loginId!, email: user.email!, password: user.password || 'Demo@1234', name: user.name!, position: user.position ?? undefined, isAdmin: user.isAdmin });
        navigate('/users');
      } else {
        await updateUser(Number(id), { name: user.name, position: user.position ?? undefined, isAdmin: user.isAdmin, permissions });
        navigate('/users');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
      setIsSaving(false);
    }
  };

  /** Toggles `action` for every field in `mod` at once (column select-all). */
  const toggleColumn = (mod: PermissionModule, action: keyof Permission, value: boolean) => {
    setGrid((g) => ({
      ...g,
      [mod]: Object.fromEntries(
        Object.entries(g[mod]).map(([field, perm]) => [field, { ...perm, [action]: value }])
      ),
    }));
  };

  /** Toggles every action for a single field at once (row select-all). */
  const toggleRow = (mod: PermissionModule, field: string, value: boolean) => {
    setGrid((g) => ({
      ...g,
      [mod]: { ...g[mod], [field]: { ...g[mod][field], canCreate: value, canView: value, canEdit: value, canDelete: value } },
    }));
  };

  return (
    <FormView
      title={isNew ? 'New User' : 'User Details'}
      onBack={() => navigate('/users')}
      actions={<Button onClick={handleSave} loading={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>}
    >
      <div className="p-6 space-y-6">
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isNew && <Input label="Login ID" value={user.loginId ?? ''} onChange={(e) => setUser({ ...user, loginId: e.target.value })} />}
          <Input label="Name" value={user.name ?? ''} onChange={(e) => setUser({ ...user, name: e.target.value })} />
          <Input label="Email" type="email" value={user.email ?? ''} onChange={(e) => setUser({ ...user, email: e.target.value })} disabled={!isNew} />
          {isNew && <Input label="Password" type="password" value={user.password ?? ''} onChange={(e) => setUser({ ...user, password: e.target.value })} />}
          <Input label="Position" value={user.position ?? ''} onChange={(e) => setUser({ ...user, position: e.target.value })} />
          <div className="flex items-center gap-3">
            <input type="checkbox" id="isAdmin" checked={user.isAdmin ?? false} onChange={(e) => setUser({ ...user, isAdmin: e.target.checked })} />
            <label htmlFor="isAdmin" className="text-sm font-medium">Admin (full access, bypasses the grid below)</label>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="font-medium text-lg mb-3">Permissions Grid</h3>
          <div className="flex border-b border-border mb-4">
            {MODULES.map((m) => (
              <button
                key={m.key}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === m.key ? 'border-primary text-primary' : 'border-transparent text-foreground/60'}`}
                onClick={() => setActiveTab(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-2">Field</th>
                  {ACTIONS.map((a) => {
                    const fields = MODULE_FIELDS[activeTab];
                    const checkedCount = fields.filter((f) => (grid[activeTab][f] as any)[a.key]).length;
                    return (
                      <th key={a.key} className="px-4 py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span>{a.label}</span>
                          <input
                            type="checkbox"
                            title={`Select all "${a.label}"`}
                            checked={checkedCount === fields.length}
                            ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && checkedCount < fields.length; }}
                            onChange={(e) => toggleColumn(activeTab, a.key, e.target.checked)}
                            disabled={!!user.isAdmin}
                          />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MODULE_FIELDS[activeTab].map((field) => {
                  const perm = grid[activeTab][field] as any;
                  const checkedCount = ACTIONS.filter((a) => perm[a.key]).length;
                  return (
                    <tr key={field}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            title="Select all actions for this field"
                            checked={checkedCount === ACTIONS.length}
                            ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && checkedCount < ACTIONS.length; }}
                            onChange={(e) => toggleRow(activeTab, field, e.target.checked)}
                            disabled={!!user.isAdmin}
                          />
                          {field}
                        </div>
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={perm[a.key]}
                            onChange={() => toggle(activeTab, field, a.key)}
                            disabled={!!user.isAdmin}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </FormView>
  );
}
