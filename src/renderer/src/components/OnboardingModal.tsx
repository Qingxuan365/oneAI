import React, { useState } from 'react';
import { FolderPlus, Globe, Sparkles } from 'lucide-react';
import { LANGUAGES, Language, t } from '../i18n';
import { Modal } from './Modal';
import { BrandIcon } from './BrandIcon';

interface OnboardingModalProps {
  isOpen: boolean;
  language: Language;
  onLanguageChange: (language: Language) => void;
  /** 本机检测到的 CLI；null 表示检测尚未完成 */
  detectedClis: Array<{ id: string; name: string; icon: string }> | null;
  /** 新任务默认使用的文件夹（本机用户主目录） */
  defaultFolder: string;
  onAddFolder: () => void;
  onFinish: () => void;
}

const tip = 'flex items-start gap-2 text-xs leading-relaxed text-fg-muted';

/** 首次启动引导：先选界面语言，再认识 CLI 检测、文件夹、账号与自定义 CLI 这几个入口；完成后不再弹出。 */
export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, language, onLanguageChange, detectedClis, defaultFolder, onAddFolder, onFinish }) => {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      closeDisabled
      titleId="onboarding-title"
      title={step === 1 ? t('界面语言') : t('欢迎使用 OneAI')}
      icon={step === 1 ? <Globe size={16} className="text-accent" /> : <Sparkles size={16} className="text-accent" />}
      widthClass="max-w-lg"
      footer={step === 1 ? (
        <button type="button" autoFocus onClick={() => setStep(2)} className="btn-primary px-5" data-onboarding-next>{t('下一步')}</button>
      ) : (
        <>
          <button type="button" onClick={() => setStep(1)} className="btn-secondary mr-auto">{t('上一步')}</button>
          <button type="button" autoFocus onClick={onFinish} className="btn-primary px-5" data-onboarding-finish>{t('开始使用')}</button>
        </>
      )}
    >
      {step === 1 ? (
        <div className="space-y-4" data-onboarding-step="language">
          <p className="text-ui text-fg-muted">{t('选择界面语言，之后可以在「设置 → 外观」里随时切换。')}</p>
          <div className="grid grid-cols-3 gap-3" role="group" aria-label={t('界面语言')}>
            {LANGUAGES.map(({ id, label }) => (
              <button key={id} type="button" lang={id} aria-pressed={language === id} onClick={() => onLanguageChange(id)}
                className={`py-3 text-base ${language === id ? 'option-active' : 'option'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5" data-onboarding-step="welcome">
          <section className="space-y-2" aria-label={t('检测到的 CLI')}>
            <h3 className="text-ui font-semibold text-fg">{t('检测到的 CLI')}</h3>
            {detectedClis === null && <p className="text-xs text-fg-faint">{t('检测中…')}</p>}
            {detectedClis !== null && detectedClis.length > 0 && (
              <ul className="flex flex-wrap gap-2" data-onboarding-clis>
                {detectedClis.map((cli) => (
                  <li key={cli.id} className="flex items-center gap-1.5 rounded-md border border-line bg-muted px-2.5 py-1 text-ui text-fg-muted">
                    <BrandIcon icon={cli.icon} size={14} />{cli.name}
                  </li>
                ))}
              </ul>
            )}
            {detectedClis !== null && detectedClis.length === 0 && (
              <p className="rounded-md border border-dashed border-line px-3 py-2 text-xs leading-relaxed text-fg-faint" data-onboarding-no-cli>
                {t('本机 PATH 中没有找到已知的 AI 编程 CLI。安装后在「设置 → CLI」点「重新检测」即可；也可以在那里添加自己的 CLI 命令。')}
              </p>
            )}
          </section>

          <section className="space-y-2" aria-label={t('工作文件夹')}>
            <h3 className="text-ui font-semibold text-fg">{t('工作文件夹')}</h3>
            <p className="text-xs leading-relaxed text-fg-muted">
              {t('任务在文件夹里运行。还没有添加文件夹时，新任务默认在 {folder} 启动；建议先添加自己的项目文件夹。', { folder: defaultFolder || '~' })}
            </p>
            <button type="button" onClick={onAddFolder} className="btn-secondary px-2.5 py-1 text-xs"><FolderPlus size={13} />{t('添加文件夹…')}</button>
          </section>

          <section className="space-y-2" aria-label={t('小提示')}>
            <h3 className="text-ui font-semibold text-fg">{t('小提示')}</h3>
            <ul className="space-y-1.5">
              <li className={tip}>{t('点文件夹右侧的「+」选择 CLI，一键新建任务；多个任务同时运行，切换时终端不会中断。')}</li>
              <li className={tip}>{t('「设置 → 账号」可为 Codex、Claude Code、Kimi Code 添加多个账号；「设置 → CLI」可添加自己的 CLI。')}</li>
              <li className={tip}>{t('Ctrl + , 打开设置，Ctrl + Shift + N 新建自定义任务，更多快捷键见「设置 → 快捷键」。')}</li>
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
};
