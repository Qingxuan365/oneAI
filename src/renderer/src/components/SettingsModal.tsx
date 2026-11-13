import React, { useState } from 'react';
import { Clock, Keyboard, LucideIcon, Minus, Monitor, Moon, Palette, Plus, RotateCcw, Settings, SlidersHorizontal, Sun, TerminalSquare, Users } from 'lucide-react';
import { Account, AppSettings } from '../types';
import { THEME_OPTIONS } from '../themes';
import { Modal } from './Modal';
import { AccountsSettings } from './AccountsSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetDefault: () => void;
  /** 设置 → 账号 → 登录：由 App 在该账号环境下新开终端任务运行登录命令 */
  onLoginAccount: (account: Account) => void;
}

type TabId = 'appearance' | 'terminal' | 'general' | 'accounts' | 'time' | 'shortcuts';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'time', label: '时间', icon: Clock },
  { id: 'terminal', label: '终端', icon: TerminalSquare },
  { id: 'accounts', label: '账号', icon: Users },
  { id: 'general', label: '提醒', icon: SlidersHorizontal },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
];

const FONT_PRESETS = [13, 14, 15, 16, 18, 20];
const LINE_HEIGHTS = [
  { label: '紧凑', val: 1.2 },
  { label: '标准', val: 1.3 },
  { label: '宽松', val: 1.45 },
  { label: '大行高', val: 1.6 },
];

const UI_SCALES: { id: AppSettings['uiScale']; name: string; desc: string; pct: string }[] = [
  { id: 'compact', name: '紧凑', desc: '信息密集', pct: '90%' },
  { id: 'standard', name: '标准', desc: '经典尺寸', pct: '100%' },
  { id: 'comfortable', name: '舒适（推荐）', desc: '清晰护眼', pct: '110%' },
  { id: 'large', name: '大号', desc: '适合 2K/4K', pct: '125%' },
];

const CURSOR_STYLES: { id: AppSettings['terminalCursorStyle']; name: string; desc: string; icon: string }[] = [
  { id: 'bar', name: '竖线（推荐）', desc: '不遮挡字符', icon: '│' },
  { id: 'block', name: '方块', desc: '经典实心方块', icon: '█' },
  { id: 'underline', name: '下划线', desc: '底部横线', icon: '▁' },
];

