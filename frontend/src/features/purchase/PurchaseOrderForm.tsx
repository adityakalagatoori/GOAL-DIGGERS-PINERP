import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { usePermission } from '../../hooks/usePermission';
import type { PurchaseOrder, PurchaseOrderStatus, Product, Vendor } from '../../types';
import { getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, confirmPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder } from '../../api/purchaseApi';
import { listProducts } from '../../api/productApi';
import { listVendors } from '../../api/vendorApi';
import { listUserDirectory } from '../../api/userManagementApi';
import { ApiError } from '../../api/client';
import { DelayTracerModal } from '../delayTracer/DelayTracerModal';
import { AlertCircle, Trash2 } from 'lucide-react';

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft', confirmed: 'Confirmed', partially_received: 'Partially Received',
  fully_received: 'Fully Received', cancelled: 'Cancelled',
};

export function PurchaseOrderForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; position?: string | null }[]>([]);
  const [error, setError] = useState('');
  const [newProductId, setNewProductId] = useState<number | ''>('');
  const [newQty, setNewQty] = useState(1);
  const [isDelayModalOpen, setIsDelayModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const { canEdit: canEditVendor } = usePermission('purchase', 'Vendor');
  const { canEdit: canEditResponsible } = usePermission('purchase', 'Responsible Person');

  useEffect(() => {
    listProducts().then(setProducts).catch(console.error);
    listVendors().then(setVendors).catch(console.error);
    listUserDirectory().then(setUsers).catch(console.error);
    if (!isNew) {
      getPurchaseOrder(Number(id)).then(setOrder).catch((e) => setError(e.message));
    } else {
      setOrder({ id: 0, reference: 'New', vendorId: 0, status: 'draft', lines: [] });
    }
  }, [id, isNew]);

  if (!order) return <div>Loading...</div>;

  const isLocked = order.status !== 'draft';
  const canEditLines = !isLocked;

  const run = async (fn: () => Promise<PurchaseOrder>) => {
    setIsRunning(true);
    try {
      setOrder(await fn());
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setIsRunning(false);
    }
  };

  const handleVendorChange = (vendorId: number) => {
    const vendor = vendors.find((v) => v.id === vendorId);
    setOrder({
      ...order,
      vendorId,
      vendorAddress: order.vendorAddress || vendor?.address || order.vendorAddress,
    });
  };

  const handleAddLine = () => {
    if (!newProductId) return;
    const product = products.find((p) => p.id === newProductId);
    if (!product) return;
    setOrder({
      ...order,
      lines: [...order.lines, { id: -order.lines.length - 1, productId: product.id, product, orderedQty: newQty, receivedQty: 0, costUnitPrice: product.costPrice }],
    });
    setNewProductId('');
    setNewQty(1);
  };

  const handleRemoveLine = (lineId: number) => {
    setOrder({ ...order, lines: order.lines.filter((l) => l.id !== lineId) });
  };

  const handleSaveNew = () => {
    if (!order.vendorId || order.lines.length === 0) {
      setError('Vendor and at least one product line are required.');
      return;
    }
    run(() =>
      createPurchaseOrder({
        vendorId: order.vendorId,
        vendorAddress: order.vendorAddress ?? undefined,
        responsiblePersonId: order.responsiblePersonId ?? undefined,
        dueDate: order.dueDate ?? undefined,
        lines: order.lines.map((l) => ({ productId: l.productId, orderedQty: l.orderedQty })),
      })
    ).then(() => navigate('/purchase'));
  };

  const handleSaveDraft = () => {
    if (!order.vendorId || order.lines.length === 0) {
      setError('Vendor and at least one product line are required.');
      return;
    }
    run(() =>
      updatePurchaseOrder(order.id, {
        vendorId: order.vendorId,
        vendorAddress: order.vendorAddress ?? undefined,
        responsiblePersonId: order.responsiblePersonId ?? undefined,
        dueDate: order.dueDate ?? undefined,
        lines: order.lines.map((l) => ({ productId: l.productId, orderedQty: l.orderedQty })),
      })
    );
  };

  const handleReceive = () => {
    const lines = order.lines.map((l) => ({ lineId: l.id, receivedQty: l.receivedQty }));
    run(() => receivePurchaseOrder(order.id, lines));
  };

  const statusColor = order.status === 'confirmed' ? 'info' : order.status === 'fully_received' ? 'success' : order.status === 'partially_received' ? 'warning' : 'default';

  const isOverdue = order.status === 'confirmed' || order.status === 'partially_received';

  return (
    <>
    <DelayTracerModal isOpen={isDelayModalOpen} onClose={() => setIsDelayModalOpen(false)} orderType="purchase_order" orderId={order.id} />
    <FormView
      title={isNew ? 'New Purchase Order' : 'Purchase Order'}
      reference={!isNew ? order.reference : undefined}
      status={STATUS_LABEL[order.status]}
      statusColor={statusColor}
      onBack={() => navigate('/purchase')}
      auditModule="purchase"
      auditRecordId={!isNew ? order.id : undefined}
      actions={
        <>
          {isOverdue && (
            <Button variant="danger" className="gap-2 mr-auto" onClick={() => setIsDelayModalOpen(true)}>
              <AlertCircle className="w-4 h-4" /> Why is this late?
            </Button>
          )}
          {isNew && <Button onClick={handleSaveNew} loading={isRunning}>{isRunning ? 'Saving...' : 'Save'}</Button>}
          {!isNew && order.status === 'draft' && <Button onClick={handleSaveDraft} variant="secondary" loading={isRunning}>{isRunning ? 'Saving...' : 'Save'}</Button>}
          {!isNew && order.status === 'draft' && <Button onClick={() => run(() => confirmPurchaseOrder(order.id))} loading={isRunning}>Confirm</Button>}
          {!isNew && (order.status === 'confirmed' || order.status === 'partially_received') && (
            <Button onClick={handleReceive} variant="secondary" loading={isRunning}>{isRunning ? 'Receiving...' : 'Receive'}</Button>
          )}
          {!isNew && order.status !== 'fully_received' && order.status !== 'cancelled' && (
            <Button onClick={() => run(() => cancelPurchaseOrder(order.id))} variant="ghost" className="text-red-600" loading={isRunning}>Cancel</Button>
          )}
        </>
      }
    >
      <div className="p-6 space-y-6">
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Vendor</label>
            <select
              className="w-full border border-border rounded px-3 py-2 text-sm input"
              value={order.vendorId || ''}
              onChange={(e) => handleVendorChange(Number(e.target.value))}
              disabled={isLocked || !canEditVendor}
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.reference})</option>)}
            </select>
          </div>
          <Input label="Vendor Address" value={order.vendorAddress ?? ''} onChange={(e) => setOrder({ ...order, vendorAddress: e.target.value })} disabled={isLocked || !canEditVendor} />
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Responsible Person</label>
            <select
              className="w-full border border-border rounded px-3 py-2 text-sm input"
              value={order.responsiblePersonId ?? ''}
              onChange={(e) => setOrder({ ...order, responsiblePersonId: Number(e.target.value) || undefined })}
              disabled={isLocked || !canEditResponsible}
            >
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.position ? ` — ${u.position}` : ''}</option>)}
            </select>
          </div>
          <Input
            label="Due Date"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={order.dueDate ? order.dueDate.slice(0, 10) : ''}
            onChange={(e) => setOrder({ ...order, dueDate: e.target.value || null })}
            disabled={isLocked}
          />
        </div>

        <div>
          <h3 className="font-medium text-lg mb-4">Order Lines</h3>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Ordered Qty</th>
                  <th className="px-4 py-2">Received Qty</th>
                  <th className="px-4 py-2">Unit Cost</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  {canEditLines && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.lines.length > 0 ? order.lines.map((line, i) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">{line.product?.name ?? line.productId}</td>
                    <td className="px-4 py-3">
                      {canEditLines ? (
                        <input
                          type="number"
                          min={1}
                          className="w-20 border border-border rounded px-2 py-1"
                          value={line.orderedQty}
                          onChange={(e) => {
                            const lines = [...order.lines];
                            lines[i] = { ...line, orderedQty: Number(e.target.value) };
                            setOrder({ ...order, lines });
                          }}
                        />
                      ) : line.orderedQty}
                    </td>
                    <td className="px-4 py-3">
                      {!isNew && (order.status === 'confirmed' || order.status === 'partially_received') ? (
                        <input
                          type="number"
                          className="w-20 border border-border rounded px-2 py-1"
                          value={line.receivedQty}
                          min={0}
                          max={line.orderedQty}
                          onChange={(e) => {
                            const lines = [...order.lines];
                            lines[i] = { ...line, receivedQty: Number(e.target.value) };
                            setOrder({ ...order, lines });
                          }}
                        />
                      ) : (line.receivedQty || 0)}
                    </td>
                    <td className="px-4 py-3">₹{line.costUnitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{(line.orderedQty * line.costUnitPrice).toFixed(2)}</td>
                    {canEditLines && (
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => handleRemoveLine(line.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr><td colSpan={canEditLines ? 6 : 5} className="px-4 py-8 text-center text-foreground/60">No lines added yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {canEditLines && (
            <div className="flex items-end gap-3 mt-4">
              <select className="border border-border rounded px-3 py-2 text-sm flex-1" value={newProductId} onChange={(e) => setNewProductId(Number(e.target.value))}>
                <option value="">Select product...</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min={1} className="w-24 border border-border rounded px-2 py-2 text-sm" value={newQty} onChange={(e) => setNewQty(Number(e.target.value))} />
              <Button type="button" variant="secondary" onClick={handleAddLine}>Add Line</Button>
            </div>
          )}
        </div>
      </div>
    </FormView>
    </>
  );
}
