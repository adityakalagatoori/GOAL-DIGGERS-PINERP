import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListView } from '../../components/ui/ListView';
import { KanbanView } from '../../components/ui/KanbanView';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types';
import { listPurchaseOrders } from '../../api/purchaseApi';
import { useSocketEvent } from '../../hooks/useSocket';

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft', confirmed: 'Confirmed', partially_received: 'Partially Received',
  fully_received: 'Fully Received', cancelled: 'Cancelled',
};

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PurchaseOrderList() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>((searchParams.get('status') as PurchaseOrderStatus | null) ?? '');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setStatusFilter((searchParams.get('status') as PurchaseOrderStatus | null) ?? '');
  }, [searchParams]);

  const refresh = () =>
    listPurchaseOrders({
      status: statusFilter || undefined,
      search: search || undefined,
      dueDateFrom: dueDateFrom || undefined,
      dueDateTo: dueDateTo || undefined,
    }).then(setOrders).catch(console.error);

  useEffect(() => {
    const debounce = setTimeout(refresh, 300);
    return () => clearTimeout(debounce);
  }, [statusFilter, search, dueDateFrom, dueDateTo]);
  useSocketEvent<{ orderType: string }>('order:status_changed', (p) => { if (p.orderType === 'purchase_order') refresh(); });

  const sortedOrders = [...orders].sort((a, b) => {
    if (a.status === 'draft' && b.status !== 'draft') return -1;
    if (a.status !== 'draft' && b.status === 'draft') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const columns = [
    { header: 'Reference', accessor: 'reference' as keyof PurchaseOrder },
    { header: 'Due Date', accessor: (row: PurchaseOrder) => formatDate(row.dueDate) },
    { header: 'Vendor', accessor: (row: PurchaseOrder) => row.vendor?.name ?? '' },
    { header: 'Responsible', accessor: (row: PurchaseOrder) => row.responsiblePerson?.name ?? '' },
    {
      header: 'Status',
      accessor: (row: PurchaseOrder) => (
        <Badge variant={
          row.status === 'confirmed' ? 'info' :
          row.status === 'fully_received' ? 'success' :
          row.status === 'partially_received' ? 'warning' : 'default'
        }>
          {STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
  ];

  const kanbanColumns = (Object.keys(STATUS_LABEL) as PurchaseOrderStatus[]).map((status) => ({
    id: status,
    title: STATUS_LABEL[status],
    items: sortedOrders.filter((o) => o.status === status),
  }));

  const renderKanbanCard = (order: PurchaseOrder) => (
    <Card className="p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/purchase/${order.id}`)}>
      <div className="flex justify-between items-start mb-2">
        <span className="font-semibold text-sm">{order.reference}</span>
        <Badge variant="default" className="text-[10px]">{STATUS_LABEL[order.status]}</Badge>
      </div>
      <p className="text-sm text-foreground/70">{order.vendor?.name}</p>
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
              onChange={(e) => setStatusFilter(e.target.value as PurchaseOrderStatus | '')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="">All Statuses</option>
              {(Object.keys(STATUS_LABEL) as PurchaseOrderStatus[]).map((status) => (
                <option key={status} value={status}>{STATUS_LABEL[status]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/70 mb-1 block">From Date</label>
            <input
              type="date"
              value={dueDateFrom}
              onChange={(e) => setDueDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/70 mb-1 block">To Date</label>
            <input
              type="date"
              value={dueDateTo}
              onChange={(e) => setDueDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => { setStatusFilter(''); setDueDateFrom(''); setDueDateTo(''); }}
              className="w-full px-3 py-2 rounded-md bg-foreground/10 text-sm hover:bg-foreground/20 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <ListView
        title="Purchase Orders"
        data={sortedOrders}
        columns={columns}
        onNew={() => navigate('/purchase/new')}
        searchPlaceholder="Search by reference or vendor..."
        searchValue={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRowClick={(row) => navigate(`/purchase/${row.id}`)}
        kanbanComponent={<KanbanView columns={kanbanColumns} renderCard={renderKanbanCard} />}
      />
    </div>
  );
}
