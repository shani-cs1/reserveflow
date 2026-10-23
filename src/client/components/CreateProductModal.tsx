import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { Product } from '../types.ts';
import { X, Package, AlertCircle, Check } from 'lucide-react';
import { Dialog } from './Dialog.tsx';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (product: Product) => void;
}

const DEFAULT_UNIT_PRICE = '49.99';
const DEFAULT_INITIAL_STOCK = '25';

export const CreateProductModal: React.FC<CreateProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unitPriceDollars, setUnitPriceDollars] = useState(DEFAULT_UNIT_PRICE);
  const [initialStock, setInitialStock] = useState(DEFAULT_INITIAL_STOCK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSku('');
      setName('');
      setUnitPriceDollars(DEFAULT_UNIT_PRICE);
      setInitialStock(DEFAULT_INITIAL_STOCK);
      setLoading(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceCents = Math.round(parseFloat(unitPriceDollars) * 100);
    const stock = parseInt(initialStock, 10);

    if (!sku.trim()) {
      setError('SKU is required');
      return;
    }

    if (!name.trim()) {
      setError('Product name is required');
      return;
    }

    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError('Please provide a valid unit price');
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setError('Initial stock must be a non-negative whole number');
      return;
    }

    setLoading(true);
    try {
      const created = await api.createProduct({
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        unitPrice: priceCents,
        initialOnHandQuantity: stock,
      });

      onSuccess(created);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="create-product-dialog-title"
      dismissible={!loading}
      panelClassName="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
    >
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Package className="w-5 h-5 text-sky-400" />
          <h2 id="create-product-dialog-title" className="text-base font-bold">
            Create New Product
          </h2>
        </div>
        <button
          onClick={onClose}
          disabled={loading}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors disabled:opacity-50"
          aria-label="Close create product dialog"
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
            htmlFor="create-product-sku"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            SKU (Unique)
          </label>
          <input
            id="create-product-sku"
            type="text"
            required
            placeholder="e.g. COMP-500"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 uppercase"
          />
        </div>

        <div>
          <label
            htmlFor="create-product-name"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Product Name
          </label>
          <input
            id="create-product-name"
            type="text"
            required
            placeholder="e.g. Heavy Duty Air Compressor 2.5HP"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="create-product-price"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Unit Price ($ USD)
            </label>
            <input
              id="create-product-price"
              type="number"
              step="0.01"
              min="0"
              required
              value={unitPriceDollars}
              onChange={(e) => setUnitPriceDollars(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-product-stock"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Initial On-Hand Stock
            </label>
            <input
              id="create-product-stock"
              type="number"
              min="0"
              step="1"
              required
              value={initialStock}
              onChange={(e) => setInitialStock(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>
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
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span>Creating...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Create Product</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
