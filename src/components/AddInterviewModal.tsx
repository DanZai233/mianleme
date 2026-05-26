import React, { useState, useRef, useEffect } from 'react';
import { Interview, Language, ModelConfig } from '../types';
import { useI18n } from '../i18n';
import { v4 as uuidv4 } from 'uuid';
import { X, Sparkles, Image as ImageIcon, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  initialData?: Interview | null;
  lang: Language;
  onClose: () => void;
  onSave: (i: Interview) => void;
  existingInterviews: Interview[];
  modelConfig: ModelConfig;
}

export function AddInterviewModal({ initialData, lang, onClose, onSave, existingInterviews, modelConfig }: Props) {
  const t = useI18n(lang);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<Interview>(
    initialData || {
      id: uuidv4(),
      company: '',
      role: '',
      date: new Date().toISOString().slice(0, 16),
      platform: '',
      link: '',
      notes: '',
      status: 'upcoming',
      reminderHours: 1,
      durationMinutes: 60,
    }
  );
  
  const [extractMode, setExtractMode] = useState(false);
  const [extractText, setExtractText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  // Focus lock effect avoiding background jumps
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const hasConflict = () => {
    if (!formData.date || formData.status !== 'upcoming') return false;
    const currentStart = new Date(formData.date).getTime();
    if (isNaN(currentStart)) return false;
    const duration = formData.durationMinutes || 60;
    const currentEnd = currentStart + duration * 60 * 1000;
    const buffer = 30 * 60 * 1000; // 30 mins
    
    return existingInterviews.some(i => {
      if (i.id === formData.id || i.status !== 'upcoming') return false;
      const start = new Date(i.date).getTime();
      if (isNaN(start)) return false;
      const iDuration = i.durationMinutes || 60;
      const end = start + iDuration * 60 * 1000;
      return (currentStart - buffer < end && currentEnd + buffer > start);
    });
  };

  const handleExtract = async (text: string, imageBase64?: string) => {
    setIsExtracting(true);
    try {
      const res = await fetch('/api/parse-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, imageBase64, modelConfig })
      });
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Quota Exceeded');
        }
        throw new Error('Extraction failed');
      }
      const data = await res.json();
      
      setFormData(prev => ({
        ...prev,
        company: data.company || prev.company,
        role: data.role || prev.role,
        date: data.date ? data.date.slice(0, 16) : prev.date,
        platform: data.platform || prev.platform,
        link: data.link || prev.link,
        notes: data.notes || prev.notes,
        durationMinutes: data.durationMinutes || prev.durationMinutes,
      }));
      toast.success(t.extractedSuccess);
      setExtractMode(false);
    } catch (err: any) {
      if (err.message === 'Quota Exceeded') {
        toast.error(t.quotaExceeded || "AI Quota Exceeded. Please try again later or add manually.");
      } else {
        toast.error("Extraction failed. Please try manually.");
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const onImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handleExtract('', ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 animate-fade-in-native" onClick={onClose} />
      
      <div className="relative w-full max-w-xl bg-white dark:bg-[#1C1C1E] sm:rounded-3xl rounded-t-[32px] h-[90vh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl animate-slide-up-native">
        
        {/* Header Bar */}
        <div className="flex-none p-4 pb-2 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl sm:rounded-t-3xl rounded-t-[32px] z-10">
          <div className="w-20">
            <button onClick={onClose} className="px-2 py-1 text-blue-500 font-medium">
              {t.cancel}
            </button>
          </div>
          <h2 className="text-lg font-bold text-black dark:text-white">
            {initialData ? t.edit : t.addInterview}
          </h2>
          <div className="w-20 flex justify-end">
            <button 
               onClick={() => {
                 if (formData.company && formData.role) onSave(formData);
                 else toast.error("Company and Role are required");
               }}
               className="px-2 py-1 text-blue-500 font-bold"
            >
              {t.save}
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-6">
          
          {!initialData && (
            <div className="flex justify-center mb-2">
              <button 
                onClick={() => setExtractMode(!extractMode)}
                className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-full font-medium active:scale-95 transition-transform"
              >
                <Sparkles size={16} /> {t.smartExtract}
              </button>
            </div>
          )}

          {extractMode && (
            <div className="bg-[#F2F2F7] dark:bg-black p-4 rounded-2xl border border-blue-200/50 dark:border-blue-500/20 space-y-3 animate-fade-in-native">
              <textarea 
                className="w-full bg-white dark:bg-[#1C1C1E] text-sm p-3 rounded-xl border border-transparent focus:border-blue-400 outline-none dark:text-white h-24 resize-none shadow-sm dark:shadow-none"
                placeholder={t.extractPlaceholder}
                value={extractText}
                onChange={e => setExtractText(e.target.value)}
              />
              <div className="flex gap-2">
                <button 
                  disabled={isExtracting || !extractText.trim()}
                  onClick={() => handleExtract(extractText)}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
                >
                  {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isExtracting ? t.extracting : "Extract Text"}
                </button>
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={onImageUpload} />
                <button 
                  disabled={isExtracting}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 bg-white dark:bg-[#1C1C1E] disabled:opacity-50 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center border border-gray-200 dark:border-white/10 shadow-sm"
                >
                  <ImageIcon size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Form Native IOS Inputs */}
          <div className="bg-[#F2F2F7] dark:bg-black p-4 rounded-3xl space-y-4">
            
            <div className="relative">
              <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.company}</label>
              <input type="text" required value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none font-medium" />
            </div>
            
            <div className="relative">
              <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.role}</label>
              <input type="text" required value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none font-medium" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="relative sm:col-span-2">
                <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.dateTime}</label>
                <input type="datetime-local" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none appearance-none" />
              </div>
              <div className="relative">
                 <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.duration}</label>
                 <input type="number" min="1" value={formData.durationMinutes} onChange={e => setFormData({...formData, durationMinutes: Number(e.target.value)})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none" />
              </div>
            </div>

            {hasConflict() && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl text-sm font-medium animate-fade-in-native">
                {t.conflictNotice}
              </div>
            )}

            <div className="relative">
                 <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.reminderHours}</label>
                 <input type="number" min="0" value={formData.reminderHours} onChange={e => setFormData({...formData, reminderHours: Number(e.target.value)})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none" />
            </div>

            <div className="relative">
              <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.platform}</label>
              <input type="text" value={formData.platform} onChange={e => setFormData({...formData, platform: e.target.value})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none" />
            </div>
            
            <div className="relative">
              <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.link}</label>
              <input type="text" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none" />
            </div>

            <div className="relative">
               <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.status}</label>
               <div className="relative">
                 <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as Interview['status']})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none appearance-none">
                    <option value="upcoming">{t.upcoming}</option>
                    <option value="completed">{t.completed}</option>
                    <option value="archived">{t.archived}</option>
                 </select>
               </div>
            </div>

            <div className="relative">
              <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.notes}</label>
              <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none h-28 resize-none" />
            </div>

          </div>

          <div className="h-10"></div> {/* Bottom spacer */}
        </div>
      </div>
    </div>
  );
}
