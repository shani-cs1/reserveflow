import React, { useState } from 'react';
import { Product, User } from '../types.ts';
import { Package, Plus, Sliders, History, Search } from 'lucide-react';

interface ProductListProps {
  products: Product[];
  user: User | null;
  loading: boolean;
  onRefresh: () => void;
  onCreateProduct: () => void;
  onAdjustStock: (product: Product) => void;
  onViewHistory: (product: Product) => void;
}

export const ProductList: React.FC<ProductListProps> = ({
  products,
  user,
  loading,
  onRefresh,
  onCreateProduct,
  onAdjustStock,
  onViewHistory,
}) => {
  const [search, setSearch] = useState('');

  const filtered = products.filter(
    (p) =>
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Table Header / Action Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center space-x-2">
          <Package className="w-5 h-5 text-sky-600" />
          <h2 className="text-base font-bold text-slate-900">Product Inventory</h2>
          <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
            {products.length} SKUs
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              aria-label="Filter products by SKU or name"
              placeholder="Filter by SKU or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-sky-500 w-48 sm:w-60 bg-white"
            />
          </div>

          {user?.role === 'ADMIN' && (
            <button
              onClick={onCreateProduct}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-sky-400" />
              <span>New Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">SKU</th>
              <th className="py-3 px-4">Product Name</th>
              <th className="py-3 px-4 text-right">Unit Price</th>
              <th className="py-3 px-4 text-center">On-Hand</th>
              <th className="py-3 px-4 text-center">Reserved</th>
              <th className="py-3 px-4 text-center">Available</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && products.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-sky-500 border-t-transparent mr-2 align-middle"></div>
                  Loading product inventory...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No products found matching your search.
                </td>
              </tr>
            ) : (
              filtered.map((prod) => {
                const isOutOfStock = prod.availableQuantity <= 0;
                const isLowStock = prod.availableQuantity > 0 && prod.availableQuantity <= 5;

                return (
                  <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {prod.sku}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 max-w-xs truncate">
                      {prod.name}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-700">
                      {formatPrice(prod.unitPrice)}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-700 font-medium">
                      {prod.onHandQuantity}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-amber-600 font-semibold">
                      {prod.reservedQuantity}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          isOutOfStock
                            ? 'bg-rose-100 text-rose-800'
                            : isLowStock
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {prod.availableQuantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => onViewHistory(prod)}
                        className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
                        title="View stock adjustment history"
                        aria-label={`View stock adjustment history for ${prod.sku}`}
                      >
                        <History className="w-3.5 h-3.5 inline mr-1" />
                        <span>History</span>
                      </button>

                      {user?.role === 'ADMIN' && (
                        <button
                          onClick={() => onAdjustStock(prod)}
                          className="px-2 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded font-semibold transition-colors"
                          title="Adjust on-hand inventory"
                          aria-label={`Adjust on-hand stock for ${prod.sku}`}
                        >
                          <Sliders className="w-3.5 h-3.5 inline mr-1" />
                          <span>Adjust</span>
                        </button>
                      )}
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
