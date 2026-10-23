import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { AuditEvent } from '../types.ts';
import { X, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { Dialog } from './Dialog.tsx';

interface AuditFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuditFeedModal: React.FC<AuditFeedModalProps> = ({ isOpen, onClose }) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvents([]);

    api
      .getAuditEvents(50)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load audit events');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, reloadToken]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="audit-feed-dialog-title"
      panelClassName="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden border border-slate-200 flex flex-col"
    >
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-purple-400" />
          <h2 id="audit-feed-dialog-title" className="text-base font-bold">
            System Append-Only Audit Trail
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={loading}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors disabled:opacity-50"
            title="Refresh audit events"
            aria-label="Refresh audit events"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
            aria-label="Close audit trail dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
        {error && (
          <div
            role="alert"
            className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start justify-between gap-2 text-rose-800 text-xs"
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

        {loading && events.length === 0 ? (
          <div className="py-8 text-center text-slate-500" role="status">
            Loading audit trail...
          </div>
        ) : !error && events.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No audit events recorded.</div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 font-mono text-[11px]"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-800 text-xs">{ev.eventType}</span>
                <span className="text-slate-400 text-[10px]">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>
                  Entity: <strong>{ev.targetEntityType}</strong> ({ev.targetEntityId?.slice(0, 8)}...)
                </span>
                <span>
                  Actor: <strong>{ev.actorEmail}</strong> ({ev.actorRole})
                </span>
              </div>
              <div className="text-[10px] text-slate-400">Request: {ev.requestId}</div>
              {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                <details className="bg-white p-2 rounded border border-slate-200 text-slate-700 text-[10px]">
                  <summary className="cursor-pointer text-slate-500">Event metadata</summary>
                  <div className="mt-1 overflow-x-auto">{JSON.stringify(ev.metadata)}</div>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
};
