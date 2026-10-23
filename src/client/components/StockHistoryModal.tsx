import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { Product, StockAdjustment } from '../types.ts';
import { X, History, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { Dialog } from './Dialog.tsx';

interface StockHistoryModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const [history, setHistory] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const productId = product?.id;

  useEffect(() => {
    if (!isOpen || !productId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setHistory([]);

    api
      .getStockHistory(productId)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load stock adjustment history');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, productId, reloadToken]);

  if (!isOpen || !product) return null;

  return (
    <Dialog
      isOpen={isOpen && !!product}
      onClose={onClose}
      labelledBy="stock-history-dialog-title"
      panelClassName="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200"
    >
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <History className="w-5 h-5 text-sky-400" />
          <h2 id="stock-history-dialog-title" className="text-base font-bold">
            Stock Adjustment History
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          aria-label="Close stock history dialog"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5">
        {/* Header info */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 text-xs">
          <div>
            <span className="font-mono font-bold text-slate-900 text-sm">{product.sku}</span>
            <span className="text-slate-500 ml-2 font-medium">{product.name}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-500">Current On-Hand: </span>
            <strong className="font-mono text-slate-900">{product.onHandQuantity}</strong>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start justify-between gap-2 text-rose-800 text-xs"
          >
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="flex items-center space-x-1 font-semibold text-rose-700 hover:text-rose-900 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        <div className="overflow-y-auto max-h-80">
          {loading ? (
            <div className="py-8 text-center text-slate-500 text-xs" role="status">
              Loading adjustment records...
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              {error ? 'Unable to display adjustment history.' : 'No recorded stock adjustments found for this product.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px]">
                  <th className="py-2 px-3">Date / Time</th>
                  <th className="py-2 px-3 text-center">Delta</th>
                  <th className="py-2 px-3 text-center">On-Hand Change</th>
                  <th className="py-2 px-3">Reason</th>
                  <th className="py-2 px-3 text-right">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] ${
                          item.delta > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.delta > 0 ? `+${item.delta}` : item.delta}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700 text-[11px]">
                      <span>{item.previousOnHand}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1 text-slate-400" />
                      <strong>{item.newOnHand}</strong>
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 max-w-xs truncate" title={item.reason}>
                      {item.reason}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 text-[11px] font-mono">
                      {item.actorEmail.split('@')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
};
