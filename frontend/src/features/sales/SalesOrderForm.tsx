import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { usePermission } from '../../hooks/usePermission';
import type { SalesOrder, SalesOrderStatus, Product, Customer } from '../../types';
import { DelayTracerModal } from '../delayTracer/DelayTracerModal';
import { PinCheckpointModal } from './PinCheckpointModal';
import { AlertCircle } from 'lucide-react';
import { getSalesOrder, createSalesOrder, confirmSalesOrder, deliverSalesOrder, cancelSalesOrder } from '../../api/salesApi';
import type { PinAction } from '../../api/pinApi';
import { listProducts } from '../../api/productApi';
import { listCustomers } from '../../api/customerApi';
import { listUserDirectory } from '../../api/userManagementApi';
import { ApiError } from '../../api/client';

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  draft: 'Draft', confirmed: 'Confirmed', partially_delivered: 'Partially Delivered',
  fully_delivered: 'Fully Delivered', cancelled: 'Cancelled',
};

export function SalesOrderForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [isDelayModalOpen, setIsDelayModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [newProductId, setNewProductId] = useState<number | ''>('');
  const [newQty, setNewQty] = useState(1);

  const { canEdit: canEditCustomer } = usePermission('sales', 'Customer');
  const { canEdit: canEditSalesPerson } = usePermission('sales', 'Sales Person');

  useEffect(() => {
    listProducts().then(setProducts).catch(console.error);
    listCustomers().then(setCustomers).catch(console.error);
    listUserDirectory().then(setUsers).catch(console.error);
    if (!isNew) {
      getSalesOrder(Number(id)).then(setOrder).catch((e) => setError(e.message));
    } else {
      setOrder({ id: 0, reference: 'New', customerId: 0, status: 'draft', lines: [] });
    }
  }, [id, isNew]);

  if (!order) return <div>Loading...</div>;

  const isLocked = order.status !== 'draft';
  const isOverdue = order.status === 'confirmed' || order.status === 'partially_delivered';

  const run = async (fn: () => Promise<SalesOrder>) => {
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

  const handleAddLine = () => {
    if (!newProductId) return;
    const product = products.find((p) => p.id === newProductId);
    if (!product) return;
    setOrder({
      ...order,
      lines: [
        ...order.lines,
        { id: -order.lines.length - 1, productId: product.id, product, orderedQty: newQty, deliveredQty: 0, salesUnitPrice: product.salesPrice },
      ],
    });
    setNewProductId('');
    setNewQty(1);
  };

  const handleSaveNew = () => {
    if (!order.customerId || order.lines.length === 0) {
      setError('Customer and at least one product line are required.');
      return;
    }
    run(() =>
      createSalesOrder({
        customerId: order.customerId,
        customerAddress: order.customerAddress ?? undefined,
        salesPersonId: order.salesPersonId ?? undefined,
        dueDate: order.dueDate ?? undefined,
        lines: order.lines.map((l) => ({ productId: l.productId, orderedQty: l.orderedQty })),
      })
    ).then(() => navigate('/sales'));
  };

  const handleDeliver = () => {
    const lines = order.lines.map((l) => ({ lineId: l.id, deliveredQty: l.deliveredQty }));
    run(() => deliverSalesOrder(order.id, lines));
  };

  const handlePinConfirm = (actions: PinAction[]) => {
    setIsPinModalOpen(false);
    run(() => confirmSalesOrder(order.id, actions));
  };

  const statusColor = order.status === 'confirmed' ? 'info' : order.status === 'fully_delivered' ? 'success' : order.status === 'partially_delivered' ? 'warning' : 'default';
  const hasDelivery = order.status === 'partially_delivered' || order.status === 'fully_delivered';
  const lineTotal = (line: SalesOrder['lines'][number]) => (hasDelivery ? line.deliveredQty : line.orderedQty) * line.salesUnitPrice;
  const grandTotal = order.lines.reduce((sum, l) => sum + lineTotal(l), 0);

  return (
    <>
      <DelayTracerModal isOpen={isDelayModalOpen} onClose={() => setIsDelayModalOpen(false)} orderType="sales_order" orderId={order.id} />
      <PinCheckpointModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        items={order.lines.map((l) => ({ productId: l.productId, qty: l.orderedQty }))}
        onConfirm={handlePinConfirm}
      />
      <FormView
        title={isNew ? 'New Sales Order' : 'Sales Order'}
        reference={!isNew ? order.reference : undefined}
        status={STATUS_LABEL[order.status]}
        statusColor={statusColor}
        onBack={() => navigate('/sales')}
        auditModule={!isNew ? 'sales' : undefined}
        auditRecordId={!isNew ? order.id : undefined}
        actions={
          <>
            {isOverdue && (
              <Button variant="danger" className="gap-2 mr-auto" onClick={() => setIsDelayModalOpen(true)}>
                <AlertCircle className="w-4 h-4" /> Why is this late?
              </Button>
            )}
            {isNew && <Button onClick={handleSaveNew} loading={isRunning}>{isRunning ? 'Saving...' : 'Save'}</Button>}
            {!isNew && order.status === 'draft' && <Button onClick={() => setIsPinModalOpen(true)}>Confirm</Button>}
            {!isNew && (order.status === 'confirmed' || order.status === 'partially_delivered') && (
              <Button onClick={handleDeliver} variant="secondary" loading={isRunning}>{isRunning ? 'Delivering...' : 'Deliver'}</Button>
            )}
            {!isNew && order.status !== 'fully_delivered' && order.status !== 'cancelled' && (
              <Button onClick={() => run(() => cancelSalesOrder(order.id))} variant="ghost" className="text-red-600" loading={isRunning}>Cancel</Button>
            )}
          </>
        }
      >
        <div className="p-6 space-y-6">
          {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="w-full">
              <label className="label">Customer</label>
              <select
                className="input"
                value={order.customerId || ''}
                onChange={(e) => {
                  const customerId = Number(e.target.value);
                  const customer = customers.find((c) => c.id === customerId);
                  setOrder({ ...order, customerId, customer });
                }}
                disabled={isLocked || !canEditCustomer}
                required
              >
                <option value="">Select customer...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input
              label="Customer Address"
              value={order.customerAddress ?? ''}
              onChange={(e) => setOrder({ ...order, customerAddress: e.target.value })}
              disabled={isLocked || !canEditCustomer}
            />
            <div className="w-full">
              <label className="label">Sales Person</label>
              <select
                className="input"
                value={order.salesPersonId ?? ''}
                onChange={(e) => {
                  const salesPersonId = Number(e.target.value) || null;
                  const salesPerson = users.find((u) => u.id === salesPersonId);
                  setOrder({ ...order, salesPersonId, salesPerson });
                }}
                disabled={isLocked || !canEditSalesPerson}
              >
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
            {!isNew && order.estimatedDeliveryAt && (
              <Input
                label="Estimated Delivery (PIN-adjusted)"
                value={new Date(order.estimatedDeliveryAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                disabled
                readOnly
              />
            )}
            {!isNew && (
              <Input
                label="Creation Date"
                value={order.createdAt ? new Date(order.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                disabled
                readOnly
              />
            )}
          </div>

          <div>
            <h3 className="font-medium text-lg mb-4">Order Lines</h3>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Availability</th>
                    <th className="px-4 py-2">Ordered Qty</th>
                    <th className="px-4 py-2">Delivered Qty</th>
                    <th className="px-4 py-2">Unit Price</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.lines.length > 0 ? order.lines.map((line, i) => {
                    const freeToUse = line.product?.freeToUseQty;
                    const isShort = freeToUse !== undefined && line.orderedQty > freeToUse;
                    return (
                      <tr key={line.id}>
                        <td className="px-4 py-3">{line.product?.name ?? line.productId}</td>
                        <td className="px-4 py-3">
                          {freeToUse === undefined ? '-' : (
                            <Badge variant={isShort ? 'danger' : 'success'} className="text-[10px]">
                              {isShort ? `Short by ${(line.orderedQty - freeToUse).toString()}` : 'In Stock'}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">{line.orderedQty}</td>
                        <td className="px-4 py-3">
                          {!isNew && (order.status === 'confirmed' || order.status === 'partially_delivered') ? (
                            <input
                              type="number"
                              className="w-20 border border-border rounded px-2 py-1"
                              value={line.deliveredQty}
                              min={0}
                              max={line.orderedQty}
                              onChange={(e) => {
                                const lines = [...order.lines];
                                lines[i] = { ...line, deliveredQty: Number(e.target.value) };
                                setOrder({ ...order, lines });
                              }}
                            />
                          ) : (line.deliveredQty || 0)}
                        </td>
                        <td className="px-4 py-3">₹{line.salesUnitPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">₹{lineTotal(line).toFixed(2)}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground/60">No lines added yet.</td></tr>
                  )}
                </tbody>
                {order.lines.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <td colSpan={5} className="px-4 py-3 text-right">Total</td>
                      <td className="px-4 py-3 text-right">₹{grandTotal.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {isNew && (
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
