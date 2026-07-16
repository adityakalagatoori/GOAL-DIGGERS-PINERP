import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import type { Bom, Product } from '../../types';
import { getBom, createBom, updateBom } from '../../api/bomApi';
import { listProducts } from '../../api/productApi';
import { listWorkCenters, type WorkCenter } from '../../api/workCenterApi';
import { ApiError, extractApiErrorMessage } from '../../api/client';

interface DraftComponent { componentId: number; toConsumeQty: number; }
interface DraftWorkOrder { operation: string; workCenterId: number; expectedDurationMins: number; }

export function BomForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [bom, setBom] = useState<Bom | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [productId, setProductId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState(1);
  const [shortReference, setShortReference] = useState('');
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [workOrders, setWorkOrders] = useState<DraftWorkOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'components' | 'workOrders'>('components');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listProducts().then(setProducts).catch(console.error);
    listWorkCenters().then(setWorkCenters).catch(console.error);
    if (!isNew) {
      getBom(Number(id)).then((b) => {
        setBom(b);
        setProductId(b.productId);
        setQuantity(b.quantity);
        setShortReference(b.shortReference ?? '');
        setComponents(b.components.map((c) => ({ componentId: c.componentId, toConsumeQty: c.toConsumeQty })));
        setWorkOrders(b.workOrderTemplates.map((w) => ({ operation: w.operation, workCenterId: w.workCenterId, expectedDurationMins: w.expectedDurationMins })));
      }).catch((e) => setError(e.message));
    }
  }, [id, isNew]);

  if (!isNew && !bom) return <div>Loading...</div>;

  const handleSave = async () => {
    if (!productId || components.length === 0 || workOrders.length === 0) {
      setError('Finished Product, at least one component, and at least one operation are required.');
      return;
    }
    setIsSaving(true);
    try {
      if (isNew) {
        await createBom({ productId, quantity, shortReference: shortReference || undefined, components, workOrderTemplates: workOrders });
      } else {
        await updateBom(Number(id), { quantity, shortReference: shortReference || undefined, components, workOrderTemplates: workOrders });
      }
      navigate('/bom');
    } catch (e) {
      setError(e instanceof ApiError ? extractApiErrorMessage(e) : 'Save failed');
      setIsSaving(false);
    }
  };

  return (
    <FormView
      title={isNew ? 'New Bill of Material' : 'Bill of Material'}
      reference={!isNew ? bom?.reference : undefined}
      onBack={() => navigate('/bom')}
      auditModule="manufacturing"
      auditEntity="Bom"
      auditRecordId={!isNew ? Number(id) : undefined}
      actions={<Button onClick={handleSave} loading={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>}
    >
      <div className="p-6 space-y-6">
        {isNew && (
          <p className="text-sm text-foreground/60">
            On Save, this creates a reusable template that can be selected when creating Manufacturing Orders.
          </p>
        )}
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isNew ? (
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Finished Product</label>
              <select className="w-full border border-border rounded px-3 py-2 text-sm" value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
                <option value="">Select product...</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          ) : (
            <Input label="Finished Product" value={bom?.product?.name ?? ''} disabled />
          )}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Quantity (Units)</label>
            <input
              type="number"
              className="w-full border border-border rounded px-3 py-2 text-sm"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <Input
            label="Reference"
            value={shortReference}
            onChange={(e) => setShortReference(e.target.value.slice(0, 8))}
            maxLength={8}
            placeholder="Max 8 characters"
          />
        </div>

        <div>
          <div className="flex border border-border rounded-lg overflow-hidden mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('components')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'components' ? 'bg-primary text-white' : 'bg-secondary text-foreground/70 hover:text-foreground'}`}
            >
              Components
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('workOrders')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'workOrders' ? 'bg-primary text-white' : 'bg-secondary text-foreground/70 hover:text-foreground'}`}
            >
              Work Orders
            </button>
          </div>

          {activeTab === 'components' ? (
            <div className="space-y-2">
              <div className="hidden md:flex gap-3 text-xs font-medium text-foreground/60 px-1">
                <span className="flex-1">Components</span>
                <span className="w-28">To Consume</span>
                <span className="w-20">Units</span>
              </div>
              {components.map((c, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <select className="flex-1 border border-border rounded px-3 py-2 text-sm" value={c.componentId} onChange={(e) => {
                    const next = [...components]; next[i] = { ...c, componentId: Number(e.target.value) }; setComponents(next);
                  }}>
                    <option value="">Select component...</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" className="w-28 border border-border rounded px-2 py-2 text-sm" placeholder="Qty" value={c.toConsumeQty} onChange={(e) => {
                    const next = [...components]; next[i] = { ...c, toConsumeQty: Number(e.target.value) }; setComponents(next);
                  }} />
                  <Button type="button" variant="ghost" className="text-red-600" onClick={() => setComponents(components.filter((_, idx) => idx !== i))}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setComponents([...components, { componentId: 0, toConsumeQty: 1 }])}>Add a product</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:flex gap-3 text-xs font-medium text-foreground/60 px-1">
                <span className="flex-1">Operations</span>
                <span className="w-44">Work Center</span>
                <span className="w-32">Expected Duration</span>
              </div>
              {workOrders.map((w, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <input className="flex-1 border border-border rounded px-3 py-2 text-sm" placeholder="Operation (e.g. Assembly)" value={w.operation} onChange={(e) => {
                    const next = [...workOrders]; next[i] = { ...w, operation: e.target.value }; setWorkOrders(next);
                  }} />
                  <select className="w-44 border border-border rounded px-3 py-2 text-sm" value={w.workCenterId} onChange={(e) => {
                    const next = [...workOrders]; next[i] = { ...w, workCenterId: Number(e.target.value) }; setWorkOrders(next);
                  }}>
                    <option value="">Work Center...</option>
                    {workCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                  </select>
                  <input type="number" className="w-32 border border-border rounded px-2 py-2 text-sm" placeholder="Minutes" value={w.expectedDurationMins} onChange={(e) => {
                    const next = [...workOrders]; next[i] = { ...w, expectedDurationMins: Number(e.target.value) }; setWorkOrders(next);
                  }} />
                  <Button type="button" variant="ghost" className="text-red-600" onClick={() => setWorkOrders(workOrders.filter((_, idx) => idx !== i))}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setWorkOrders([...workOrders, { operation: '', workCenterId: 0, expectedDurationMins: 10 }])}>Add a line</Button>
            </div>
          )}
        </div>
      </div>
    </FormView>
  );
}
