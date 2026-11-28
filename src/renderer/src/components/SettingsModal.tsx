import React, { useEffect, useState } from 'react';
import { ArrowUpCircle, Clock, CloudRain, ExternalLink, Image as ImageIcon, Info, Keyboard, LucideIcon, Minus, Monitor, Moon, Palette, Plus, RefreshCw, RotateCcw, Settings, SlidersHorizontal, Snowflake, SquareTerminal, Sun, TerminalSquare, Trash2, Users } from 'lucide-react';
import { Account, AppSettings, CustomCli, GreetingSlot, UpdateState } from '../types';
import { version as appVersion } from '../../../../package.json';
import { THEME_OPTIONS } from '../themes';
import { playTaskDoneSound } from '../taskDoneSound';
import { Modal } from './Modal';
import { LANGUAGES, T, dateLocale, t } from '../i18n';
import { AccountsSettings } from './AccountsSettings';
import { CliSettings } from './CliSettings';
import { MusicStreamsSettings } from './MusicStreamsSettings';
import { TERMINAL_FONT_FAMILY } from './TerminalViewport';
import { clampRainIntensity } from './WorkspaceRain';
import { clampSnowIntensity } from './WorkspaceSnow';
import { BUILTIN_MACOS_WALLPAPERS, clampBackgroundBlur, clampBackgroundOpacity } from '../workspaceBackgrounds';
import {
  DEFAULT_GREETING_MESSAGES,
  DEFAULT_WORK_END_TIME,
  DEFAULT_WORK_START_TIME,
  GREETING_SLOT_ORDER,
  defaultGreetingText,
  describeGreetingSlotRanges,
  greetingSlotLabel,
  normalizeTimeString,
} from '../workGreeting';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetDefault: () => void;
  /** 设置 → 账号 → 登录：由 App 在该账号环境下新开终端任务运行登录命令 */
  onLoginAccount: (account: Account) => void;
  /** 设置 → CLI：内置与自动检测到的 CLI、检测结果（null 为尚未检测完成）、自定义 CLI 的增删改与重新检测 */
  fallbackKnownClis: Array<{ id: string; name: string; command: string }>;
  installed: Record<string, boolean> | null;
  onCustomClisChange: (customClis: CustomCli[]) => void;
  onRedetectClis: () => void | Promise<void>;
  onOpenCliInstaller?: () => void;
  /** 各账号当前的任务数（键为账号 id） */
  accountTaskCounts?: Record<string, number>;
  /** 软件更新状态与操作 */
  updateState?: UpdateState | null;
  onCheckForUpdates?: () => void;
  onOpenUpdate?: () => void;
  onOpenUpdateRelease?: () => void;
}

type TabId = 'appearance' | 'terminal' | 'general' | 'accounts' | 'clis' | 'time' | 'shortcuts' | 'about';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'appearance', label: T('外观'), icon: Palette },
  { id: 'time', label: T('时间'), icon: Clock },
  { id: 'terminal', label: T('终端'), icon: TerminalSquare },
  { id: 'accounts', label: T('账号'), icon: Users },
  { id: 'clis', label: 'CLI', icon: SquareTerminal },
  { id: 'general', label: T('提醒'), icon: SlidersHorizontal },
  { id: 'shortcuts', label: T('快捷键'), icon: Keyboard },
  { id: 'about', label: T('关于'), icon: Info },
];

const FONT_PRESETS = [13, 14, 15, 16, 18, 20];
const LINE_HEIGHTS = [
  { label: T('紧凑'), val: 1.2 },
  { label: T('标准'), val: 1.3 },
  { label: T('宽松'), val: 1.45 },
  { label: T('大行高'), val: 1.6 },
];

const UI_SCALES: { id: AppSettings['uiScale']; name: string; desc: string; pct: string }[] = [
  { id: 'compact', name: T('紧凑'), desc: T('信息密集'), pct: '90%' },
  { id: 'standard', name: T('标准'), desc: T('经典尺寸'), pct: '100%' },
  { id: 'comfortable', name: T('舒适（推荐）'), desc: T('清晰护眼'), pct: '110%' },
  { id: 'large', name: T('大号'), desc: T('适合 2K/4K'), pct: '125%' },
];

const GLASS_MATERIALS: { id: AppSettings['glassMaterial']; name: string; desc: string }[] = [
  { id: 'clear', name: T('清透玻璃'), desc: T('高通透磨砂与镜面高光') },
  { id: 'tinted', name: T('柔和磨砂'), desc: T('均衡半透明，兼顾质感与清晰度') },
  { id: 'solid', name: T('纯实色'), desc: T('关闭模糊与透明，高对比省资源') },
];

const RAIN_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: T('已关闭') },
  { value: 25, label: T('细雨') },
  { value: 55, label: T('中雨') },
  { value: 80, label: T('大雨') },
  { value: 100, label: T('暴雨') },
];

const SNOW_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: T('已关闭') },
  { value: 25, label: T('小雪') },
  { value: 55, label: T('中雪') },
  { value: 80, label: T('大雪') },
  { value: 100, label: T('暴雪') },
];

const CURSOR_STYLES: { id: AppSettings['terminalCursorStyle']; name: string; desc: string; icon: string }[] = [
  { id: 'bar', name: T('竖线（推荐）'), desc: T('不遮挡字符'), icon: '│' },
  { id: 'block', name: T('方块'), desc: T('经典实心方块'), icon: '█' },
  { id: 'underline', name: T('下划线'), desc: T('底部横线'), icon: '▁' },
];

