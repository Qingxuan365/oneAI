import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { t } from '../i18n';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  /** 危险操作：确认按钮使用警示色 */
  danger?: boolean;
  /** 仅通知：只显示一个确认按钮 */
  notice?: boolean;
}

interface ConfirmDialogProps {
  options: ConfirmOptions | null;
  onResolve: (confirmed: boolean) => void;
}

/** 应用内确认与通知弹窗，替代系统原生 confirm / alert，随主题显示。 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ options, onResolve }) => {
  if (!options) return null;
  const { title, message, confirmLabel = t('确定'), danger, notice } = options;
  return (
    <Modal
      isOpen
      onClose={() => onResolve(false)}
      titleId="confirm-dialog-title"
      title={title}
      icon={danger ? <AlertTriangle size={16} className="text-warning" /> : <Info size={16} className="text-accent" />}
      widthClass="max-w-sm"
      footer={(
        <>
          {!notice && <button type="button" onClick={() => onResolve(false)} className="btn-secondary">{t('取消')}</button>}
          <button type="button" autoFocus onClick={() => onResolve(true)} className={danger ? 'btn-danger' : 'btn-primary'}>{confirmLabel}</button>
        </>
      )}
    >
      <p className="whitespace-pre-line text-ui leading-relaxed text-fg-muted">{message}</p>
    </Modal>
  );
};
