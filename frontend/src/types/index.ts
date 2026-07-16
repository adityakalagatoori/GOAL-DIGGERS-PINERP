// Status enums match the backend's Prisma enums exactly (lowercase snake_case)
// — see backend/src/prisma/schema.prisma. Do not use Title Case here; the
// backend is the source of truth and has been live-tested end to end.

export type SalesOrderStatus = 'draft' | 'confirmed' | 'partially_delivered' | 'fully_delivered' | 'cancelled';
export type PurchaseOrderStatus = 'draft' | 'confirmed' | 'partially_received' | 'fully_received' | 'cancelled';
export type ManufacturingOrderStatus = 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
export type PermissionModule = 'sales' | 'purchase' | 'manufacturing' | 'product';

export type AppModule =
  | 'dashboard' | 'sales' | 'purchase' | 'manufacturing' | 'bom'
  | 'products' | 'vendors' | 'signals' | 'intel_hub' | 'insights'
  | 'production_health' | 'user_management' | 'audit_logs';

export interface RolePermission {
  id: number;
  roleId: number;
  module: AppModule | string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
  canImport: boolean;
}

export interface Role {
  id: number;
  name: string;
  label: string;
  isSystem: boolean;
  createdAt?: string;
  permissions: RolePermission[];
}

export interface Department {
  id: number;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

export interface Branch {
  id: number;
  name: string;
  city?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  isRead: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
}

export interface CompanySettings {
  id: number;
  companyName: string;
  logoUrl?: string | null;
  gstNumber?: string | null;
  address?: string | null;
  currency: string;
  timezone: string;
  financialYearStart: string;
  taxPercentage: number;
  smtpUser?: string | null;
  updatedAt: string;
}

export interface LoginHistory {
  id: number;
  userId: number;
  user?: { id: number; name: string; email: string };
  ip?: string | null;
  browser?: string | null;
  status: 'success' | 'failed' | 'locked';
  createdAt: string;
}

export interface ActiveSession {
  id: string;
  userId: number;
  user?: { id: number; name: string; email: string; employeeId?: string | null };
  ip?: string | null;
  browser?: string | null;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface User {
  id: number;
  loginId: string;
  name: string;
  email: string;
  position?: string | null;
  address?: string | null;
  mobile?: string | null;
  photoUrl?: string | null;
  isAdmin: boolean;
  permissions: Permission[];
  // Enterprise fields
  employeeId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  departmentId?: number | null;
  roleId?: number | null;
  managerId?: number | null;
  branchId?: number | null;
  designation?: string | null;
  phone?: string | null;
  joiningDate?: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
  lastSeenAt?: string | null;
  onlineStatus?: 'online' | 'offline' | 'busy' | 'away';
  intelStars?: number;
  createdAt?: string;
  // Expanded relations
  department?: { id: number; name: string } | null;
  role?: Role | null;
  manager?: { id: number; name: string; employeeId?: string | null } | null;
  branch?: { id: number; name: string } | null;
}

export interface Permission {
  module: PermissionModule;
  field: string;
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}


export interface Customer {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface Vendor {
  id: number;
  reference: string;
  name: string;
  address?: string | null;
  contact?: string | null;
}

export interface VendorPerformance {
  onTimePct: number | null;
  defectRate: number | null;
  leadTimeAdherence: number | null;
  history: { reference: string; status: string; createdAt: string }[];
  incidents: { description: string; severity: string; createdAt: string }[];
}

export interface Product {
  id: number;
  reference: string;
  name: string;
  dimensions?: string | null;
  specifications?: string | null;
  leadTimeDays?: number | null;
  movementRate?: number | null;
  minOrderQty?: number | null;
  lowStockThreshold?: number | null;
  salesPrice: number;
  costPrice: number;
  onHandQty: number;
  reservedQty?: number;
  freeToUseQty?: number;
  procureOnDemand: boolean;
  procurementMethod?: 'purchase' | 'manufacturing' | null;
  vendorId?: number | null;
  bomId?: number | null;
  photoUrl?: string | null;
}

export interface SalesOrderLine {
  id: number;
  productId: number;
  product?: Product;
  orderedQty: number;
  deliveredQty: number;
  salesUnitPrice: number;
}

export interface SalesOrder {
  id: number;
  reference: string;
  customerId: number;
  customer?: Customer;
  customerAddress?: string | null;
  salesPersonId?: number | null;
  salesPerson?: { id: number; name: string };
  dueDate?: string | null;
  status: SalesOrderStatus;
  lines: SalesOrderLine[];
  createdAt?: string;
  estimatedDeliveryAt?: string | null;
}

export interface PurchaseOrderLine {
  id: number;
  productId: number;
  product?: Product;
  orderedQty: number;
  receivedQty: number;
  costUnitPrice: number;
}

export interface PurchaseOrder {
  id: number;
  reference: string;
  vendorId: number;
  vendor?: Vendor;
  vendorAddress?: string | null;
  responsiblePersonId?: number | null;
  responsiblePerson?: { id: number; name: string };
  dueDate?: string | null;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  createdAt?: string;
}

export interface MoComponent {
  id: number;
  productId: number;
  product?: Product;
  toConsumeQty: number;
  consumedQty: number;
}

export interface MoWorkOrder {
  id: number;
  operation: string;
  workCenterId: number;
  workCenter?: { id: number; name: string };
  expectedDurationMins: number;
  realDurationMins?: number | null;
}

export interface ManufacturingOrder {
  id: number;
  reference: string;
  finishedProductId: number;
  finishedProduct?: Product;
  quantity: number;
  bomId?: number | null;
  scheduleDate?: string | null;
  assigneeId?: number | null;
  assignee?: { id: number; name: string };
  status: ManufacturingOrderStatus;
  components: MoComponent[];
  workOrders: MoWorkOrder[];
  createdAt?: string;
}

export interface BomLine {
  id: number;
  componentId: number;
  component?: Product;
  toConsumeQty: number;
}

export interface BomWorkOrderTemplate {
  id: number;
  operation: string;
  workCenterId: number;
  workCenter?: { id: number; name: string };
  expectedDurationMins: number;
}

export interface Bom {
  id: number;
  reference: string;
  shortReference?: string | null;
  productId: number;
  product?: Product;
  quantity: number;
  components: BomLine[];
  workOrderTemplates: BomWorkOrderTemplate[];
}

export interface MarketSignal {
  id: number;
  sourceType: string;
  productId?: number | null;
  product?: Product;
  category?: string | null;
  signalType: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  reportedByUserId: number;
  reportedByUser?: { id: number; name: string; position?: string | null };
  reportedAt: string;
}

export type IntelPostType =
  | 'new_supplier'
  | 'cheaper_supplier'
  | 'better_quality'
  | 'faster_delivery'
  | 'bulk_discount'
  | 'local_supplier'
  | 'alternative_material'
  | 'excess_stock';

export type IntelPostStatus = 'pending' | 'verified' | 'rejected';
export type IntelPostDisplayStatus = IntelPostStatus | 'expired';

export interface IntelHubAuthor {
  id: number;
  name: string;
  position?: string | null;
  intelStars: number;
}

export interface IntelPost {
  id: number;
  title: string;
  description: string;
  postType: IntelPostType;
  materialName: string;
  supplierName: string;
  location?: string | null;
  price?: number | null;
  quantity?: number | null;
  contactInfo?: string | null;
  status: IntelPostStatus;
  displayStatus: IntelPostDisplayStatus;
  starsAwarded: number;
  expiresAt?: string | null;
  createdByUserId: number;
  createdBy?: IntelHubAuthor;
  verifiedByUserId?: number | null;
  verifiedBy?: IntelHubAuthor | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export interface IntelHubNotificationState {
  unreadCount: number;
  pendingCount: number;
  hasNotification: boolean;
}

export interface AuditLogRow {
  id: number;
  module: PermissionModule;
  entity: string;
  recordId: number;
  recordRef?: string | null;
  action: 'created' | 'updated' | 'deleted';
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  user?: { id: number; name: string } | null;
  createdAt: string;
}

export interface DashboardMetrics {
  sales: { all: Record<string, number>; my: Record<string, number> };
  purchase: { all: Record<string, number>; my: Record<string, number> };
  manufacturing: { all: Record<string, number>; my: Record<string, number> };
}

export interface DelayTraceAuditEvent {
  action: string;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
}

export interface DelayTraceChainNode {
  type: 'sales_order' | 'purchase_order' | 'manufacturing_order';
  id: number;
  reference: string;
  status: string;
  label: string;
  reason?: string;
  role: 'symptom' | 'link' | 'root_cause';
  resolved: boolean;
  expectedDate?: string | null;
  daysOverdue?: number | null;
  auditEvents: DelayTraceAuditEvent[];
}

export interface DelayTraceResult {
  symptom: DelayTraceChainNode | null;
  rootCause: DelayTraceChainNode | null;
  chain: DelayTraceChainNode[];
  explanation: string;
}

export interface CustomerReview {
  id: number;
  customerId: number;
  salesOrderId: number;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export interface CustomerCommunication {
  id: number;
  customerId: number;
  channel: 'email' | 'sms' | 'portal_message';
  direction: 'inbound' | 'outbound';
  message: string;
  createdAt: string;
}