const SHORTCUTS: { title: string; items: [string, string][] }[] = [
  {
    title: T('任务与界面'),
    items: [
      ['Ctrl + Tab / Ctrl + Shift + Tab', T('切换到下一个 / 上一个任务')],
      ['Ctrl + 1 … 9', T('切换到第 N 个任务')],
      ['Ctrl + Shift + T', T('沿用当前任务的 CLI，在当前文件夹一键新建任务')],
      ['Ctrl + Shift + N', T('新建任务并自定义名称、命令与目录')],
      ['Ctrl + Shift + W', T('关闭当前任务')],
      ['Alt + ↑ / ↓', T('焦点在侧栏任务或文件夹手柄上时调整顺序')],
      [T('鼠标中键'), T('关闭侧栏中的任务')],
      ['Ctrl + Shift + B', T('折叠或展开左侧导航栏')],
      ['Ctrl + Shift + H', T('打开历史会话')],
      ['Ctrl + Shift + U', T('打开本周用量')],
      ['Ctrl + Shift + D', T('打开或关闭数据面板')],
      ['Ctrl + Shift + E', T('打开或关闭项目目录树')],
      ['Ctrl + ,', T('打开设置')],
      [T('F2 / 双击任务'), T('重命名任务')],
    ],
  },
  {
    title: T('终端'),
    items: [
      ['Ctrl + Shift + F', T('搜索终端内容')],
      ['Ctrl + Shift + K', T('清空屏幕与历史缓存')],
      ['Shift + Enter', T('在 AI CLI 输入框内换行（系统终端与自定义 CLI 不改写）')],
      [T('Ctrl + 单击'), T('打开终端里的网址或文件路径')],
      ['Ctrl + + / - / 0', T('放大 / 缩小 / 还原终端字号')],
      ['Ctrl + C', T('有选中文本时复制，否则中断命令')],
      ['Ctrl + Shift + C / Ctrl + Insert', T('复制选中文本')],
      ['Ctrl + V / Shift + Insert', T('粘贴文本或图片路径')],
      [T('右键'), T('有选中文本时复制，否则粘贴')],
    ],
  },
];

const Section: React.FC<{ title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, aside, children }) => (
  <section className="space-y-2.5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-ui font-semibold text-fg">
        {title}
        {hint && <span className="ml-2 text-xs font-normal text-fg-faint">{hint}</span>}
      </h3>
      {aside}
    </div>
    {children}
  </section>
);

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-[22px] w-10 shrink-0 rounded-full p-0.5 transition-colors duration-200 shadow-inner ${checked ? 'bg-primary' : 'bg-control-hover/90'}`}
  >
    <span className={`block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.32)] transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
  </button>
);

/** 整数输入框：输入过程中允许暂时为空或只有负号，合法且在范围内时即时生效，失焦时补齐为范围内的值 */
const IntField: React.FC<{ value: number; min: number; max: number; label: string; onCommit: (value: number) => void }> = ({ value, min, max, label, onCommit }) => {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // ± 按钮、恢复默认等外部改动后，没在输入时同步显示
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
  const parse = (raw: string) => (/^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : null);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parse(e.target.value);
        if (parsed !== null && parsed >= min && parsed <= max) onCommit(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parse(text);
        if (parsed !== null) onCommit(Math.max(min, Math.min(max, parsed)));
        else setText(String(value));
      }}
      className="input w-16 select-text text-center font-mono"
    />
  );
};

