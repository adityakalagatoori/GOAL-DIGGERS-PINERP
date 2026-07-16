import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { usePermission } from '../../hooks/usePermission';
import type { ManufacturingOrder, ManufacturingOrderStatus, Product, Bom } from '../../types';
import {
  getManufacturingOrder, createManufacturingOrder, updateManufacturingOrder, confirmManufacturingOrder, startManufacturingOrder,
  produceManufacturingOrder, cancelManufacturingOrder, updateComponentConsumption, updateWorkOrderDuration,
} from '../../api/manufacturingApi';
import { listProducts } from '../../api/productApi';
import { listBoms } from '../../api/bomApi';
import { listUserDirectory } from '../../api/userManagementApi';
import { ApiError } from '../../api/client';
import { DelayTracerModal } from '../delayTracer/DelayTracerModal';
import { AlertCircle } from 'lucide-react';

const STATUS_LABEL: Record<ManufacturingOrderStatus, string> = {
  draft: 'Draft', confirmed: 'Confirmed', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled',
};

export function ManufacturingOrderForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [order, setOrder] = useState<ManufacturingOrder | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; position?: string | null }[]>([]);
  const [error, setError] = useState('');
  const [isDelayModalOpen, setIsDelayModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const { canEdit: canEditProduct } = usePermission('manufacturing', 'Product to Manufacture');
  const { canEdit: canEditQty } = usePermission('manufacturing', 'Product Quantity');

  useEffect(() => {
    listProducts().then(setProducts).catch(console.error);
    listBoms().then(setBoms).catch(console.error);
    listUserDirectory().then(setUsers).catch(console.error);
    if (!isNew) {
      getManufacturingOrder(Number(id)).then(setOrder).catch((e) => setError(e.message));
    } else {
      setOrder({ id: 0, reference: 'New', finishedProductId: 0, quantity: 1, status: 'draft', components: [], workOrders: [] });
    }
  }, [id, isNew]);

  if (!order) return <div>Loading...</div>;

  const isLocked = order.status !== 'draft';
  const bomsForProduct = boms.filter((b) => b.productId === order.finishedProductId);

  const run = async (fn: () => Promise<ManufacturingOrder>) => {
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

  const handleSaveNew = () => {
    if (!order.finishedProductId) {
      setError('Finished Product is required.');
      return;
    }
    run(() =>
      createManufacturingOrder({
        finishedProductId: order.finishedProductId,
        quantity: order.quantity,
        bomId: order.bomId ?? undefined,
        scheduleDate: order.scheduleDate ?? undefined,
        assigneeId: order.assigneeId ?? undefined,
      })
    ).then(() => navigate('/manufacturing'));
  };

  const handleSaveDraft = () => {
    run(() =>
      updateManufacturingOrder(order.id, {
        quantity: order.quantity,
        scheduleDate: order.scheduleDate ?? undefined,
        assigneeId: order.assigneeId ?? undefined,
      })
    );
  };

  const handleSaveConsumption = () => {
    run(() => updateComponentConsumption(order.id, order.components.map((c) => ({ id: c.id, consumedQty: c.consumedQty }))));
  };

  const handleSaveDurations = () => {
    run(() => updateWorkOrderDuration(order.id, order.workOrders.map((w) => ({ id: w.id, realDurationMins: w.realDurationMins ?? 0 }))));
  };

  const statusColor = order.status === 'confirmed' ? 'info' : order.status === 'done' ? 'success' : order.status === 'in_progress' ? 'warning' : 'default';
  const canEditComponents = order.status === 'confirmed' || order.status === 'in_progress';

  const isOverdue = order.status === 'confirmed' || order.status === 'in_progress';

  return (
    <>
    <DelayTracerModal isOpen={isDelayModalOpen} onClose={() => setIsDelayModalOpen(false)} orderType="manufacturing_order" orderId={order.id} />
    <FormView
      title={isNew ? 'New Manufacturing Order' : 'Manufacturing Order'}
      reference={!isNew ? order.reference : undefined}
      status={STATUS_LABEL[order.status]}
      statusColor={statusColor}
      onBack={() => navigate('/manufacturing')}
      auditModule="manufacturing"
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
          {!isNew && order.status === 'draft' && <Button onClick={() => run(() => confirmManufacturingOrder(order.id))} loading={isRunning}>Confirm</Button>}
          {!isNew && order.status === 'confirmed' && <Button onClick={() => run(() => startManufacturingOrder(order.id))} variant="secondary" loading={isRunning}>Start</Button>}
          {!isNew && order.status === 'in_progress' && <Button onClick={() => run(() => produceManufacturingOrder(order.id))} variant="secondary" loading={isRunning}>Produce</Button>}
          {!isNew && order.status !== 'done' && order.status !== 'cancelled' && (
            <Button onClick={() => run(() => cancelManufacturingOrder(order.id))} variant="ghost" className="text-red-600" loading={isRunning}>Cancel</Button>
          )}
        </>
      }
    >
      <div className="p-6 space-y-6">
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isNew ? (
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Finished Product</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm"
                value={order.finishedProductId || ''}
                onChange={(e) => setOrder({ ...order, finishedProductId: Number(e.target.value), bomId: undefined })}
                disabled={!canEditProduct}
              >
                <option value="">Select product...</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          ) : (
            <Input label="Finished Product" value={order.finishedProduct?.name ?? ''} disabled />
          )}
          <Input label="Quantity" type="number" value={order.quantity} onChange={(e) => setOrder({ ...order, quantity: Number(e.target.value) })} disabled={isLocked || !canEditQty} />
          {isNew && (
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Bill of Materials</label>
              <select className="w-full border border-border rounded px-3 py-2 text-sm" value={order.bomId ?? ''} onChange={(e) => setOrder({ ...order, bomId: Number(e.target.value) || undefined })}>
                <option value="">No BoM (manual components)</option>
                {bomsForProduct.map((b) => <option key={b.id} value={b.id}>{b.reference}</option>)}
              </select>
            </div>
          )}
          <Input
            label="Schedule Date"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={order.scheduleDate ? order.scheduleDate.slice(0, 10) : ''}
            onChange={(e) => setOrder({ ...order, scheduleDate: e.target.value || null })}
            disabled={isLocked}
          />
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Assignee</label>
            <select
              className="w-full border border-border rounded px-3 py-2 text-sm input"
              value={order.assigneeId ?? ''}
              onChange={(e) => setOrder({ ...order, assigneeId: Number(e.target.value) || undefined })}
              disabled={isLocked}
            >
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.position ? ` — ${u.position}` : ''}</option>)}
            </select>
          </div>
        </div>

        {!isNew && (
          <>
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-lg">Components</h3>
                {canEditComponents && <Button size="sm" variant="secondary" onClick={handleSaveConsumption} loading={isRunning}>{isRunning ? "Saving..." : "Save Consumption"}</Button>}
              </div>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary border-b border-border">
                    <tr>
                      <th className="px-4 py-2">Component</th>
                      <th className="px-4 py-2">Availability</th>
                      <th className="px-4 py-2">To Consume</th>
                      <th className="px-4 py-2">Consumed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.components.map((c, i) => {
                      const available = Number(c.product?.onHandQty ?? 0) >= Number(c.toConsumeQty);
                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-3">{c.product?.name ?? c.productId}</td>
                          <td className={`px-4 py-3 ${available ? 'text-green-600' : 'text-red-600'}`}>{available ? 'Available' : 'Not Available'}</td>
                          <td className="px-4 py-3">{c.toConsumeQty}</td>
                          <td className="px-4 py-3">
                            {canEditComponents ? (
                              <input
                                type="number"
                                className="w-20 border border-border rounded px-2 py-1"
                                value={c.consumedQty}
                                onChange={(e) => {
                                  const components = [...order.components];
                                  components[i] = { ...c, consumedQty: Number(e.target.value) };
                                  setOrder({ ...order, components });
                                }}
                              />
                            ) : c.consumedQty}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-lg">Work Orders</h3>
                {canEditComponents && <Button size="sm" variant="secondary" onClick={handleSaveDurations} loading={isRunning}>{isRunning ? "Saving..." : "Save Durations"}</Button>}
              </div>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary border-b border-border">
                    <tr>
                      <th className="px-4 py-2">Operation</th>
                      <th className="px-4 py-2">Work Center</th>
                      <th className="px-4 py-2">Expected (min)</th>
                      <th className="px-4 py-2">Real (min)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.workOrders.map((w, i) => (
                      <tr key={w.id}>
                        <td className="px-4 py-3">{w.operation}</td>
                        <td className="px-4 py-3">{w.workCenter?.name ?? w.workCenterId}</td>
                        <td className="px-4 py-3">{w.expectedDurationMins}</td>
                        <td className="px-4 py-3">
                          {canEditComponents ? (
                            <input
                              type="number"
                              className="w-20 border border-border rounded px-2 py-1"
                              value={w.realDurationMins ?? 0}
                              onChange={(e) => {
                                const workOrders = [...order.workOrders];
                                workOrders[i] = { ...w, realDurationMins: Number(e.target.value) };
                                setOrder({ ...order, workOrders });
                              }}
                            />
                          ) : (w.realDurationMins ?? '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </FormView>
    </>
  );
}
