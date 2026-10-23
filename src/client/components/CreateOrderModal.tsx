import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { Order, Product } from '../types.ts';
import { X, ShoppingCart, Plus, Trash2, AlertCircle, Check } from 'lucide-react';
import { Dialog } from './Dialog.tsx';

interface CreateOrderModalProps {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (order: Order) => void;
}

interface FormLine {
  productId: string;
  quantity: number;
}

const DEFAULT_CUSTOMER_NAME = 'Apex Industrial Supply Corp';

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  products,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [customerName, setCustomerName] = useState(DEFAULT_CUSTOMER_NAME);
  const [lines, setLines] = useState<FormLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  // Reset the form only when the modal transitions from closed to open.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setCustomerName(DEFAULT_CUSTOMER_NAME);
      setLines([{ productId: products[0]?.id || '', quantity: 1 }]);
      setError(null);
      setLoading(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, products]);

  // Repair the initial line when products finish loading asynchronously.
  useEffect(() => {
    if (!isOpen || products.length === 0) return;

    setLines((previous) => {
      let changed = false;
      const validIds = new Set(products.map((product) => product.id));

      const next = previous.map((line) => {
        if (line.productId && validIds.has(line.productId)) return line;

        const usedIds = new Set(previous.map((item) => item.productId));
        const fallback = products.find((product) => !usedIds.has(product.id)) || products[0];

        if (fallback && fallback.id !== line.productId) {
          changed = true;
          return { ...line, productId: fallback.id };
        }
        return line;
      });

      return changed ? next : previous;
    });
  }, [isOpen, products]);

  const productMap = new Map(products.map((p) => [p.id, p]));

  const handleAddLine = () => {
    if (products.length === 0) {
      setError('No products are available to add to an order');
      return;
    }

    const usedIds = new Set(lines.map((line) => line.productId));
    const availableProduct = products.find((product) => !usedIds.has(product.id));

    if (!availableProduct) {
      setError('All available products are already included in this order');
      return;
    }

    setError(null);
    setLines([...lines, { productId: availableProduct.id, quantity: 1 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof FormLine, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  // Compute live total
  let orderTotalCents = 0;
  for (const line of lines) {
    const prod = productMap.get(line.productId);
    if (prod) {
      orderTotalCents += prod.unitPrice * (line.quantity || 0);
    }
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const validate = (): string | null => {
    if (!customerName.trim()) return 'Customer name is required';
    if (lines.length === 0) return 'Order must contain at least one line item';

    const selectedIds = new Set<string>();

    for (const line of lines) {
      if (!line.productId) return 'Please select a product for all lines';

      const product = productMap.get(line.productId);
      if (!product) return 'One or more selected products are no longer available';

      if (selectedIds.has(line.productId)) {
        return `Product ${product.sku} is selected more than once. Remove the duplicate line.`;
      }
      selectedIds.add(line.productId);

      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        return `Quantity for ${product.sku} must be a whole number greater than zero`;
      }

      if (line.quantity > product.availableQuantity) {
        return `Insufficient available stock for ${product.sku}: ${product.availableQuantity} available, ${line.quantity} requested`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const created = await api.createOrder({
        customerName: customerName.trim(),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
        })),
      });

      onSuccess(created);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="create-order-dialog-title"
      dismissible={!loading}
      panelClassName="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200"
    >
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShoppingCart className="w-5 h-5 text-indigo-400" />
          <h2 id="create-order-dialog-title" className="text-base font-bold">
            Create Multi-Line Order (Pending)
          </h2>
        </div>
        <button
          onClick={onClose}
          disabled={loading}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors disabled:opacity-50"
          aria-label="Close create order dialog"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2 text-rose-800 text-xs"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="create-order-customer"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Customer / Organization
          </label>
          <input
            id="create-order-customer"
            type="text"
            required
            placeholder="e.g. Acme Industrial Corp"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Line items section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Order Line Items
            </span>
            <button
              type="button"
              onClick={handleAddLine}
              disabled={products.length === 0 || lines.length >= products.length}
              className="flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item Line</span>
            </button>
          </div>

          {products.length === 0 && (
            <div className="p-3 mb-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
              No products are loaded yet. Orders cannot be created until inventory is available.
            </div>
          )}

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {lines.map((line, idx) => {
              const prod = productMap.get(line.productId);
              const lineTotal = prod ? prod.unitPrice * (line.quantity || 0) : 0;
              const selectedElsewhere = new Set(
                lines.filter((_, index) => index !== idx).map((item) => item.productId)
              );
              const selectableProducts = products.filter(
                (product) => product.id === line.productId || !selectedElsewhere.has(product.id)
              );

              return (
                <div
                  key={idx}
                  className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs"
                >
                  <div className="flex-1">
                    <select
                      value={line.productId}
                      onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                      aria-label={`Product for order line ${idx + 1}`}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md bg-white text-xs font-medium focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">Select a product...</option>
                      {selectableProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} ({formatPrice(p.unitPrice)} | Avail:{' '}
                          {p.availableQuantity})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <div className="flex items-center border border-slate-300 rounded-md bg-white">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={line.quantity}
                        onChange={(e) =>
                          handleLineChange(
                            idx,
                            'quantity',
                            e.target.value === '' ? 0 : Number(e.target.value)
                          )
                        }
                        aria-label={`Quantity for order line ${idx + 1}`}
                        className="w-full px-2 py-1.5 text-center text-xs font-mono font-semibold focus:outline-hidden"
                        title="Quantity"
                      />
                    </div>
                  </div>

                  <div className="w-24 text-right font-mono font-bold text-slate-800">
                    {formatPrice(lineTotal)}
                  </div>

                  <button
                    type="button"
                    disabled={lines.length <= 1}
                    onClick={() => handleRemoveLine(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded disabled:opacity-30 cursor-pointer"
                    title="Remove Line"
                    aria-label={`Remove order line ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pricing summary */}
        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg flex items-center justify-between text-xs">
          <span className="text-slate-600 font-semibold">Total Order Amount (Snapshot Pricing):</span>
          <span className="text-base font-mono font-bold text-indigo-900">
            {formatPrice(orderTotalCents)}
          </span>
        </div>

        <div className="pt-2 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || products.length === 0}
            className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span>Submitting...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Create Pending Order</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
