import React, { useEffect, useState } from 'react';
import { api, clearAuth, getStoredToken, getStoredUser } from './client/api.ts';
import { Order, Product, User } from './client/types.ts';
import { Navbar } from './client/components/Navbar.tsx';
import { ProductList } from './client/components/ProductList.tsx';
import { OrderList } from './client/components/OrderList.tsx';
import { LoginModal } from './client/components/LoginModal.tsx';
import { CreateProductModal } from './client/components/CreateProductModal.tsx';
import { AdjustStockModal } from './client/components/AdjustStockModal.tsx';
import { StockHistoryModal } from './client/components/StockHistoryModal.tsx';
import { CreateOrderModal } from './client/components/CreateOrderModal.tsx';
import { OrderDetailModal } from './client/components/OrderDetailModal.tsx';
import { AuditFeedModal } from './client/components/AuditFeedModal.tsx';
import {
  Package,
  ShoppingCart,
  Boxes,
  Lock,
  Layers,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [activeTab, setActiveTab] = useState<'products' | 'orders'>('products');

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Modals state
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isAuditFeedOpen, setIsAuditFeedOpen] = useState(false);

  // Restore an existing session only. Never sign in automatically.
  useEffect(() => {
    const initAuth = async () => {
      const stored = getStoredToken();
      if (!stored) return;

      try {
        const me = await api.getCurrentUser();
        setUser(me.user);
      } catch {
        clearAuth();
        setUser(null);
      }
    };

    initAuth();
  }, []);

  const refreshData = async () => {
    if (!user) return;
    setLoading(true);
    setErrorBanner(null);

    try {
      const [prodRes, orderRes] = await Promise.all([
        api.getProducts(1, 100),
        api.getOrders(),
      ]);
      setProducts(prodRes.items || []);
      setOrders(orderRes || []);
    } catch (err: any) {
      if (err?.code === 'UNAUTHENTICATED') {
        clearAuth();
        setUser(null);
        setProducts([]);
        setOrders([]);
        setIsLoginOpen(true);
        return;
      }
      setErrorBanner(err?.message || 'Failed to sync application data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user]);

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setProducts([]);
    setOrders([]);
    setIsLoginOpen(true);
  };

  // Warehouse KPI computations
  const totalOnHand = products.reduce((sum, p) => sum + p.onHandQuantity, 0);
  const totalReserved = products.reduce((sum, p) => sum + p.reservedQuantity, 0);
  const totalAvailable = products.reduce((sum, p) => sum + p.availableQuantity, 0);
  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING').length;
  const reservedOrdersCount = orders.filter((o) => o.status === 'RESERVED').length;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      <Navbar
        user={user}
        onLoginClick={() => setIsLoginOpen(true)}
        onLogoutClick={handleLogout}
        onOpenAuditFeed={() => setIsAuditFeedOpen(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* Error Banner if any */}
        {errorBanner && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-rose-800 text-xs shadow-2xs">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              onClick={refreshData}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Top Operational Metrics KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Products
              </span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">
                {products.length} <span className="text-xs font-normal text-slate-400">SKUs</span>
              </span>
            </div>
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-lg">
              <Boxes className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Available Stock
              </span>
              <span className="text-xl font-bold font-mono text-emerald-600 mt-0.5 block">
                {totalAvailable} <span className="text-xs font-normal text-slate-400">units</span>
              </span>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Reserved Units
              </span>
              <span className="text-xl font-bold font-mono text-amber-600 mt-0.5 block">
                {totalReserved} <span className="text-xs font-normal text-slate-400">/ {totalOnHand}</span>
              </span>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
              <Lock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Active Orders
              </span>
              <span className="text-xl font-bold font-mono text-indigo-600 mt-0.5 block">
                {pendingOrdersCount + reservedOrdersCount}{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({pendingOrdersCount} pend, {reservedOrdersCount} res)
                </span>
              </span>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Main Tabs Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'products'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Products &amp; Inventory</span>
              <span
                className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'products' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {products.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Orders &amp; Reservations</span>
              <span
                className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'orders' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {orders.length}
              </span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={refreshData}
              disabled={loading}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Refresh inventory & orders"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'products' ? (
          <ProductList
            products={products}
            user={user}
            loading={loading}
            onRefresh={refreshData}
            onCreateProduct={() => setIsCreateProductOpen(true)}
            onAdjustStock={(p) => setAdjustingProduct(p)}
            onViewHistory={(p) => setHistoryProduct(p)}
          />
        ) : (
          <OrderList
            orders={orders}
            user={user}
            loading={loading}
            onRefresh={refreshData}
            onCreateOrder={() => setIsCreateOrderOpen(true)}
            onSelectOrder={(o) => setSelectedOrder(o)}
          />
        )}
      </main>

      {/* Modals */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          refreshData();
        }}
      />

      <CreateProductModal
        isOpen={isCreateProductOpen}
        onClose={() => setIsCreateProductOpen(false)}
        onSuccess={() => refreshData()}
      />

      <AdjustStockModal
        product={adjustingProduct}
        isOpen={adjustingProduct !== null}
        onClose={() => setAdjustingProduct(null)}
        onSuccess={() => refreshData()}
      />

      <StockHistoryModal
        product={historyProduct}
        isOpen={historyProduct !== null}
        onClose={() => setHistoryProduct(null)}
      />

      <CreateOrderModal
        products={products}
        isOpen={isCreateOrderOpen}
        onClose={() => setIsCreateOrderOpen(false)}
        onSuccess={(newOrder) => {
          refreshData();
          setSelectedOrder(newOrder);
        }}
      />

      <OrderDetailModal
        order={selectedOrder}
        isOpen={selectedOrder !== null}
        onClose={() => setSelectedOrder(null)}
        onOrderUpdated={(updated) => {
          setSelectedOrder(updated);
          refreshData();
        }}
      />

      <AuditFeedModal
        isOpen={isAuditFeedOpen}
        onClose={() => setIsAuditFeedOpen(false)}
      />

      {/* Minimal Footer with Quick Reference Info */}
      <footer className="bg-white border-t border-slate-200 py-4 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            ReserveFlow Operations System &copy; 2026. Candidate:{' '}
            <strong className="text-slate-800">Zeeshan Haider</strong> (Junior Full-Stack / Backend
            Engineer).
          </div>
        </div>
      </footer>
    </div>
  );
}
