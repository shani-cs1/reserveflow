import React, { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, FileText, Heart, Settings2, ShieldCheck } from 'lucide-react';

interface SystemToolsMenuProps {
  onOpenAuditFeed: () => void;
}

const itemClassName =
  'flex w-full items-center space-x-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 hover:text-white transition-colors';

export const SystemToolsMenu: React.FC<SystemToolsMenuProps> = ({ onOpenAuditFeed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors border border-slate-700/60"
      >
        <Settings2 className="w-3.5 h-3.5 text-slate-400" />
        <span>System Tools</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="System tools"
          className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
        >
          <a
            role="menuitem"
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className={itemClassName}
            onClick={() => setIsOpen(false)}
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>OpenAPI Docs</span>
          </a>

          <a
            role="menuitem"
            href="/health/ready"
            target="_blank"
            rel="noreferrer"
            className={itemClassName}
            onClick={() => setIsOpen(false)}
          >
            <Heart className="w-3.5 h-3.5 text-emerald-400" />
            <span>Health / Ready</span>
          </a>

          <a
            role="menuitem"
            href="/metrics"
            target="_blank"
            rel="noreferrer"
            className={itemClassName}
            onClick={() => setIsOpen(false)}
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Metrics</span>
          </a>

          <button
            role="menuitem"
            type="button"
            className={itemClassName}
            onClick={() => {
              setIsOpen(false);
              onOpenAuditFeed();
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>Audit Trail</span>
          </button>
        </div>
      )}
    </div>
  );
};
