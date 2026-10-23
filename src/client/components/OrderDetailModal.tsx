import React, { useEffect, useState } from 'react';
import { api, generateIdempotencyKey } from '../api.ts';
import { ApiError, Order } from '../types.ts';
import {
  X,
  ShoppingCart,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { Dialog } from './Dialog.tsx';

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: (updated: Order) => void;
}

type OrderAction = 'reserve' | 'confirm' | 'cancel';

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  onOrderUpdated,
}) => {
  const [loadingAction, setLoadingAction] = useState<OrderAction | null>(null);
  const [errorInfo, setErrorInfo] = useState<ApiError | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'confirm' | 'cancel' | null>(null);

  useEffect(() => {
    setLoadingAction(null);
    setErrorInfo(null);
    setSuccessMsg(null);
    setConfirmAction(null);
  }, [order?.id, isOpen]);

  if (!isOpen || !order) return null;

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const handleAction = async (action: OrderAction) => {
    setLoadingAction(action);
    setErrorInfo(null);
    setSuccessMsg(null);
    setConfirmAction(null);

    const idemKey = generateIdempotencyKey(action);

    try {
      let updated: Order;
      if (action === 'reserve') {
        updated = await api.reserveOrder(order.id, idemKey);
        setSuccessMsg('Inventory successfully reserved atomically for all order lines.');
      } else if (action === 'confirm') {
        updated = await api.confirmOrder(order.id, idemKey);
        setSuccessMsg('Order confirmed! Stock permanently deducted from warehouse.');
      } else {
        updated = await api.cancelOrder(order.id, idemKey);
        setSuccessMsg(
          order.status === 'RESERVED'
            ? 'Order cancelled! Reserved stock has been automatically released back to available inventory.'
            : 'Pending order cancelled.'
        );
      }
      onOrderUpdated(updated);
    } catch (err: any) {
      setErrorInfo(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const requestAction = (action: OrderAction) => {
    if (action === 'reserve') {
      handleAction(action);
      return;
    }
    setConfirmAction(action);
  };

  const canReserve = order.status === 'PENDING';
  const canConfirm = order.status === 'RESERVED';
  const canCancel = order.status === 'PENDING' || order.status === 'RESERVED';
  const actionInProgress = loadingAction !== null;

  const confirmMessage =
    confirmAction === 'cancel'
      ? order.status === 'RESERVED'
        ? 'Cancel this order and release its reserved stock back to available inventory?'
        : 'Cancel this pending order?'
      : 'Confirming this order permanently deducts the reserved stock and cannot be undone.';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="order-detail-dialog-title"
      dismissible={!actionInProgress}
      panelClassName="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col"
    >
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <ShoppingCart className="w-5 h-5 text-indigo-400" />
          <div>
            <div className="flex items-center space-x-2">
              <h2
                id="order-detail-dialog-title"
                className="text-base font-bold font-mono text-indigo-300"
              >
                {order.orderNumber}
              </h2>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                  order.status === 'PENDING'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : order.status === 'RESERVED'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                    : order.status === 'CONFIRMED'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}
              >
                {order.status}
              </span>
            </div>
            <p className="text-xs text-slate-400">Customer: {order.customerName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          disabled={actionInProgress}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors disabled:opacity-50"
          aria-label="Close order details dialog"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 overflow-y-auto space-y-5 flex-1">
        {/* Notifications: Success or Conflict/Error */}
        {successMsg && (
          <div
            role="status"
            className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2 text-emerald-800 text-xs"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {errorInfo && (
          <div
            role="alert"
            className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs space-y-2"
          >
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Error [{errorInfo.code}]: </span>
                <span>{errorInfo.message}</span>
              </div>
            </div>

            {/* Insufficient Stock Details */}
            {Array.isArray(errorInfo.details) && errorInfo.details.length > 0 && (
              <div className="pl-6 space-y-1">
                <span className="font-semibold text-rose-950 block">Unavailable Inventory Lines:</span>
                <div className="bg-white/80 p-2 rounded border border-rose-200 space-y-1">
                  {errorInfo.details.map((d: any, i: number) => (
                    <div key={i} className="flex justify-between font-mono text-[11px]">
                      <span className="font-bold text-rose-900">SKU: {d.sku}</span>
                      <span>
                        Available: <strong>{d.available}</strong> | Requested:{' '}
                        <strong className="text-rose-700">{d.requested}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorInfo.requestId && (
              <div className="text-[10px] text-rose-600 font-mono pl-6">
                Request ID: {errorInfo.requestId}
              </div>
            )}
          </div>
        )}

        {/* Action Bar (Permitted State Transitions) */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              Permitted State Actions
            </span>
            <span className="text-[11px] text-slate-500">
              Current: <strong className="font-mono">{order.status}</strong>
            </span>
          </div>

          {confirmAction && (
            <div
              role="alertdialog"
              aria-label={`Confirm ${confirmAction} order`}
              className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-2"
            >
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="font-semibold">{confirmMessage}</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(confirmAction === 'cancel' ? 'cancel' : 'confirm')}
                  disabled={actionInProgress}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
                >
                  Yes, {confirmAction === 'cancel' ? 'cancel order' : 'confirm order'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* Reserve button */}
            <button
              type="button"
              disabled={!canReserve || actionInProgress || confirmAction !== null}
              onClick={() => requestAction('reserve')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title={
                canReserve
                  ? 'Atomically reserve inventory across all lines'
                  : 'Reserve is only permitted from PENDING state'
              }
            >
              {loadingAction === 'reserve' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>1. Reserve Stock</span>
            </button>

            {/* Confirm button */}
            <button
              type="button"
              disabled={!canConfirm || actionInProgress || confirmAction !== null}
              onClick={() => requestAction('confirm')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title={
                canConfirm
                  ? 'Confirm order and complete warehouse sale'
                  : 'Confirm is only permitted from RESERVED state'
              }
            >
              {loadingAction === 'confirm' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>2. Confirm Order</span>
            </button>

            {/* Cancel button */}
            <button
              type="button"
              disabled={!canCancel || actionInProgress || confirmAction !== null}
              onClick={() => requestAction('cancel')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title={
                canCancel
                  ? order.status === 'RESERVED'
                    ? 'Cancel order and release reserved stock'
                    : 'Cancel pending order'
                  : 'Cannot cancel from current status'
              }
            >
              {loadingAction === 'cancel' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              <span>Cancel Order</span>
            </button>

            <div className="ml-auto text-[10px] text-slate-500 flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Idempotency-Key header sent per action</span>
            </div>
          </div>
        </div>

        {/* Line items table with Snapshot Pricing */}
        <div>
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Line Items (Price Snapshots)
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[10px]">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Product Name</th>
                  <th className="py-2 px-3 text-right">Price Snapshot</th>
                  <th className="py-2 px-3 text-center">Qty</th>
                  <th className="py-2 px-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {order.lines?.map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{line.sku}</td>
                    <td className="py-2.5 px-3 text-slate-800">{line.productName}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {formatPrice(line.unitPriceSnapshot)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {line.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatPrice(line.lineTotal)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold border-t border-slate-200">
                  <td colSpan={4} className="py-2.5 px-3 text-right text-slate-700">
                    Total Order Amount:
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-indigo-900 text-sm">
                    {formatPrice(order.totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Timeline */}
        <div>
          <div className="flex items-center space-x-1.5 mb-2">
            <History className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Order Audit Trail
            </h3>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-52 overflow-y-auto space-y-2 text-xs">
            {!order.auditHistory || order.auditHistory.length === 0 ? (
              <div className="text-slate-400 text-center py-2">No audit events recorded yet</div>
            ) : (
              order.auditHistory.map((event) => (
                <div
                  key={event.id}
                  className="p-2 bg-white rounded border border-slate-200 text-xs space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-purple-700 text-[11px]">
                      {event.eventType}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-600 text-[11px] flex justify-between">
                    <span>
                      Actor: <strong className="font-mono text-slate-800">{event.actorEmail}</strong>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Req: {event.requestId?.slice(0, 14)}...
                    </span>
                  </div>
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <details className="text-[10px] font-mono bg-slate-50 p-1 rounded text-slate-600">
                      <summary className="cursor-pointer text-slate-500">Event metadata</summary>
                      <div className="mt-1 overflow-x-auto">{JSON.stringify(event.metadata)}</div>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
        <button
          onClick={onClose}
          disabled={actionInProgress}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
};