/** 时间页的「当前状态栏显示」预览：每秒刷新，不用重新打开页面 */
const ClockPreview: React.FC<{ offsetHours: number }> = ({ offsetHours }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className="text-xs text-fg-faint">
      {t('当前状态栏显示：{time}', { time: new Date(now + offsetHours * 3600_000).toLocaleString(dateLocale(), { hour12: false }) })}
      {offsetHours !== 0 && t('（系统时间 {sign}{n} 小时）', { sign: offsetHours > 0 ? '+' : '', n: offsetHours })}
    </p>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetDefault,
  onLoginAccount,
  fallbackKnownClis,
  installed,
  onCustomClisChange,
  onRedetectClis,
  onOpenCliInstaller,
  accountTaskCounts,
  updateState = null,
  onCheckForUpdates,
  onOpenUpdate,
  onOpenUpdateRelease,
}) => {
  const [tab, setTab] = useState<TabId>('appearance');
  const [lastRainIntensity, setLastRainIntensity] = useState(() => {
    const current = clampRainIntensity(settings.rainIntensity, 35);
    return current > 0 ? current : 35;
  });
  const [lastSnowIntensity, setLastSnowIntensity] = useState(() => {
    const current = clampSnowIntensity(settings.snowIntensity, 0);
    return current > 0 ? current : 40;
  });
  const [bgError, setBgError] = useState('');
  const [bgSelecting, setBgSelecting] = useState(false);
  const rainIntensity = clampRainIntensity(settings.rainIntensity, 0);
  const snowIntensity = clampSnowIntensity(settings.snowIntensity, 0);
  const bgPreset = settings.workspaceBackgroundPreset ?? 'none';
  const bgOpacity = clampBackgroundOpacity(settings.workspaceBackgroundOpacity, 32);
  const bgBlur = clampBackgroundBlur(settings.workspaceBackgroundBlur, 0);
  const setRainIntensity = (value: number) => {
    const clamped = clampRainIntensity(value, 0);
    if (clamped > 0) setLastRainIntensity(clamped);
    update({ rainIntensity: clamped });
  };
  const setSnowIntensity = (value: number) => {
    const clamped = clampSnowIntensity(value, 0);
    if (clamped > 0) setLastSnowIntensity(clamped);
    update({ snowIntensity: clamped });
  };
  const handleSelectBackgroundImage = async () => {
    if (!window.electronAPI?.selectWorkspaceBackgroundImage || bgSelecting) return;
    setBgSelecting(true);
    setBgError('');
    try {
      const result = await window.electronAPI.selectWorkspaceBackgroundImage(settings.workspaceBackgroundImage || undefined);
      if (result.ok) {
        update({ workspaceBackgroundPreset: 'custom', workspaceBackgroundImage: result.path });
      } else if (!result.canceled && result.error) {
        setBgError(result.error);
      }
    } catch {
      setBgError(t('无法读取背景图片文件'));
    } finally {
      setBgSelecting(false);
    }
  };
  const hasUpdateDot = Boolean(updateState && (updateState.phase === 'available' || updateState.phase === 'downloading' || updateState.phase === 'downloaded'));
  const update = (patch: Partial<AppSettings>) => onUpdateSettings({ ...settings, ...patch });
  const setFontSize = (size: number) => update({ terminalFontSize: Math.max(12, Math.min(24, size)) });
  const clockOffset = Number.isFinite(settings.clockOffsetHours) ? settings.clockOffsetHours : 0;
  const reminderHours = Number.isFinite(settings.workReminderHours) ? settings.workReminderHours : 1;
  const setReminderHours = (hours: number) => update({ workReminderHours: Number.isFinite(hours) ? Math.max(1, Math.min(12, Math.trunc(hours))) : 1 });
  const setClockOffset =(hours: number) => update({ clockOffsetHours: Number.isFinite(hours) ? Math.max(-24, Math.min(24, Math.trunc(hours))) : 0 });
  const optionClass = (active: boolean) => (active ? 'option-active' : 'option');
  const row = 'flex items-center justify-between gap-3 rounded-xl border border-line/80 bg-muted/75 px-3.5 py-2.5 text-ui text-fg-muted';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="settings-modal-title"
      title={t('设置')}
      icon={<Settings size={16} className="text-accent" />}
      widthClass="max-w-2xl"
      bare
      footer={(
        <>
          <button
            type="button"
            onClick={onResetDefault}
            className="mr-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            title={t('还原外观、终端、时间、提醒与音乐播放器的设置；账号、自定义 CLI、在线音乐和界面语言保留')}
          >
            <RotateCcw size={12} />
            <span>{t('恢复默认设置')}</span>
          </button>
          <button type="button" onClick={onClose} className="btn-primary px-5">{t('完成')}</button>
        </>
      )}
    >
      <div className="flex h-[60vh] min-h-0 select-none">
        {/* 竖向选项卡：只有当前页可 Tab 聚焦，上下方向键与 Home / End 切换（WAI-ARIA tabs 模式） */}
        <div role="tablist" aria-label={t('设置分类')} aria-orientation="vertical" className="glass-surface w-40 shrink-0 space-y-1 overflow-y-auto border-r border-line/70 p-2.5"
          onKeyDown={(e) => {
            const index = TABS.findIndex((item) => item.id === tab);
            const next = e.key === 'ArrowDown' ? (index + 1) % TABS.length
              : e.key === 'ArrowUp' ? (index - 1 + TABS.length) % TABS.length
                : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
            if (next < 0) return;
            e.preventDefault();
            setTab(TABS[next].id);
            document.getElementById(`settings-tab-${TABS[next].id}`)?.focus();
          }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="settings-tabpanel"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-ui transition-all duration-150 ${tab === id ? 'bg-selected/90 font-medium text-fg shadow-sm' : 'text-fg-subtle hover:bg-hover/80 hover:text-fg'}`}
            >
              <Icon size={14} className={tab === id ? 'text-accent' : ''} />
              <span className="truncate">{t(label)}</span>
              {id === 'about' && hasUpdateDot && (
                <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${updateState?.phase === 'downloaded' ? 'bg-success' : 'bg-accent'}`} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="settings-tabpanel" aria-labelledby={`settings-tab-${tab}`} className="min-w-0 flex-1 space-y-6 overflow-y-auto p-5">
          {tab === 'appearance' && (
            <>
              <Section title={t('语言')} hint="Language">
                <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('界面语言')}>
                  {LANGUAGES.map(({ id, label: name }) => (
                    <button key={id} type="button" lang={id} aria-pressed={settings.language === id}
                      onClick={() => update({ language: id })}
                      className={`flex items-center justify-center gap-1.5 py-2 ${optionClass(settings.language === id)}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('主题')}>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('主题色')}>
                  {([
                    { id: 'system', label: t('随系统'), icon: Monitor },
                    { id: 'light', label: t('浅色'), icon: Sun },
                    { id: 'dark', label: t('深色'), icon: Moon },
                  ] as const).map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" aria-pressed={settings.theme === id}
                      onClick={() => update({ theme: id })}
                      className={`flex items-center justify-center gap-1.5 py-2 ${optionClass(settings.theme === id)}`}>
                      <Icon size={14} />{label}
                    </button>
                  ))}
                </div>
                {([
                  { group: 'eyecare', title: t('护眼配色'), label: t('护眼主题色'), cols: 'grid-cols-4' },
                  { group: 'editor', title: t('编辑器配色（Sublime Text、JetBrains 等风格）'), label: t('编辑器配色主题'), cols: 'grid-cols-3' },
                ] as const).map(({ group, title, label, cols }) => (
                  <React.Fragment key={group}>
                    <div className="pt-1 text-xs text-fg-faint">{title}</div>
                    <div className={`grid ${cols} gap-2`} role="group" aria-label={label}>
                      {THEME_OPTIONS.filter((option) => option.group === group).map(({ id, label: name, swatch }) => (
                        <button key={id} type="button" aria-pressed={settings.theme === id}
                          onClick={() => update({ theme: id })}
                          className={`flex items-center justify-center gap-1.5 py-2 ${optionClass(settings.theme === id)}`}>
                          <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-line-strong"
                            style={{ background: `linear-gradient(135deg, ${swatch[0]} 50%, ${swatch[1]} 50%)` }} />
                          <span className="min-w-0 truncate">{name}</span>
                        </button>
                      ))}
                    </div>
                  </React.Fragment>
                ))}
              </Section>

              <Section title={t('玻璃材质')} hint={t('调节导航栏、弹窗与卡片的液态玻璃通透度')}>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('界面玻璃材质')}>
                  {GLASS_MATERIALS.map((item) => {
                    const currentGlass = settings.glassMaterial ?? 'tinted';
                    const active = currentGlass === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-glass-option={item.id}
                        aria-pressed={active}
                        onClick={() => update({ glassMaterial: item.id })}
                        className={`flex flex-col items-start gap-0.5 p-2.5 text-left ${optionClass(active)}`}
                      >
                        <span className="text-ui font-medium text-fg">{t(item.name)}</span>
                        <span className="text-2xs font-normal leading-snug text-fg-faint">{t(item.desc)}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title={t('工作区背景')} hint={t('内置多套 macOS 风格壁纸，也支持自定义本地图片，配合液态玻璃呈现通透层次')}>
                <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('工作区壁纸预设')}>
                  <button
                    type="button"
                    data-bg-preset="none"
                    aria-pressed={bgPreset === 'none'}
                    onClick={() => { setBgError(''); update({ workspaceBackgroundPreset: 'none' }); }}
                    className={`flex flex-col overflow-hidden p-1.5 text-left ${optionClass(bgPreset === 'none')}`}
                  >
                    <span className="mb-1.5 flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-line-strong/80 bg-canvas text-2xs text-fg-faint">
                      {t('纯色主题')}
                    </span>
                    <span className="truncate px-0.5 text-xs font-medium text-fg">{t('无背景')}</span>
                  </button>
                  {BUILTIN_MACOS_WALLPAPERS.map((wp) => {
                    const active = bgPreset === wp.id;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        data-bg-preset={wp.id}
                        aria-pressed={active}
                        onClick={() => { setBgError(''); update({ workspaceBackgroundPreset: wp.id }); }}
                        className={`flex flex-col overflow-hidden p-1.5 text-left ${optionClass(active)}`}
                      >
                        <span
                          className="mb-1.5 block h-11 w-full overflow-hidden rounded-lg border border-white/15"
                          style={{ background: wp.previewGradient }}
                        >
                          <img src={wp.dataUrl} alt="" className="h-full w-full object-cover" />
                        </span>
                        <span className="truncate px-0.5 text-xs font-medium text-fg">{t(wp.name)}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    data-bg-preset="custom"
                    aria-pressed={bgPreset === 'custom'}
                    disabled={bgSelecting}
                    onClick={() => void handleSelectBackgroundImage()}
                    className={`flex flex-col overflow-hidden p-1.5 text-left ${optionClass(bgPreset === 'custom')}`}
                  >
                    <span className="mb-1.5 flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-accent/45 bg-accent/10 text-accent">
                      <ImageIcon size={15} aria-hidden="true" />
                    </span>
                    <span className="truncate px-0.5 text-xs font-medium text-fg">{t('自定义图片')}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-bg-choose-image
                    disabled={bgSelecting}
                    onClick={() => void handleSelectBackgroundImage()}
                    className="btn-secondary py-1 text-xs"
                  >
                    <ImageIcon size={13} />
                    <span>{settings.workspaceBackgroundImage ? t('更换图片') : t('选择本地图片')}</span>
                  </button>
                  {bgPreset !== 'none' && (
                    <button
                      type="button"
                      data-bg-clear
                      onClick={() => { setBgError(''); update({ workspaceBackgroundPreset: 'none' }); }}
                      className="btn-secondary py-1 text-xs"
                    >
                      <Trash2 size={13} />
                      <span>{t('清除背景')}</span>
                    </button>
                  )}
                  {bgPreset === 'custom' && settings.workspaceBackgroundImage && (
                    <span className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-faint" title={settings.workspaceBackgroundImage}>
                      {settings.workspaceBackgroundImage.split(/[\\/]/).pop()}
                    </span>
                  )}
                </div>

                {bgError && (
                  <p role="alert" className="text-xs text-danger">{bgError}</p>
                )}

                {bgPreset !== 'none' && (
                  <div className="space-y-2.5 rounded-xl border border-line/80 bg-muted/65 p-3">
                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-fg-subtle">{t('背景可见度')}</span>
                      <input
                        type="range"
                        min={5}
                        max={85}
                        step={1}
                        aria-label={t('背景可见度')}
                        data-bg-opacity-slider
                        value={bgOpacity}
                        onChange={(e) => update({ workspaceBackgroundOpacity: clampBackgroundOpacity(Number(e.target.value), 32) })}
                        className="slim flex-1"
                      />
                      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-fg-muted">{bgOpacity}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-fg-subtle">{t('背景模糊度')}</span>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        step={1}
                        aria-label={t('背景模糊度')}
                        data-bg-blur-slider
                        value={bgBlur}
                        onChange={(e) => update({ workspaceBackgroundBlur: clampBackgroundBlur(Number(e.target.value), 0) })}
                        className="slim flex-1"
                      />
                      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-fg-muted">{bgBlur}px</span>
                    </div>
                  </div>
                )}
              </Section>

              <Section
                title={t('工作区雨景')}
                hint={t('在全工作区叠加氛围雨滴，可连续调节雨势大小')}
                aside={(
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-muted px-2 py-0.5 font-mono text-2xs text-fg-subtle">
                    <CloudRain size={11} className={rainIntensity > 0 ? 'text-accent' : 'text-fg-faint'} aria-hidden="true" />
                    <span>{rainIntensity > 0 ? `${rainIntensity}%` : t('已关闭')}</span>
                  </span>
                )}
              >
                <div className={row}>
                  <span>
                    <span className="block">{t('开启下雨效果')}</span>
                    <span className="block text-xs text-fg-faint">{t('关闭后不再绘制雨滴动画，零后台开销')}</span>
                  </span>
                  <Switch
                    label={t('开启下雨效果')}
                    checked={rainIntensity > 0}
                    onChange={(checked) => setRainIntensity(checked ? lastRainIntensity : 0)}
                  />
                </div>
                <div className="space-y-2.5 rounded-xl border border-line/80 bg-muted/65 p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-fg-subtle">{t('雨势大小')}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      aria-label={t('工作区下雨强度')}
                      data-rain-slider
                      value={rainIntensity}
                      onChange={(e) => setRainIntensity(Number(e.target.value))}
                      className="slim flex-1"
                    />
                    <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-fg-muted">{rainIntensity}%</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={t('工作区下雨强度')}>
                    {RAIN_PRESETS.map((preset) => {
                      const active = rainIntensity === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          data-rain-preset={preset.value}
                          aria-pressed={active}
                          onClick={() => setRainIntensity(preset.value)}
                          className={`py-1.5 text-center ${optionClass(active)}`}
                        >
                          {t(preset.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Section>

              <Section
                title={t('工作区雪景')}
                hint={t('在全工作区叠加氛围雪花，可连续调节雪势大小')}
                aside={(
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-muted px-2 py-0.5 font-mono text-2xs text-fg-subtle">
                    <Snowflake size={11} className={snowIntensity > 0 ? 'text-accent' : 'text-fg-faint'} aria-hidden="true" />
                    <span>{snowIntensity > 0 ? `${snowIntensity}%` : t('已关闭')}</span>
                  </span>
                )}
              >
                <div className={row}>
                  <span>
                    <span className="block">{t('开启下雪效果')}</span>
                    <span className="block text-xs text-fg-faint">{t('关闭后不再绘制雪花动画，零后台开销')}</span>
                  </span>
                  <Switch
                    label={t('开启下雪效果')}
                    checked={snowIntensity > 0}
                    onChange={(checked) => setSnowIntensity(checked ? lastSnowIntensity : 0)}
                  />
                </div>
                <div className="space-y-2.5 rounded-xl border border-line/80 bg-muted/65 p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-fg-subtle">{t('雪势大小')}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      aria-label={t('工作区下雪强度')}
                      data-snow-slider
                      value={snowIntensity}
                      onChange={(e) => setSnowIntensity(Number(e.target.value))}
                      className="slim flex-1"
                    />
                    <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-fg-muted">{snowIntensity}%</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={t('工作区下雪强度')}>
                    {SNOW_PRESETS.map((preset) => {
                      const active = snowIntensity === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          data-snow-preset={preset.value}
                          aria-pressed={active}
                          onClick={() => setSnowIntensity(preset.value)}
                          className={`py-1.5 text-center ${optionClass(active)}`}
                        >
                          {t(preset.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Section>

              <Section title={t('窗口行为')}>
                <div className={row}>
                  <span>
                    <span className="block">{t('关闭时隐藏到系统托盘')}</span>
                    <span className="block text-xs text-fg-faint">{t('终端继续在后台运行，双击托盘图标恢复窗口。')}</span>
                  </span>
                  <Switch label={t('关闭时隐藏到系统托盘')} checked={settings.closeToTray === true} onChange={(checked) => update({ closeToTray: checked })} />
                </div>
              </Section>

              <Section title={t('界面缩放')} hint={t('侧栏、顶栏、状态栏与弹窗的文字和元素大小')}>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('界面全局字体与元素缩放')}>
                  {UI_SCALES.map((scale) => (
                    <button
                      key={scale.id}
                      type="button"
                      aria-pressed={settings.uiScale === scale.id}
                      onClick={() => update({ uiScale: scale.id })}
                      className={`flex items-center justify-between p-2.5 text-left ${optionClass(settings.uiScale === scale.id)}`}
                    >
                      <span>
                        <span className="block text-ui font-medium text-fg">{t(scale.name)}</span>
                        <span className="block text-2xs font-normal text-fg-faint">{t(scale.desc)}</span>
                      </span>
                      <span className="font-mono text-xs font-bold">{scale.pct}</span>
                    </button>
                  ))}
                </div>
              </Section>
            </>
          )}

          {tab === 'terminal' && (
            <>
              <Section
                title={t('字体大小')}
                hint={t('Ctrl + / - 亦可缩放')}
                aside={<span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-accent">{settings.terminalFontSize}px</span>}
              >
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setFontSize(settings.terminalFontSize - 1)} className="icon-btn border border-line-strong bg-muted" title={t('缩小字体')} aria-label={t('缩小字体')}>
                    <Minus size={13} />
                  </button>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    aria-label={t('终端字体大小')}
                    value={settings.terminalFontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="slim flex-1"
                  />
                  <button type="button" onClick={() => setFontSize(settings.terminalFontSize + 1)} className="icon-btn border border-line-strong bg-muted" title={t('放大字体')} aria-label={t('放大字体')}>
                    <Plus size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {FONT_PRESETS.map((size) => (
                    <button key={size} type="button" onClick={() => setFontSize(size)}
                      className={`flex-1 py-1 font-mono ${optionClass(settings.terminalFontSize === size)}`}>
                      {size}px
                    </button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-md border border-line bg-canvas p-3">
                  <div className="mb-1 text-2xs text-fg-faint">{t('效果预览')}</div>
                  <div
                    style={{
                      fontSize: `${settings.terminalFontSize}px`,
                      lineHeight: settings.terminalLineHeight,
                      fontFamily: TERMINAL_FONT_FAMILY,
                    }}
                    className="select-text text-fg-muted"
                  >
                    <span className="text-accent">&gt;</span> const ai = new CLI(&apos;Kimi&apos;);
                    <br />
                    <span className="text-fg-faint">&gt;</span> <span className="text-warning">await</span> ai.complete(&apos;Hello OneAI&apos;);
                  </div>
                </div>
              </Section>

              <Section title={t('行高')}>
                <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('终端行高')}>
                  {LINE_HEIGHTS.map((item) => {
                    const active = Math.abs(settings.terminalLineHeight - item.val) < 0.05;
                    return (
                      <button key={item.val} type="button" aria-pressed={active} onClick={() => update({ terminalLineHeight: item.val })}
                        className={`px-2 py-1.5 text-center ${optionClass(active)}`}>
                        {t(item.label)} <span className="font-mono opacity-70">{item.val}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title={t('光标')}>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('终端光标样式')}>
                  {CURSOR_STYLES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={settings.terminalCursorStyle === item.id}
                      onClick={() => update({ terminalCursorStyle: item.id })}
                      className={`flex items-center gap-2.5 p-2 text-left ${optionClass(settings.terminalCursorStyle === item.id)}`}
                    >
                      <span className="w-4 text-center font-mono text-base text-accent" aria-hidden="true">{item.icon}</span>
                      <span>
                        <span className="block text-xs font-medium text-fg">{t(item.name)}</span>
                        <span className="block text-2xs font-normal text-fg-faint">{t(item.desc)}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className={row}>
                  <span>{t('光标闪烁')}</span>
                  <Switch label={t('光标闪烁')} checked={settings.terminalCursorBlink} onChange={(checked) => update({ terminalCursorBlink: checked })} />
                </div>
                <div className={row}>
                  <span>
                    <span className="block">{t('平滑滚动')}</span>
                    <span className="block text-xs text-fg-faint">{t('鼠标滚轮和翻页键滚动终端时带缓动动画，CLI 输出刷新不受影响')}</span>
                  </span>
                  <Switch label={t('平滑滚动')} checked={settings.terminalSmoothScroll === true} onChange={(checked) => update({ terminalSmoothScroll: checked })} />
                </div>
                <div className={row}>
                  <span>
                    <span className="block">{t('单击打开链接')}</span>
                    <span className="block text-xs text-fg-faint">{t('开启后无需按住 Ctrl，直接单击终端里的网址或文件路径即可打开；划选文字时可能误触')}</span>
                  </span>
                  <Switch label={t('单击打开链接')} checked={settings.terminalLinkClick === true} onChange={(checked) => update({ terminalLinkClick: checked })} />
                </div>
              </Section>

              <Section title={t('文件预览')} hint={t('Ctrl + 单击终端里的文件路径打开')}>
                <div className={row}>
                  <span>
                    <span className="block">{t('显示代码缩略图（minimap）')}</span>
                    <span className="block text-xs text-fg-faint">{t('预览文本文件时，在右侧显示类似 VS Code 的缩略图，点击或拖动即可快速滚动')}</span>
                  </span>
                  <Switch label={t('显示文件预览小地图')} checked={settings.previewMinimap !== false} onChange={(checked) => update({ previewMinimap: checked })} />
                </div>
              </Section>
            </>
          )}

          {tab === 'general' && (
            <>
              <Section title={t('工作时长提醒')}>
                <div className={row}>
                  <span>
                    <span className="block">{t('提醒时长')}</span>
                    <span className="block text-xs text-fg-faint">{t('从打开应用起算，每隔设定的小时数提醒一次，默认 1 小时；可填 1 到 12 的整数')}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => setReminderHours(reminderHours - 1)} disabled={reminderHours <= 1} className="icon-btn border border-line-strong bg-canvas" title={t('减少 1 小时')} aria-label={t('提醒时长减少 1 小时')}>
                      <Minus size={13} />
                    </button>
                    <IntField label={t('工作时长提醒的小时数')} value={reminderHours} min={1} max={12} onCommit={setReminderHours} />
                    <button type="button" onClick={() => setReminderHours(reminderHours + 1)} disabled={reminderHours >= 12} className="icon-btn border border-line-strong bg-canvas" title={t('增加 1 小时')} aria-label={t('提醒时长增加 1 小时')}>
                      <Plus size={13} />
                    </button>
                    <span className="text-xs text-fg-faint">{t('小时')}</span>
                  </span>
                </div>
                <div className={row}>
                  <span>
                    <span className="block">{t('到时语音播报')}</span>
                    <span className="block text-xs text-fg-faint">{t('关闭后仍会显示提醒弹框')}</span>
                  </span>
                  <Switch label={t('到时语音播报')} checked={settings.voiceReminderEnabled} onChange={(checked) => update({ voiceReminderEnabled: checked })} />
                </div>
              </Section>

              <Section title={t('任务完成提示音')}>
                <div className={row}>
                  <span>
                    <span className="block">{t('任务停止输出时播放提示音')}</span>
                    <span className="block text-xs text-fg-faint">{t('任务由「运行中」转为「等待输入」或进程退出时响一声；无法区分已完成与等待确认')}</span>
                  </span>
                  <Switch
                    label={t('任务停止输出时播放提示音')}
                    checked={settings.taskDoneSoundEnabled !== false}
                    onChange={(checked) => { update({ taskDoneSoundEnabled: checked }); if (checked) playTaskDoneSound(settings.taskDoneSoundVolume); }}
                  />
                </div>
                {settings.taskDoneSoundEnabled !== false && (
                  <>
                    <div className={row}>
                      <span>
                        <span className="block">{t('仅在后台任务时响')}</span>
                        <span className="block text-xs text-fg-faint">{t('正在查看的任务不响；窗口失焦时所有任务都会响')}</span>
                      </span>
                      <Switch label={t('仅在后台任务时响')} checked={settings.taskDoneSoundBackgroundOnly === true} onChange={(checked) => update({ taskDoneSoundBackgroundOnly: checked })} />
                    </div>
                    <div className={row}>
                      <span className="block">{t('音量')}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          aria-label={t('提示音音量')}
                          value={settings.taskDoneSoundVolume}
                          onChange={(e) => update({ taskDoneSoundVolume: parseInt(e.target.value, 10) })}
                          onPointerUp={() => playTaskDoneSound(settings.taskDoneSoundVolume)}
                          className="slim w-36"
                        />
                        <span className="w-9 text-right font-mono text-xs text-fg-faint">{settings.taskDoneSoundVolume}%</span>
                      </span>
                    </div>
                  </>
                )}
              </Section>

              <Section title={t('音乐播放器')}>
                <div className={row}>
                  <span>
                    <span className="block">{t('显示音乐播放器')}</span>
                    <span className="block text-xs text-fg-faint">{t('关闭后侧栏底部不再显示播放器，正在播放的音乐会停止')}</span>
                  </span>
                  <Switch label={t('显示音乐播放器')} checked={settings.musicPlayerVisible} onChange={(checked) => update({ musicPlayerVisible: checked })} />
                </div>
                <div className={row}>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={settings.musicDirectory || t('系统「音乐」目录')}>
                    {settings.musicDirectory || t('系统「音乐」目录（默认）')}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const dir = await window.electronAPI?.selectMusicDirectory?.(settings.musicDirectory);
                      if (dir) update({ musicDirectory: dir });
                    }}
                    className="btn-secondary px-2.5 py-1 text-xs"
                  >
                    {t('选择目录')}
                  </button>
                  {settings.musicDirectory && (
                    <button type="button" onClick={() => update({ musicDirectory: '' })} className="btn-secondary px-2.5 py-1 text-xs">
                      {t('恢复默认')}
                    </button>
                  )}
                </div>
                <p className="text-xs text-fg-faint">{t('扫描所选目录下的 mp3 / wav / ogg / m4a / flac / aac / opus 文件，不含子目录；找到音乐后播放器显示在侧栏底部。')}</p>
                <MusicStreamsSettings streams={settings.musicStreams} onChange={(musicStreams) => update({ musicStreams })} />
              </Section>
            </>
          )}

          {tab === 'accounts' && (
            <AccountsSettings
              isActive={isOpen && tab === 'accounts'}
              accounts={settings.accounts}
              onChange={(accounts) => update({ accounts })}
              onLogin={onLoginAccount}
              taskCounts={accountTaskCounts}
            />
          )}

          {tab === 'clis' && (
            <CliSettings
              fallbackKnownClis={fallbackKnownClis}
              customClis={settings.customClis}
              installed={installed}
              onChange={onCustomClisChange}
              onRedetect={onRedetectClis}
              onOpenInstaller={onOpenCliInstaller}
            />
          )}

          {tab === 'time' && (() => {
            const workStartTime = normalizeTimeString(settings.workStartTime, DEFAULT_WORK_START_TIME);
            const workEndTime = normalizeTimeString(settings.workEndTime, DEFAULT_WORK_END_TIME);
            const greetingMessages = settings.greetingMessages ?? DEFAULT_GREETING_MESSAGES;
            const slotRanges = describeGreetingSlotRanges(workStartTime, workEndTime);
            const updateGreeting = (slot: GreetingSlot, value: string) => {
              update({
                greetingMessages: {
                  ...DEFAULT_GREETING_MESSAGES,
                  ...greetingMessages,
                  [slot]: value.replace(/[\r\n]+/g, ' ').slice(0, 60),
                },
              });
            };
            return (
              <>
                <Section title={t('工作时间与问候语')} hint={t('影响侧栏左上角提示语')}>
                  <div className={row}>
                    <span>
                      <span className="block">{t('工作时间段')}</span>
                      <span className="block text-xs text-fg-faint">{t('例如 09:00 - 18:00，左上角提示语会按工作时段自动切换')}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <input
                        type="time"
                        data-work-start-time
                        aria-label={t('上班时间')}
                        value={workStartTime}
                        onChange={(e) => {
                          const next = normalizeTimeString(e.target.value, '');
                          if (next) update({ workStartTime: next });
                        }}
                        className="input h-8 w-28 px-2 font-mono text-xs tabular-nums"
                      />
                      <span className="text-xs text-fg-faint" aria-hidden="true">--</span>
                      <input
                        type="time"
                        data-work-end-time
                        aria-label={t('下班时间')}
                        value={workEndTime}
                        onChange={(e) => {
                          const next = normalizeTimeString(e.target.value, '');
                          if (next) update({ workEndTime: next });
                        }}
                        className="input h-8 w-28 px-2 font-mono text-xs tabular-nums"
                      />
                    </span>
                  </div>
                  <div className="space-y-2 rounded-md border border-line bg-muted p-3">
                    <div>
                      <span className="block text-ui text-fg-muted">{t('各时段提示语')}</span>
                      <span className="block text-xs text-fg-faint">{t('留空则使用默认提示语，可为每个时段自定义文案')}</span>
                    </div>
                    <div className="space-y-2">
                      {GREETING_SLOT_ORDER.map((slot) => {
                        const slotName = greetingSlotLabel(slot);
                        const customValue = greetingMessages[slot] ?? '';
                        return (
                          <div key={slot} className="flex items-center gap-2">
                            <span className="flex w-28 shrink-0 items-center justify-between gap-1 text-xs">
                              <span className="font-medium text-fg">{slotName}</span>
                              <span data-greeting-range={slot} className="font-mono text-2xs tabular-nums text-fg-faint">{slotRanges[slot]}</span>
                            </span>
                            <input
                              type="text"
                              data-greeting-input={slot}
                              aria-label={t('{slot}提示语', { slot: slotName })}
                              value={customValue}
                              maxLength={60}
                              placeholder={defaultGreetingText(slot)}
                              onChange={(e) => updateGreeting(slot, e.target.value)}
                              className="input h-8 min-w-0 flex-1 select-text px-2.5 text-xs"
                            />
                            {customValue && (
                              <button
                                type="button"
                                onClick={() => updateGreeting(slot, '')}
                                className="icon-btn h-8 w-8 shrink-0"
                                title={t('恢复默认')}
                                aria-label={t('恢复{slot}默认提示语', { slot: slotName })}
                              >
                                <RotateCcw size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Section>

                <Section title={t('状态栏时钟')} hint={t('在系统时间上增加的小时数')}>
                  <div className={row}>
                    <span>
                      <span className="block">{t('增加小时数')}</span>
                      <span className="block text-xs text-fg-faint">{t('默认 0，显示系统时间；可填 -24 到 24 的整数')}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => setClockOffset(clockOffset - 1)} disabled={clockOffset <= -24} className="icon-btn border border-line-strong bg-canvas" title={t('减少 1 小时')} aria-label={t('减少 1 小时')}>
                        <Minus size={13} />
                      </button>
                      <IntField label={t('状态栏时钟增加的小时数')} value={clockOffset} min={-24} max={24} onCommit={setClockOffset} />
                      <button type="button" onClick={() => setClockOffset(clockOffset + 1)} disabled={clockOffset >= 24} className="icon-btn border border-line-strong bg-canvas" title={t('增加 1 小时')} aria-label={t('增加 1 小时')}>
                        <Plus size={13} />
                      </button>
                      <span className="text-xs text-fg-faint">{t('小时')}</span>
                    </span>
                  </div>
                  <div className={row}>
                    <span>
                      <span className="block">{t('显示年月日')}</span>
                      <span className="block text-xs text-fg-faint">{t('状态栏时钟显示年月日（中文界面含农历）与星期，窗口过窄时自动收起；关闭后只显示时间')}</span>
                    </span>
                    <Switch label={t('显示年月日')} checked={settings.topbarDateVisible !== false} onChange={(checked) => update({ topbarDateVisible: checked })} />
                  </div>
                  <ClockPreview offsetHours={clockOffset} />
                  <div className={row}>
                    <span>
                      <span className="block">{t('显示状态栏')}</span>
                      <span className="block text-xs text-fg-faint">{t('终端下方的两行状态栏：任务状态、额度进度条、模型、会话用量、系统资源与时钟；关闭后终端多出两行高度')}</span>
                    </span>
                    <Switch label={t('显示状态栏')} checked={settings.statusBarVisible !== false} onChange={(checked) => update({ statusBarVisible: checked })} />
                  </div>
                </Section>
              </>
            );
          })()}

          {tab === 'shortcuts' && SHORTCUTS.map((group) => (
            <Section key={group.title} title={t(group.title)}>
              <dl className="divide-y divide-line overflow-hidden rounded-md border border-line">
                {group.items.map(([keys, desc]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 bg-muted px-3 py-2">
                    <dt className="text-ui text-fg-muted">{t(desc)}</dt>
                    <dd className="shrink-0 rounded border border-line-strong bg-canvas px-1.5 py-0.5 font-mono text-xs text-fg-subtle">{t(keys)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          ))}

          {tab === 'about' && (
            <>
              <Section title={t('软件更新')}>
                <div className={row}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">OneAI <span className="font-mono text-fg-subtle">v{updateState?.currentVersion ?? appVersion}</span></span>
                    <span className="block break-words text-xs text-fg-faint">
                      {updateState?.phase === 'checking'
                        ? t('正在检查更新…')
                        : updateState?.phase === 'available' && updateState.latestVersion
                          ? t('发现新版本 v{version}', { version: updateState.latestVersion })
                          : updateState?.phase === 'downloading'
                            ? t('正在下载新版本（{percent}%）', { percent: updateState.progress?.percent ?? 0 })
                            : updateState?.phase === 'downloaded' && updateState.latestVersion
                              ? t('新版本 v{version} 已下载完成，等待重启安装', { version: updateState.latestVersion })
                              : updateState?.phase === 'not-available'
                                ? t('当前已是最新版本')
                                : updateState?.phase === 'error'
                                  ? (updateState.error || t('检查更新失败，请稍后重试'))
                                  : t('从 GitHub Releases 检查并获取新版本')}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {hasUpdateDot && onOpenUpdate ? (
                      <button type="button" onClick={onOpenUpdate} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                        <ArrowUpCircle size={13} aria-hidden="true" />
                        <span>{updateState?.phase === 'downloaded' ? t('立即安装') : t('查看更新')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onCheckForUpdates}
                        disabled={updateState?.phase === 'checking' || !onCheckForUpdates}
                        className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={updateState?.phase === 'checking' ? 'animate-spin' : ''} aria-hidden="true" />
                        <span>{t('检查更新')}</span>
                      </button>
                    )}
                  </span>
                </div>
                <div className={row}>
                  <span>
                    <span className="block">{t('启动时自动检查更新')}</span>
                    <span className="block text-xs text-fg-faint">{t('启动应用后在后台静默检查 GitHub 新版本；不会自动下载，断网时静默跳过')}</span>
                  </span>
                  <Switch label={t('启动时自动检查更新')} checked={settings.autoCheckUpdates !== false} onChange={(checked) => update({ autoCheckUpdates: checked })} />
                </div>
                {onOpenUpdateRelease && (
                  <div className={row}>
                    <span>
                      <span className="block">GitHub Releases</span>
                      <span className="block text-xs text-fg-faint">{t('查看历史版本、更新日志与手动下载安装包')}</span>
                    </span>
                    <button type="button" onClick={onOpenUpdateRelease} className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                      <ExternalLink size={12} aria-hidden="true" />
                      <span>{t('打开发布页')}</span>
                    </button>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
