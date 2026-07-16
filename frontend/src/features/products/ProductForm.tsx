import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FormView } from '../../components/ui/FormView';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { usePermission } from '../../hooks/usePermission';
import type { Product, Vendor, Bom } from '../../types';
import { getProduct, createProduct, updateProduct, reconcileStock, uploadProductPhoto, resolveProductPhotoUrl } from '../../api/productApi';
import { listVendors } from '../../api/vendorApi';
import { listBoms } from '../../api/bomApi';
import { ApiError, extractApiErrorMessage } from '../../api/client';
import { Pencil } from 'lucide-react';

export function ProductForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [error, setError] = useState('');
  const [reconcileQty, setReconcileQty] = useState(0);
  const [reconcileReason, setReconcileReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { canEdit: canEditPrice } = usePermission('product', 'Sales Price');
  const { canEdit: canEditOnHand } = usePermission('product', 'On Hand Qty');

  useEffect(() => {
    listVendors().then(setVendors).catch(console.error);
    listBoms().then(setBoms).catch(console.error);
    if (!isNew) {
      getProduct(Number(id)).then((p) => { setProduct(p); setReconcileQty(p.onHandQty); }).catch((e) => setError(e.message));
    } else {
      setProduct({ id: 0, reference: 'New', name: '', salesPrice: 0, costPrice: 0, onHandQty: 0, procureOnDemand: false });
    }
  }, [id, isNew]);

  if (!product) return <div>Loading...</div>;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        name: product.name,
        salesPrice: product.salesPrice,
        costPrice: product.costPrice,
        procureOnDemand: product.procureOnDemand,
        procurementMethod: product.procurementMethod ?? undefined,
        vendorId: product.vendorId ?? undefined,
        bomId: product.bomId ?? undefined,
      };
      if (isNew) await createProduct(payload);
      else await updateProduct(product.id, payload);
      navigate('/products');
    } catch (e) {
      setError(e instanceof ApiError ? extractApiErrorMessage(e) : 'Save failed');
      setIsSaving(false);
    }
  };

  const handleReconcile = async () => {
    if (!reconcileReason.trim()) {
      setError('A reason is required for stock reconciliation.');
      return;
    }
    try {
      const updated = await reconcileStock(product.id, reconcileQty, reconcileReason);
      setProduct(updated);
      setReconcileReason('');
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? extractApiErrorMessage(e) : 'Reconciliation failed');
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isNew) return;
    try {
      const updated = await uploadProductPhoto(product.id, file);
      setProduct(updated);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? extractApiErrorMessage(err) : 'Photo upload failed');
    }
  };

  return (
    <FormView
      title={isNew ? 'New Product' : 'Product'}
      reference={!isNew ? product.reference : undefined}
      onBack={() => navigate('/products')}
      auditModule="product"
      auditRecordId={!isNew ? product.id : undefined}
      actions={<Button onClick={handleSave} loading={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>}
    >
      <div className="p-6 space-y-6">
        {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}
        <div className="flex gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
            <Input label="Product Name" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} />
            <Input label="Sales Price" type="number" value={product.salesPrice} onChange={(e) => setProduct({ ...product, salesPrice: Number(e.target.value) })} disabled={!canEditPrice} />
            <Input label="Cost Price" type="number" value={product.costPrice} onChange={(e) => setProduct({ ...product, costPrice: Number(e.target.value) })} />
            <Input label="On Hand Qty (system)" type="number" value={product.onHandQty} disabled />
            <Input label="Free To Use Qty (system)" type="number" value={product.freeToUseQty ?? product.onHandQty} disabled />
          </div>

          <div className="shrink-0">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoChange} />
            <button
              type="button"
              onClick={() => !isNew && fileInputRef.current?.click()}
              disabled={isNew}
              title={isNew ? 'Save the product first, then add a photo' : 'Change photo'}
              className="relative w-28 h-28 rounded-xl border border-border bg-secondary overflow-hidden flex items-center justify-center disabled:cursor-not-allowed"
            >
              {product.photoUrl ? (
                <img src={resolveProductPhotoUrl(product.photoUrl)} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-foreground/40">No photo</span>
              )}
              {!isNew && (
                <span className="absolute bottom-1 right-1 bg-card border border-border rounded-full p-1 shadow-sm">
                  <Pencil className="w-3 h-3" />
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="procureOnDemand" checked={product.procureOnDemand} onChange={(e) => setProduct({ ...product, procureOnDemand: e.target.checked })} />
          <label htmlFor="procureOnDemand" className="text-sm font-medium">Procure On Demand</label>
        </div>

        {product.procureOnDemand && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Procurement Method</label>
              <select className="w-full border border-border rounded px-3 py-2 text-sm" value={product.procurementMethod ?? ''} onChange={(e) => setProduct({ ...product, procurementMethod: e.target.value as 'purchase' | 'manufacturing' })}>
                <option value="">Select...</option>
                <option value="purchase">Purchase</option>
                <option value="manufacturing">Manufacturing</option>
              </select>
            </div>
            {product.procurementMethod === 'purchase' && (
              <div>
                <label className="block text-sm font-medium text-foreground/70 mb-1">Vendor</label>
                <select className="w-full border border-border rounded px-3 py-2 text-sm" value={product.vendorId ?? ''} onChange={(e) => setProduct({ ...product, vendorId: Number(e.target.value) })}>
                  <option value="">Select vendor...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            )}
            {product.procurementMethod === 'manufacturing' && (
              <div>
                <label className="block text-sm font-medium text-foreground/70 mb-1">Bill of Materials</label>
                <select className="w-full border border-border rounded px-3 py-2 text-sm" value={product.bomId ?? ''} onChange={(e) => setProduct({ ...product, bomId: Number(e.target.value) })}>
                  <option value="">{!product.bomId ? 'Save product first, then create a BoM for it' : 'Select BoM...'}</option>
                  {boms.filter((b) => b.productId === product.id).map((b) => <option key={b.id} value={b.id}>{b.reference}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {!isNew && canEditOnHand && (
          <div className="border-t border-border pt-6">
            <h3 className="font-medium text-lg mb-3">Stock Reconciliation</h3>
            <p className="text-sm text-foreground/60 mb-3">The only way to directly change On Hand Qty — always logged to the Stock Ledger and Audit Log.</p>
            <div className="flex gap-3 items-end">
              <Input label="New On Hand Qty" type="number" value={reconcileQty} onChange={(e) => setReconcileQty(Number(e.target.value))} />
              <Input label="Reason" value={reconcileReason} onChange={(e) => setReconcileReason(e.target.value)} />
              <Button type="button" variant="secondary" onClick={handleReconcile}>Reconcile</Button>
            </div>
          </div>
        )}
      </div>
    </FormView>
  );
}