const SHORTCUTS: { title: string; items: [string, string][] }[] = [
  {
    title: '任务与界面',
    items: [
      ['Ctrl + Tab / Ctrl + Shift + Tab', '切换到下一个 / 上一个任务'],
      ['Ctrl + 1 … 9', '切换到第 N 个任务'],
      ['Ctrl + Shift + T', '沿用当前任务的 CLI，在当前文件夹一键新建任务'],
      ['Ctrl + Shift + N', '新建任务并自定义名称、命令与目录'],
      ['Ctrl + Shift + W', '关闭当前任务'],
      ['Alt + ↑ / ↓', '焦点在侧栏任务或文件夹手柄上时调整顺序'],
      ['鼠标中键', '关闭侧栏中的任务'],
      ['Ctrl + Shift + B', '折叠或展开左侧导航栏'],
      ['Ctrl + Shift + H', '打开历史会话'],
      ['Ctrl + ,', '打开设置'],
      ['F2 / 双击任务', '重命名任务'],
    ],
  },
  {
    title: '终端',
    items: [
      ['Ctrl + Shift + F', '搜索终端内容'],
      ['Ctrl + Shift + K', '清空屏幕与历史缓存'],
      ['Shift + Enter', '在 AI CLI 输入框内换行'],
      ['Ctrl + 单击', '打开终端里的网址或文件路径'],
      ['Ctrl + + / - / 0', '放大 / 缩小 / 还原终端字号'],
      ['Ctrl + C', '有选中文本时复制，否则中断命令'],
      ['Ctrl + V / 右键', '粘贴文本或图片路径'],
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
    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-control-hover'}`}
  >
    <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetDefault,
  onLoginAccount,
}) => {
  const [tab, setTab] = useState<TabId>('appearance');
  const update = (patch: Partial<AppSettings>) => onUpdateSettings({ ...settings, ...patch });
  const setFontSize = (size: number) => update({ terminalFontSize: Math.max(12, Math.min(24, size)) });
  const clockOffset = Number.isFinite(settings.clockOffsetHours) ? settings.clockOffsetHours : 0;
  const reminderHours = Number.isFinite(settings.workReminderHours) ? settings.workReminderHours : 1;
  const setReminderHours = (hours: number) => update({ workReminderHours: Number.isFinite(hours) ? Math.max(1, Math.min(12, Math.trunc(hours))) : 1 });
  const setClockOffset =(hours: number) => update({ clockOffsetHours: Number.isFinite(hours) ? Math.max(-24, Math.min(24, Math.trunc(hours))) : 0 });
  const optionClass = (active: boolean) => (active ? 'option-active' : 'option');
  const row = 'flex items-center justify-between gap-3 rounded-md border border-line bg-muted px-3 py-2.5 text-ui text-fg-muted';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="settings-modal-title"
      title="设置"
      icon={<Settings size={16} className="text-accent" />}
      widthClass="max-w-2xl"
      bare
      footer={(
        <>
          <button
            type="button"
            onClick={onResetDefault}
            className="mr-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            title="还原为：主题随系统、终端 15px、竖线光标、舒适缩放；账号配置保留"
          >
            <RotateCcw size={12} />
            <span>恢复默认设置</span>
          </button>
          <button type="button" onClick={onClose} className="btn-primary px-5">完成</button>
        </>
      )}
    >
      <div className="flex h-[60vh] min-h-0 select-none">
        <div role="tablist" aria-label="设置分类" aria-orientation="vertical" className="w-36 shrink-0 space-y-0.5 border-r border-line bg-surface p-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-ui transition-colors ${tab === id ? 'bg-selected font-medium text-fg' : 'text-fg-subtle hover:bg-hover hover:text-fg'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="min-w-0 flex-1 space-y-6 overflow-y-auto p-5">
          {tab === 'appearance' && (
            <>
              <Section title="主题">
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="主题色">
                  {([
                    { id: 'system', label: '随系统', icon: Monitor },
                    { id: 'light', label: '浅色', icon: Sun },
                    { id: 'dark', label: '深色', icon: Moon },
                  ] as const).map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" aria-pressed={settings.theme === id}
                      onClick={() => update({ theme: id })}
                      className={`flex items-center justify-center gap-1.5 py-2 ${optionClass(settings.theme === id)}`}>
                      <Icon size={14} />{label}
                    </button>
                  ))}
                </div>
                <div className="pt-1 text-xs text-fg-faint">护眼配色</div>
                <div className="grid grid-cols-4 gap-2" role="group" aria-label="护眼主题色">
                  {THEME_OPTIONS.filter(({ id }) => id !== 'light' && id !== 'dark').map(({ id, label, swatch }) => (
                    <button key={id} type="button" aria-pressed={settings.theme === id}
                      onClick={() => update({ theme: id })}
                      className={`flex items-center justify-center gap-1.5 py-2 ${optionClass(settings.theme === id)}`}>
                      <span className="inline-block h-3.5 w-3.5 rounded-full border border-line-strong"
                        style={{ background: `linear-gradient(135deg, ${swatch[0]} 50%, ${swatch[1]} 50%)` }} />
                      {label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="界面缩放" hint="侧栏、顶栏与弹窗的文字和元素大小">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="界面全局字体与元素缩放">
                  {UI_SCALES.map((scale) => (
                    <button
                      key={scale.id}
                      type="button"
                      aria-pressed={settings.uiScale === scale.id}
                      onClick={() => update({ uiScale: scale.id })}
                      className={`flex items-center justify-between p-2.5 text-left ${optionClass(settings.uiScale === scale.id)}`}
                    >
                      <span>
                        <span className="block text-ui font-medium text-fg">{scale.name}</span>
                        <span className="block text-2xs font-normal text-fg-faint">{scale.desc}</span>
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
                title="字体大小"
                hint="Ctrl + / - 亦可缩放"
                aside={<span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-accent">{settings.terminalFontSize}px</span>}
              >
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setFontSize(settings.terminalFontSize - 1)} className="icon-btn border border-line-strong bg-muted" title="缩小字体" aria-label="缩小字体">
                    <Minus size={13} />
                  </button>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    aria-label="终端字体大小"
                    value={settings.terminalFontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="slim flex-1"
                  />
                  <button type="button" onClick={() => setFontSize(settings.terminalFontSize + 1)} className="icon-btn border border-line-strong bg-muted" title="放大字体" aria-label="放大字体">
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
                  <div className="mb-1 text-2xs text-fg-faint">效果预览</div>
                  <div
                    style={{
                      fontSize: `${settings.terminalFontSize}px`,
                      lineHeight: settings.terminalLineHeight,
                      fontFamily: 'Consolas, "Fira Code", monospace',
                    }}
                    className="select-text text-fg-muted"
                  >
                    <span className="text-accent">&gt;</span> const ai = new CLI(&apos;Kimi&apos;);
                    <br />
                    <span className="text-fg-faint">&gt;</span> <span className="text-warning">await</span> ai.complete(&apos;Hello OneAI&apos;);
                  </div>
                </div>
              </Section>

              <Section title="行高">
                <div className="grid grid-cols-4 gap-2" role="group" aria-label="终端行高">
                  {LINE_HEIGHTS.map((item) => {
                    const active = Math.abs(settings.terminalLineHeight - item.val) < 0.05;
                    return (
                      <button key={item.val} type="button" aria-pressed={active} onClick={() => update({ terminalLineHeight: item.val })}
                        className={`px-2 py-1.5 text-center ${optionClass(active)}`}>
                        {item.label} <span className="font-mono opacity-70">{item.val}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="光标">
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="终端光标样式">
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
                        <span className="block text-xs font-medium text-fg">{item.name}</span>
                        <span className="block text-2xs font-normal text-fg-faint">{item.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className={row}>
                  <span>光标闪烁</span>
                  <Switch label="光标闪烁" checked={settings.terminalCursorBlink} onChange={(checked) => update({ terminalCursorBlink: checked })} />
                </div>
              </Section>
            </>
          )}

          {tab === 'general' && (
            <>
              <Section title="工作时长提醒">
                <div className={row}>
                  <span>
                    <span className="block">提醒时长</span>
                    <span className="block text-xs text-fg-faint">从打开应用起算，默认 1 小时；可填 1 到 12 的整数</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => setReminderHours(reminderHours - 1)} disabled={reminderHours <= 1} className="icon-btn border border-line-strong bg-canvas" title="减少 1 小时" aria-label="提醒时长减少 1 小时">
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      aria-label="工作时长提醒的小时数"
                      value={reminderHours}
                      onChange={(e) => setReminderHours(e.target.value === '' ? 1 : Number(e.target.value))}
                      className="input w-16 select-text text-center font-mono"
                    />
                    <button type="button" onClick={() => setReminderHours(reminderHours + 1)} disabled={reminderHours >= 12} className="icon-btn border border-line-strong bg-canvas" title="增加 1 小时" aria-label="提醒时长增加 1 小时">
                      <Plus size={13} />
                    </button>
                    <span className="text-xs text-fg-faint">小时</span>
                  </span>
                </div>
                <div className={row}>
                  <span>
                    <span className="block">到时语音播报</span>
                    <span className="block text-xs text-fg-faint">关闭后仍会显示提醒弹框</span>
                  </span>
                  <Switch label="到时语音播报" checked={settings.voiceReminderEnabled} onChange={(checked) => update({ voiceReminderEnabled: checked })} />
                </div>
              </Section>

              <Section title="音乐播放器">
                <div className={row}>
                  <span>
                    <span className="block">显示音乐播放器</span>
                    <span className="block text-xs text-fg-faint">关闭后侧栏底部不再显示播放器，正在播放的音乐会停止</span>
                  </span>
                  <Switch label="显示音乐播放器" checked={settings.musicPlayerVisible} onChange={(checked) => update({ musicPlayerVisible: checked })} />
                </div>
                <div className={row}>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={settings.musicDirectory || '系统「音乐」目录'}>
                    {settings.musicDirectory || '系统「音乐」目录（默认）'}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const dir = await window.electronAPI?.selectMusicDirectory?.(settings.musicDirectory);
                      if (dir) update({ musicDirectory: dir });
                    }}
                    className="btn-secondary px-2.5 py-1 text-xs"
                  >
                    选择目录
                  </button>
                  {settings.musicDirectory && (
                    <button type="button" onClick={() => update({ musicDirectory: '' })} className="btn-secondary px-2.5 py-1 text-xs">
                      恢复默认
                    </button>
                  )}
                </div>
                <p className="text-xs text-fg-faint">扫描所选目录下的 mp3 / wav / ogg / m4a / flac / aac / opus 文件，不含子目录；找到音乐后播放器显示在侧栏底部。</p>
              </Section>
            </>
          )}

          {tab === 'accounts' && (
            <AccountsSettings
              isActive={isOpen && tab === 'accounts'}
              accounts={settings.accounts}
              onChange={(accounts) => update({ accounts })}
              onLogin={onLoginAccount}
            />
          )}

          {tab === 'time' && (
            <Section title="顶栏时钟" hint="在系统时间上增加的小时数">
              <div className={row}>
                <span>
                  <span className="block">增加小时数</span>
                  <span className="block text-xs text-fg-faint">默认 0，显示系统时间；可填 -24 到 24 的整数</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => setClockOffset(clockOffset - 1)} disabled={clockOffset <= -24} className="icon-btn border border-line-strong bg-canvas" title="减少 1 小时" aria-label="减少 1 小时">
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    min={-24}
                    max={24}
                    step={1}
                    aria-label="顶栏时钟增加的小时数"
                    value={clockOffset}
                    onChange={(e) => setClockOffset(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="input w-16 select-text text-center font-mono"
                  />
                  <button type="button" onClick={() => setClockOffset(clockOffset + 1)} disabled={clockOffset >= 24} className="icon-btn border border-line-strong bg-canvas" title="增加 1 小时" aria-label="增加 1 小时">
                    <Plus size={13} />
                  </button>
                  <span className="text-xs text-fg-faint">小时</span>
                </span>
              </div>
              <p className="text-xs text-fg-faint">
                当前顶栏显示：{new Date(Date.now() + clockOffset * 3600_000).toLocaleString('zh-CN', { hour12: false })}
                {clockOffset !== 0 && `（系统时间 ${clockOffset > 0 ? '+' : ''}${clockOffset} 小时）`}
              </p>
            </Section>
          )}

          {tab === 'shortcuts' && SHORTCUTS.map((group) => (
            <Section key={group.title} title={group.title}>
              <dl className="divide-y divide-line overflow-hidden rounded-md border border-line">
                {group.items.map(([keys, desc]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 bg-muted px-3 py-2">
                    <dt className="text-ui text-fg-muted">{desc}</dt>
                    <dd className="shrink-0 rounded border border-line-strong bg-canvas px-1.5 py-0.5 font-mono text-xs text-fg-subtle">{keys}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          ))}
        </div>
      </div>
    </Modal>
  );
};
