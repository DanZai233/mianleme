import React from 'react';
import { X, Moon, Sun, Globe, Download, Upload, Bell, ChevronRight, Check } from 'lucide-react';
import { Language } from '../types';
import { useI18n } from '../i18n';

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
}

export function SettingsModal({
  isOpen, onClose, lang, setLang, darkMode, setDarkMode,
  notificationsEnabled, requestNotifications, onExport, onImport
}: Props) {
  const t = useI18n(lang);

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

        </div>
      </div>
    </div>
  );
}
