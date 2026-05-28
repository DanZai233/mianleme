import React, { useState } from 'react';
import { X, Moon, Sun, Globe, Download, Upload, Bell, ChevronRight, Check, Brain } from 'lucide-react';
import { Language, ModelConfig, ModelProvider } from '../types';
import { useI18n } from '../i18n';
import toast from 'react-hot-toast';

const PROVIDER_DEFAULTS: Record<ModelProvider, { modelName: string; apiBase?: string; apiKeyPlaceholder: string; modelPlaceholder: string; apiBasePlaceholder: string }> = {
  google: {
    modelName: 'gemini-2.5-flash',
    apiKeyPlaceholder: 'AIza...',
    modelPlaceholder: 'gemini-2.5-flash',
    apiBasePlaceholder: '',
  },
  volcengine: {
    modelName: '',
    apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKeyPlaceholder: 'ARK_API_KEY',
    modelPlaceholder: 'ep-... / doubao-seed-1-6-251015',
    apiBasePlaceholder: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  openai: {
    modelName: 'gpt-4o-mini',
    apiKeyPlaceholder: 'sk-...',
    modelPlaceholder: 'gpt-4o-mini',
    apiBasePlaceholder: 'https://api.openai.com/v1',
  },
  anthropic: {
    modelName: 'claude-3-5-sonnet-latest',
    apiKeyPlaceholder: 'sk-ant-...',
    modelPlaceholder: 'claude-3-5-sonnet-latest',
    apiBasePlaceholder: 'https://api.anthropic.com',
  },
};

const KNOWN_DEFAULT_MODELS = new Set(Object.values(PROVIDER_DEFAULTS).map((item) => item.modelName).filter(Boolean));
const KNOWN_DEFAULT_BASES = new Set(Object.values(PROVIDER_DEFAULTS).map((item) => item.apiBase).filter(Boolean));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  setLang: (l: Language) => void;
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  notificationsEnabled: boolean;
  requestNotifications: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  modelConfig: ModelConfig;
  setModelConfig: (config: Partial<ModelConfig>) => void;
}

