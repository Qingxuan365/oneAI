import React from 'react';
import { X, Type, Monitor, RotateCcw, Minus, Plus } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetDefault: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetDefault,
}) => {
  if (!isOpen) return null;

  const handleFontSizeChange = (size: number) => {
    const clamped = Math.max(12, Math.min(24, size));
    onUpdateSettings({ ...settings, terminalFontSize: clamped });
  };

  const handleLineHeightChange = (lh: number) => {
    onUpdateSettings({ ...settings, terminalLineHeight: lh });
  };

  const handleUiScaleChange = (scale: AppSettings['uiScale']) => {
    onUpdateSettings({ ...settings, uiScale: scale });
  };

  const FONT_PRESETS = [13, 14, 15, 16, 18, 20];
  const LINE_HEIGHTS = [
    { label: '紧凑 (1.2)', val: 1.2 },
    { label: '标准 (1.3)', val: 1.3 },
    { label: '宽松 (1.45)', val: 1.45 },
    { label: '大行高 (1.6)', val: 1.6 },
  ];

  const UI_SCALES: { id: AppSettings['uiScale']; name: string; desc: string; pct: string }[] = [
    { id: 'compact', name: '紧凑', desc: '信息密集', pct: '90%' },
    { id: 'standard', name: '标准', desc: '经典尺寸', pct: '100%' },
    { id: 'comfortable', name: '舒适 (推荐)', desc: '清晰护眼', pct: '110%' },
    { id: 'large', name: '大号', desc: '适合 2K/4K', pct: '125%' },
  ];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div
        className="bg-[#141824] border border-[#262f42] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="h-12 px-5 border-b border-[#232b3d] flex items-center justify-between bg-[#11141e]">
          <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
            <Type size={16} className="text-emerald-400" />
            <span>外观与字体大小设置</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-[#202738] rounded-md transition-colors"
            title="关闭设置"
          >
            <X size={16} />
          </button>
        </div>

        {/* 核心设置内容 */}
        <div className="p-5 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* 1. 终端代码字体大小 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                <span>终端视窗字体大小</span>
                <span className="text-[11px] font-normal text-slate-500">（Ctrl + / - 亦可快捷缩放）</span>
              </label>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                {settings.terminalFontSize}px
              </span>
            </div>

            {/* 滑块与加减步进 */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleFontSizeChange(settings.terminalFontSize - 1)}
                className="p-1.5 rounded bg-[#1c2232] hover:bg-[#283248] text-slate-300 border border-[#2b364e] transition-colors"
                title="缩小字体"
              >
                <Minus size={13} />
              </button>
              <input
                type="range"
                min="12"
                max="24"
                step="1"
                value={settings.terminalFontSize}
                onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
                className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-[#202738] rounded-lg"
              />
              <button
                onClick={() => handleFontSizeChange(settings.terminalFontSize + 1)}
                className="p-1.5 rounded bg-[#1c2232] hover:bg-[#283248] text-slate-300 border border-[#2b364e] transition-colors"
                title="放大字体"
              >
                <Plus size={13} />
              </button>
            </div>

            {/* 常用预设快捷按钮 */}
            <div className="flex items-center space-x-1.5 pt-1">
              {FONT_PRESETS.map((size) => (
                <button
                  key={size}
                  onClick={() => handleFontSizeChange(size)}
                  className={`flex-1 py-1 rounded text-xs font-mono transition-colors border ${
                    settings.terminalFontSize === size
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
                      : 'bg-[#181d2a] border-[#242c3f] text-slate-400 hover:text-slate-200 hover:bg-[#202738]'
                  }`}
                >
                  {size}px
                </button>
              ))}
            </div>

            {/* 实时字体预览框 */}
            <div className="p-3 bg-[#0c0e14] rounded-lg border border-[#1e2536] overflow-hidden">
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">
                代码实时效果预览
              </div>
              <div
                style={{
                  fontSize: `${settings.terminalFontSize}px`,
                  lineHeight: settings.terminalLineHeight,
                  fontFamily: 'Consolas, "Fira Code", monospace',
                }}
                className="text-slate-300 font-mono select-text"
              >
                <span className="text-emerald-400">&gt;</span> const ai = new CLI(&apos;Kimi&apos;);
                <br />
                <span className="text-slate-500">&gt;</span> <span className="text-amber-300">await</span> ai.complete(&apos;Hello OneDesktop&apos;);
              </div>
            </div>
          </div>

          {/* 2. 终端行高 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-200">
              终端排版行高
            </label>
            <div className="grid grid-cols-4 gap-2">
              {LINE_HEIGHTS.map((item) => (
                <button
                  key={item.val}
                  onClick={() => handleLineHeightChange(item.val)}
                  className={`py-1.5 px-2 rounded text-xs transition-colors border text-center ${
                    Math.abs(settings.terminalLineHeight - item.val) < 0.05
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-medium'
                      : 'bg-[#181d2a] border-[#242c3f] text-slate-400 hover:text-slate-200 hover:bg-[#202738]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. 全局 UI 界面缩放 */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
              <Monitor size={14} className="text-slate-400" />
              <span>界面全局字体与元素缩放</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {UI_SCALES.map((scale) => (
                <div
                  key={scale.id}
                  onClick={() => handleUiScaleChange(scale.id)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                    settings.uiScale === scale.id
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                      : 'bg-[#181d2a] border-[#242c3f] text-slate-400 hover:text-slate-200 hover:bg-[#1e2536]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-medium">{scale.name}</div>
                    <div className="text-[10px] text-slate-500">{scale.desc}</div>
                  </div>
                  <span className={`text-xs font-mono font-bold ${settings.uiScale === scale.id ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {scale.pct}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="h-14 px-5 border-t border-[#232b3d] flex items-center justify-between bg-[#11141e]">
          <button
            onClick={onResetDefault}
            className="flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            title="还原为出厂默认设置"
          >
            <RotateCcw size={12} />
            <span>恢复默认 (15px / 舒适)</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium text-xs shadow-lg shadow-emerald-500/20 transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
