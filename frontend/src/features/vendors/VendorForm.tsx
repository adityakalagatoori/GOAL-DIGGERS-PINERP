import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { Vendor, VendorPerformance } from '../../types';
import { getVendor, createVendor, updateVendor, getVendorPerformance } from '../../api/vendorApi';
import { ApiError } from '../../api/client';

export function VendorForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [performance, setPerformance] = useState<VendorPerformance | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      getVendor(Number(id)).then(setVendor).catch((e) => setError(e.message));
      getVendorPerformance(Number(id)).then(setPerformance).catch(console.error);
    } else {
      setVendor({ id: 0, reference: 'New', name: '' });
    }
  }, [id, isNew]);

  if (!vendor) return <div>Loading...</div>;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isNew) await createVendor({ name: vendor.name, address: vendor.address ?? undefined, contact: vendor.contact ?? undefined });
      else await updateVendor(vendor.id, { name: vendor.name, address: vendor.address ?? undefined, contact: vendor.contact ?? undefined });
      navigate('/vendors');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
      setIsSaving(false);
    }
  };

  return (
    <FormView title={isNew ? 'New Vendor' : 'Vendor Profile'} reference={!isNew ? vendor.reference : undefined} onBack={() => navigate('/vendors')} actions={<Button onClick={handleSave} loading={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>}>
      <div className="p-6 space-y-6">
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input label="Vendor Name" value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} />
          <Input label="Contact" value={vendor.contact ?? ''} onChange={(e) => setVendor({ ...vendor, contact: e.target.value })} />
          <Input label="Address" value={vendor.address ?? ''} onChange={(e) => setVendor({ ...vendor, address: e.target.value })} />
        </div>

        {!isNew && performance && (
          <div className="mt-8">
            <h3 className="font-medium text-lg mb-4">Performance Scorecard</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 bg-green-50 dark:bg-green-500/10 border-green-100 dark:border-green-500/20">
                <p className="text-sm text-green-800 dark:text-green-400 mb-1">On-Time Delivery</p>
                <p className="text-2xl font-semibold text-green-900 dark:text-green-300">{performance.onTimePct !== null ? `${performance.onTimePct}%` : 'Insufficient data'}</p>
              </Card>
              <Card className="p-4 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20">
                <p className="text-sm text-blue-800 dark:text-blue-400 mb-1">Defect Rate</p>
                <p className="text-2xl font-semibold text-blue-900 dark:text-blue-300">{performance.defectRate !== null ? `${(performance.defectRate * 100).toFixed(0)}%` : 'Insufficient data'}</p>
              </Card>
              <Card className="p-4 bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20">
                <p className="text-sm text-purple-800 dark:text-purple-400 mb-1">Lead Time Adherence</p>
                <p className="text-2xl font-semibold text-purple-900 dark:text-purple-300">{performance.leadTimeAdherence !== null ? performance.leadTimeAdherence : 'Insufficient data'}</p>
              </Card>
            </div>
            {performance.incidents.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Quality Incidents</h4>
                <ul className="text-sm space-y-1">
                  {performance.incidents.map((inc, i) => <li key={i} className="text-foreground/70">• {inc.description} ({inc.severity})</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </FormView>
  );
}
