import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { createSignal } from '../../api/signalApi';
import { ApiError } from '../../api/client';

const SOURCE_TYPES = ['carpenter', 'contractor', 'dealer', 'supplier', 'warehouse_partner', 'transporter', 'employee', 'procurement_partner'];
const SIGNAL_TYPES = ['shortage', 'price_change', 'delay', 'availability'];

export function SignalForm() {
  const navigate = useNavigate();
  const [signal, setSignal] = useState({ sourceType: '', category: '', signalType: '', severity: 'medium', description: '' });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!signal.sourceType || !signal.signalType || !signal.description) {
      setError('Source Type, Signal Type, and Description are required.');
      return;
    }
    setIsSaving(true);
    try {
      await createSignal({
        sourceType: signal.sourceType,
        category: signal.category || undefined,
        signalType: signal.signalType,
        severity: signal.severity as 'low' | 'medium' | 'high',
        description: signal.description,
      });
      navigate('/signals');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
      setIsSaving(false);
    }
  };

  return (
    <FormView title="Report Market Signal" onBack={() => navigate('/signals')} actions={<Button onClick={handleSave} loading={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>}>
      <div className="p-6 space-y-6">
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground/80">Source Type</label>
            <select className="block w-full px-3 py-2 text-sm bg-card border border-border rounded-lg" value={signal.sourceType} onChange={(e) => setSignal({ ...signal, sourceType: e.target.value })}>
              <option value="">Select...</option>
              {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <Input label="Product Category (optional)" value={signal.category} onChange={(e) => setSignal({ ...signal, category: e.target.value })} />

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground/80">Signal Type</label>
            <select className="block w-full px-3 py-2 text-sm bg-card border border-border rounded-lg" value={signal.signalType} onChange={(e) => setSignal({ ...signal, signalType: e.target.value })}>
              <option value="">Select...</option>
              {SIGNAL_TYPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground/80">Severity</label>
            <select className="block w-full px-3 py-2 text-sm bg-card border border-border rounded-lg" value={signal.severity} onChange={(e) => setSignal({ ...signal, severity: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-foreground/80 block mb-1">Description</label>
            <textarea
              className="block w-full px-3 py-2 text-sm bg-card border border-border rounded-lg min-h-[100px]"
              value={signal.description}
              onChange={(e) => setSignal({ ...signal, description: e.target.value })}
            />
          </div>
        </div>
      </div>
    </FormView>
  );
}