export function SettingsModal({
  isOpen, onClose, lang, setLang, darkMode, setDarkMode,
  notificationsEnabled, requestNotifications, onExport, onImport,
  modelConfig, setModelConfig
}: Props) {
  const t = useI18n(lang);
  const [localModelConfig, setLocalModelConfig] = useState<ModelConfig>(modelConfig);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const currentProviderDefaults = PROVIDER_DEFAULTS[localModelConfig.provider];

  const handleSaveModelConfig = () => {
    setModelConfig(localModelConfig);
    toast.success(t.modelConfigSaved);
    setShowAiSettings(false);
  };

  const handleProviderChange = (provider: ModelProvider) => {
    setLocalModelConfig((prev) => {
      const defaults = PROVIDER_DEFAULTS[provider];
      const shouldReplaceModel = !prev.modelName || KNOWN_DEFAULT_MODELS.has(prev.modelName);
      const shouldReplaceApiBase = !prev.apiBase || KNOWN_DEFAULT_BASES.has(prev.apiBase);

      return {
        ...prev,
        provider,
        modelName: shouldReplaceModel ? defaults.modelName : prev.modelName,
        apiBase: shouldReplaceApiBase ? defaults.apiBase : prev.apiBase,
      };
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 animate-fade-in-native" onClick={onClose} />
      
      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-[#F2F2F7] dark:bg-black sm:rounded-3xl rounded-t-3xl min-h-[60vh] max-h-[90vh] overflow-y-auto animate-slide-up-native flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="sticky top-0 bg-[#F2F2F7]/90 dark:bg-black/90 backdrop-blur-xl z-10 px-4 py-4 flex justify-between items-center border-b border-gray-200/50 dark:border-white/10">
          <div className="w-10"></div>
          <h2 className="text-lg font-semibold text-black dark:text-white">{t.settings}</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-gray-200/50 hover:bg-gray-200 dark:bg-[#1C1C1E] dark:hover:bg-[#2C2C2E] rounded-full transition-colors">
            <X size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 pb-20">
          
          {/* General Group */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 ml-4 mb-2">{t.general}</h3>
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl overflow-hidden shadow-sm dark:shadow-none text-[15px]">
              
              {/* Language Row */}
              <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="w-full flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white"><Globe size={18} /></div>
                  <span className="font-medium text-black dark:text-white">{t.language}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <span>{lang === 'zh' ? '简体中文' : 'English'}</span>
                  <ChevronRight size={18} />
                </div>
              </button>

              {/* Notifications Row */}
              <button onClick={requestNotifications} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${notificationsEnabled ? 'bg-emerald-500' : 'bg-red-500'}`}>
                    <Bell size={18} />
                  </div>
                  <span className="font-medium text-black dark:text-white">{t.notifications}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  {notificationsEnabled ? <span className="text-emerald-500"><Check size={18} /></span> : <ChevronRight size={18} />}
                </div>
              </button>

            </div>
          </div>

          {/* Appearance Group */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 ml-4 mb-2">{t.appearance}</h3>
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl overflow-hidden shadow-sm dark:shadow-none text-[15px]">
              
              <button onClick={() => setDarkMode(!darkMode)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
                    {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                  </div>
                  <span className="font-medium text-black dark:text-white">{darkMode ? t.darkMode : t.lightMode}</span>
                </div>
                <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 dark:bg-emerald-500 transition-colors">
                   <div className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </button>

            </div>
          </div>

          {/* Data Group */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 ml-4 mb-2">{t.data}</h3>
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl overflow-hidden shadow-sm dark:shadow-none text-[15px]">
              
              <button onClick={onExport} className="w-full flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-500 flex items-center justify-center text-white"><Download size={18} /></div>
                  <span className="font-medium text-black dark:text-white">{t.exportData}</span>
                </div>
                <ChevronRight size={18} className="text-gray-400" />
              </button>

              <label className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center text-white"><Upload size={18} /></div>
                  <span className="font-medium text-black dark:text-white">{t.importData}</span>
                </div>
                <ChevronRight size={18} className="text-gray-400" />
                <input type="file" accept=".json" className="hidden" onChange={onImport} />
              </label>

            </div>
          </div>

          {/* AI Model Settings Group */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 ml-4 mb-2">{t.aiModelSettings}</h3>
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl overflow-hidden shadow-sm dark:shadow-none text-[15px]">
              
              {!showAiSettings ? (
                <button onClick={() => {
                  setLocalModelConfig(modelConfig);
                  setShowAiSettings(true);
                }} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-white"><Brain size={18} /></div>
                    <span className="font-medium text-black dark:text-white">{t.aiModelSettings}</span>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
              ) : (
                <div className="p-4 space-y-4">
                  {/* Provider Select */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.modelProvider}</label>
                    <select
                      value={localModelConfig.provider}
                      onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="google">{t.google}</option>
                      <option value="volcengine">{t.volcengine}</option>
                      <option value="openai">{t.openai}</option>
                      <option value="anthropic">{t.anthropic}</option>
                    </select>
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.apiKey}</label>
                    <input
                      type="password"
                      value={localModelConfig.apiKey}
                      onChange={(e) => setLocalModelConfig({ ...localModelConfig, apiKey: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder={currentProviderDefaults.apiKeyPlaceholder}
                    />
                  </div>

                  {/* Model Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.modelName}</label>
                    <input
                      type="text"
                      value={localModelConfig.modelName}
                      onChange={(e) => setLocalModelConfig({ ...localModelConfig, modelName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder={currentProviderDefaults.modelPlaceholder}
                    />
                  </div>

                  {/* API Base */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.apiBase}</label>
                    <input
                      type="text"
                      value={localModelConfig.apiBase || ''}
                      onChange={(e) => setLocalModelConfig({ ...localModelConfig, apiBase: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-[#2C2C2E] text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder={currentProviderDefaults.apiBasePlaceholder}
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowAiSettings(false)}
                      className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={handleSaveModelConfig}
                      className="flex-1 px-4 py-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors"
                    >
                      {t.saveModelConfig}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
