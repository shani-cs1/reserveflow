import React from 'react';
import { User } from '../types.ts';
import { Package, ShieldCheck, UserCheck, LogOut, LogIn } from 'lucide-react';
import { SystemToolsMenu } from './SystemToolsMenu.tsx';

interface NavbarProps {
  user: User | null;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onOpenAuditFeed: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLoginClick,
  onLogoutClick,
  onOpenAuditFeed,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-sky-500 to-indigo-600 p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight text-white">ReserveFlow</span>
              <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Inventory Reservation &amp; Order Orchestration Engine
            </p>
          </div>
        </div>

        {/* Admin-only system tools */}
        {user?.role === 'ADMIN' && (
          <div className="hidden md:flex items-center space-x-4 text-xs font-medium text-slate-300">
            <SystemToolsMenu onOpenAuditFeed={onOpenAuditFeed} />
          </div>
        )}

        {/* User Status */}
        <div className="flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700 rounded-lg p-1 pl-2.5 text-xs">
              <div className="flex items-center space-x-1.5">
                {user.role === 'ADMIN' ? (
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                ) : (
                  <UserCheck className="w-4 h-4 text-sky-400" />
                )}
                <div className="hidden sm:block">
                  <span className="font-medium text-slate-200">{user.name.split(' ')[0]}</span>
                  <span
                    className={`ml-1.5 text-[10px] uppercase font-bold px-1.5 py-0.2 rounded ${
                      user.role === 'ADMIN'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogoutClick}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors ml-1"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
