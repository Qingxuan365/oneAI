import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  titleId: string;
  icon?: React.ReactNode;
  /** 面板宽度类名，如 max-w-md */
  widthClass?: string;
  /** 为 true 时禁止通过 Esc、遮罩和关闭按钮退出（提交进行中） */
  closeDisabled?: boolean;
  footer?: React.ReactNode;
  /** 传入后内容区不加默认内边距与滚动，由调用方自行布局 */
  bare?: boolean;
  /** drawer：靠右的侧边抽屉，从顶栏下沿（44px）开始，避开右上角的窗口控件；默认居中弹窗 */
  variant?: 'center' | 'drawer';
  children: React.ReactNode;
}

/** 所有弹窗共用的外壳：统一遮罩、标题栏、Esc 关闭，并在关闭后把焦点还给触发元素。 */
export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, titleId, icon, widthClass = 'max-w-md', closeDisabled = false, footer, bare = false, variant = 'center', children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef({ onClose, closeDisabled });
  closeRef.current = { onClose, closeDisabled };

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || closeRef.current.closeDisabled) return;
      e.stopPropagation();
      closeRef.current.onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const drawer = variant === 'drawer';

  return (
    <div
      className={`modal-overlay fixed z-50 flex bg-black/55 backdrop-blur-[2px] ${drawer ? 'inset-x-0 bottom-0 top-11 justify-end' : 'inset-0 items-center justify-center p-4'}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !closeDisabled) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${drawer ? 'drawer-panel h-full rounded-none border-y-0 border-r-0' : 'modal-panel max-h-[86vh] rounded-xl border'} flex w-full ${widthClass} flex-col overflow-hidden border-line-strong bg-elevated text-fg shadow-2xl outline-none`}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-5 pr-3">
          <h2 id={titleId} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          <button type="button" onClick={onClose} disabled={closeDisabled} className="icon-btn" title={t('关闭 (Esc)')} aria-label={t('关闭')}>
            <X size={16} />
          </button>
        </div>
        {bare ? children : <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
