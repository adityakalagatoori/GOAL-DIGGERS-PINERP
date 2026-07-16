import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListView } from '../../components/ui/ListView';
import { KanbanView } from '../../components/ui/KanbanView';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import type { ManufacturingOrder, ManufacturingOrderStatus } from '../../types';
import { listManufacturingOrders } from '../../api/manufacturingApi';
import { useSocketEvent } from '../../hooks/useSocket';

const STATUS_LABEL: Record<ManufacturingOrderStatus, string> = {
  draft: 'Draft', confirmed: 'Confirmed', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled',
};

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function componentsAvailable(order: ManufacturingOrder): boolean {
  return order.components.every((c) => Number(c.product?.onHandQty ?? 0) >= Number(c.toConsumeQty));
}

export function ManufacturingOrderList() {
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ManufacturingOrderStatus | ''>('');
  const [scheduleDateFrom, setScheduleDateFrom] = useState('');
  const [scheduleDateTo, setScheduleDateTo] = useState('');
  const navigate = useNavigate();

  const refresh = () =>
    listManufacturingOrders({
      status: statusFilter || undefined,
      search: search || undefined,
      scheduleDateFrom: scheduleDateFrom || undefined,
      scheduleDateTo: scheduleDateTo || undefined,
    }).then(setOrders).catch(console.error);

  useEffect(() => {
    const debounce = setTimeout(refresh, 300);
    return () => clearTimeout(debounce);
  }, [statusFilter, search, scheduleDateFrom, scheduleDateTo]);
  useSocketEvent<{ orderType: string }>('order:status_changed', (p) => { if (p.orderType === 'manufacturing_order') refresh(); });

  const sortedOrders = [...orders].sort((a, b) => {
    if (a.status === 'draft' && b.status !== 'draft') return -1;
    if (a.status !== 'draft' && b.status === 'draft') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const columns = [
    { header: 'Reference', accessor: 'reference' as keyof ManufacturingOrder },
    { header: 'Scheduled', accessor: (row: ManufacturingOrder) => formatDate(row.scheduleDate) },
    { header: 'Finished Product', accessor: (row: ManufacturingOrder) => row.finishedProduct?.name ?? '' },
    { header: 'Quantity', accessor: 'quantity' as keyof ManufacturingOrder },
    {
      header: 'Component Status',
      accessor: (row: ManufacturingOrder) => (
        <span className={componentsAvailable(row) ? 'text-green-600' : 'text-red-600'}>
          {componentsAvailable(row) ? 'Available' : 'Not Available'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: ManufacturingOrder) => (
        <Badge variant={row.status === 'confirmed' ? 'info' : row.status === 'in_progress' ? 'warning' : row.status === 'done' ? 'success' : 'default'}>
          {STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
  ];

  const kanbanColumns = (Object.keys(STATUS_LABEL) as ManufacturingOrderStatus[]).map((status) => ({
    id: status,
    title: STATUS_LABEL[status],
    items: sortedOrders.filter((o) => o.status === status),
  }));

  const renderKanbanCard = (order: ManufacturingOrder) => (
    <Card className="p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/manufacturing/${order.id}`)}>
      <div className="flex justify-between items-start mb-2">
        <span className="font-semibold text-sm">{order.reference}</span>
        <Badge variant="default" className="text-[10px]">{STATUS_LABEL[order.status]}</Badge>
      </div>
      <p className="text-sm text-foreground/70">{order.finishedProduct?.name} ({order.quantity})</p>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground/70 mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ManufacturingOrderStatus | '')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="">All Statuses</option>
              {(Object.keys(STATUS_LABEL) as ManufacturingOrderStatus[]).map((status) => (
                <option key={status} value={status}>{STATUS_LABEL[status]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/70 mb-1 block">From Date</label>
            <input
              type="date"
              value={scheduleDateFrom}
              onChange={(e) => setScheduleDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/70 mb-1 block">To Date</label>
            <input
              type="date"
              value={scheduleDateTo}
              onChange={(e) => setScheduleDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => { setStatusFilter(''); setScheduleDateFrom(''); setScheduleDateTo(''); }}
              className="w-full px-3 py-2 rounded-md bg-foreground/10 text-sm hover:bg-foreground/20 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <ListView
        title="Manufacturing Orders"
        data={sortedOrders}
        columns={columns}
        onNew={() => navigate('/manufacturing/new')}
        searchPlaceholder="Search by reference or product name..."
        searchValue={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRowClick={(row) => navigate(`/manufacturing/${row.id}`)}
        kanbanComponent={<KanbanView columns={kanbanColumns} renderCard={renderKanbanCard} />}
      />
    </div>
  );
}
