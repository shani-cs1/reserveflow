import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { User } from '../types.ts';
import { X, AlertCircle, Key, Lock, Mail } from 'lucide-react';
import { Dialog } from './Dialog.tsx';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPassword('');
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setError('Please provide email and password');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="login-dialog-title"
      dismissible={!loading}
      panelClassName="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
    >
      <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Lock className="w-5 h-5 text-sky-400" />
          <h2 id="login-dialog-title" className="text-lg font-bold">
            ReserveFlow Authentication
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          aria-label="Close login dialog"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6">
        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2 text-rose-800 text-xs"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>
      </div>
    </Dialog>
  );
};
