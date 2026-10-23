import React, { useState } from 'react';
import { Order, OrderStatus, User } from '../types.ts';
import { ShoppingCart, Plus, Search, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface OrderListProps {
  orders: Order[];
  user: User | null;
  loading: boolean;
  onRefresh: () => void;
  onCreateOrder: () => void;
  onSelectOrder: (order: Order) => void;
}

export const OrderList: React.FC<OrderListProps> = ({
  orders,
  user,
  loading,
  onRefresh,
  onCreateOrder,
  onSelectOrder,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const filtered = orders.filter((o) => {
    const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3" />
            <span>PENDING</span>
          </span>
        );
      case 'RESERVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
            <AlertCircle className="w-3 h-3" />
            <span>RESERVED</span>
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3" />
            <span>CONFIRMED</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3" />
            <span>CANCELLED</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Header and filter bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center space-x-2">
          <ShoppingCart className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-900">Orders &amp; Reservations</h2>
          <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
            {orders.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter pills */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs">
            {['ALL', 'PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  filterStatus === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              aria-label="Search orders by order number or customer"
              placeholder="Search orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-sky-500 w-36 sm:w-48 bg-white"
            />
          </div>

          <button
            onClick={onCreateOrder}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Order #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Items</th>
              <th className="py-3 px-4 text-right">Total Amount</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent mr-2 align-middle"></div>
                  Loading orders...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No orders found.
                </td>
              </tr>
            ) : (
              filtered.map((order) => {
                const totalItems = order.lines?.reduce((sum, l) => sum + l.quantity, 0) || 0;

                return (
                  <tr
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Manage order ${order.orderNumber}`}
                    onClick={() => onSelectOrder(order)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectOrder(order);
                      }
                    }}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                      {order.orderNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {order.customerName}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-700 font-medium">
                      {totalItems} units ({order.lines?.length || 0} lines)
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center text-indigo-600 font-semibold hover:text-indigo-800">
                        <span>Manage</span>
                        <ChevronRight className="w-4 h-4 ml-0.5" />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
