import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { Product } from '../types.ts';
import { X, Sliders, AlertCircle, Check, ArrowRight } from 'lucide-react';
import { Dialog } from './Dialog.tsx';

interface AdjustStockModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: Product) => void;
}

const DEFAULT_DELTA = '10';
const DEFAULT_REASON = 'Restock shipment from supplier';

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  product,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [deltaStr, setDeltaStr] = useState(DEFAULT_DELTA);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && product?.id) {
      setDeltaStr(DEFAULT_DELTA);
      setReason(DEFAULT_REASON);
      setLoading(false);
      setError(null);
    }
  }, [isOpen, product?.id]);

  if (!isOpen || !product) return null;

  const delta = deltaStr === '' ? 0 : Number(deltaStr);
  const simulatedNewOnHand = product.onHandQuantity + (Number.isFinite(delta) ? delta : 0);
  const simulatedNewAvailable = simulatedNewOnHand - product.reservedQuantity;
  const isInvalid =
    !Number.isInteger(delta) ||
    simulatedNewOnHand < 0 ||
    simulatedNewOnHand < product.reservedQuantity ||
    delta === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!Number.isInteger(delta) || delta === 0) {
      setError('Adjustment delta must be a non-zero whole number');
      return;
    }

    if (!reason.trim()) {
      setError('A reason is strictly required for stock adjustments');
      return;
    }

    if (simulatedNewOnHand < 0) {
      setError('On-hand stock cannot become negative');
      return;
    }

    if (simulatedNewOnHand < product.reservedQuantity) {
      setError(`Cannot reduce on-hand below currently reserved stock (${product.reservedQuantity})`);
      return;
    }

    setLoading(true);
    try {
      const updated = await api.adjustStock(product.id, {
        delta,
        reason: reason.trim(),
      });
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to adjust stock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen && !!product}
      onClose={onClose}
      labelledBy="adjust-stock-dialog-title"
      dismissible={!loading}
      panelClassName="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
    >
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sliders className="w-5 h-5 text-sky-400" />
          <h2 id="adjust-stock-dialog-title" className="text-base font-bold">
            Adjust On-Hand Stock
          </h2>
        </div>
        <button
          onClick={onClose}
          disabled={loading}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors disabled:opacity-50"
          aria-label="Close stock adjustment dialog"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Target Product Summary */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500 font-semibold">SKU:</span>
            <span className="font-mono font-bold text-slate-800">{product.sku}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-semibold">Product:</span>
            <span className="font-medium text-slate-800 truncate max-w-[200px]">{product.name}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-200">
            <span className="text-slate-500 font-semibold">Current State:</span>
            <span>
              On-Hand: <strong className="font-mono">{product.onHandQuantity}</strong> | Reserved:{' '}
              <strong className="font-mono text-amber-600">{product.reservedQuantity}</strong> |
              Avail:{' '}
              <strong className="font-mono text-emerald-600">{product.availableQuantity}</strong>
            </span>
          </div>
        </div>

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
            htmlFor="adjust-stock-delta"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Quantity Delta (Positive for restock, Negative for reduction)
          </label>
          <input
            id="adjust-stock-delta"
            type="number"
            step="1"
            required
            value={deltaStr}
            onChange={(e) => setDeltaStr(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
          />
          <div className="flex items-center space-x-2 mt-2 text-[11px] text-slate-500">
            <span>Quick:</span>
            <button
              type="button"
              onClick={() => setDeltaStr('10')}
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded"
            >
              +10
            </button>
            <button
              type="button"
              onClick={() => setDeltaStr('50')}
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded"
            >
              +50
            </button>
            <button
              type="button"
              onClick={() => setDeltaStr('-5')}
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded"
            >
              -5
            </button>
          </div>
        </div>

        {/* Resulting Invariant Preview */}
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            isInvalid
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>Resulting On-Hand:</span>
          <div className="flex items-center space-x-1 font-mono font-bold">
            <span>{product.onHandQuantity}</span>
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{simulatedNewOnHand}</span>
            <span className="text-[11px] font-normal ml-2">(Available: {simulatedNewAvailable})</span>
          </div>
        </div>

        <div>
          <label
            htmlFor="adjust-stock-reason"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Adjustment Reason (Mandatory Audit Trail Requirement)
          </label>
          <textarea
            id="adjust-stock-reason"
            required
            rows={2}
            placeholder="e.g. Supplier delivery batch #882 / Damaged inventory write-off"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
          />
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
            disabled={loading || isInvalid}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span>Applying...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Confirm Adjustment</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
