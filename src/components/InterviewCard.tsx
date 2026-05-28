import React, { useState } from 'react';
import { Interview, Language } from '../types';
import { useI18n } from '../i18n';
import { addToSystemCalendar, createGoogleCalendarUrl } from '../utils';
import { Calendar, Trash2, Edit2, MapPin, Clock, Share, CheckCircle2, ExternalLink, Download } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Props {
  interview: Interview;
  lang: Language;
  timezone: string;
  onEdit: (i: Interview) => void;
  onComplete?: (i: Interview) => void;
  onDelete: (id: string) => void;
  hasConflict?: boolean;
}

export function InterviewCard({ interview, lang, timezone, onEdit, onComplete, onDelete, hasConflict = false }: Props) {
  const t = useI18n(lang);
  const [showCalendarOptions, setShowCalendarOptions] = useState(false);
  
  const d = new Date(interview.date);
  const formattedTime = isNaN(d.getTime()) ? '--:--' : format(d, 'HH:mm');
  const formattedDate = isNaN(d.getTime()) ? '-' : format(d, 'EEE, MMM d');
  const calendarEvent = {
    title: `${interview.company} - ${interview.role} Interview`,
    description: interview.notes || 'Interview Notes',
    location: interview.link || interview.platform || 'Online',
    dateStr: interview.date,
    reminderHours: interview.reminderHours,
    durationMinutes: interview.durationMinutes || 60,
    timezone,
  };

  const handleShare = () => {
    const text = t.shareFormat
      .replace('{company}', interview.company)
      .replace('{role}', interview.role)
      .replace('{time}', isNaN(d.getTime()) ? interview.date : format(d, 'yyyy-MM-dd HH:mm'))
      .replace('{link}', interview.link || interview.platform || 'None');
      
    if (navigator.share) {
      navigator.share({
        title: `${interview.company} Interview`,
        text: text
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success(t.shareSuccess);
    }
  };

  const handleGoogleCalendar = () => {
    try {
      window.open(createGoogleCalendarUrl(calendarEvent), '_blank', 'noopener,noreferrer');
      setShowCalendarOptions(false);
    } catch {
      toast.error(t.invalidCalendarDate);
    }
  };

  const handleSystemCalendar = async () => {
    try {
      const result = await addToSystemCalendar(calendarEvent);
      if (result === 'downloaded') {
        toast.success(t.calendarFileDownloaded);
      }
      setShowCalendarOptions(false);
    } catch {
      toast.error(t.invalidCalendarDate);
    }
  };

  return (
    <div className={`ios-card flex flex-col relative overflow-hidden group ${hasConflict ? 'ring-2 ring-red-500/50' : ''}`}>
      {/* Decorative left bar for status */}
      <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${interview.status === 'completed' ? 'bg-emerald-400' : interview.status === 'archived' ? 'bg-gray-400' : hasConflict ? 'bg-red-500' : 'bg-blue-500'}`} />
      
      <div className="p-5 flex gap-4 items-start relative z-10">
        
        {/* Time Column */}
        <div className="w-[60px] shrink-0 pt-1 flex flex-col items-center">
          <span className="text-xl font-bold text-black dark:text-white tracking-tight">{formattedTime}</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase mt-1">{formattedDate}</span>
          {interview.status === 'upcoming' && hasConflict && (
            <span className="mt-2 text-[10px] font-bold text-red-500 bg-red-100 dark:bg-red-500/20 px-2 py-0.5 rounded-md">{t.conflict}</span>
          )}
        </div>

        {/* Content Column */}
        <div className="flex-1 border-l border-gray-100 dark:border-white/5 pl-4 pb-1">
          <div className="flex justify-between items-start gap-2 mb-1">
            <h3 className="text-lg font-bold text-black dark:text-white leading-tight break-words pr-2">
              {interview.role}
            </h3>
            {/* Quick Actions (revealed conditionally or grouped) */}
            <div className="flex gap-2 shrink-0">
               {interview.status === 'upcoming' && onComplete && (
                 <button onClick={() => onComplete(interview)} title={t.completed} className="text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors"><CheckCircle2 size={14}/></button>
               )}
               <button onClick={handleShare} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors"><Share size={14}/></button>
               <button onClick={() => onEdit(interview)} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors"><Edit2 size={14}/></button>
               <button onClick={() => onDelete(interview.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors"><Trash2 size={14}/></button>
            </div>
          </div>
          
          <p className="text-[14px] font-semibold text-blue-600 dark:text-blue-400 mb-2">
            {interview.company}
          </p>
          
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
            {interview.platform && (
              <span className="flex items-center gap-1"><MapPin size={12}/> {interview.platform} {interview.link && <a href={interview.link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">(Link)</a>}</span>
            )}
            {interview.reminderHours > 0 && (
              <span className="flex items-center gap-1"><Clock size={12}/> {interview.reminderHours}h {lang === 'zh' ? '前提醒' : 'before'}</span>
            )}
          </div>

          {interview.notes && (
             <p className="text-[13px] text-gray-500 dark:text-gray-400 bg-[#F2F2F7] dark:bg-black/50 p-3 rounded-xl mb-3 line-clamp-3 leading-relaxed">
               {interview.notes}
             </p>
          )}

          {/* Footer controls */}
          <div className="flex justify-between items-center mt-1">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
               interview.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
               interview.status === 'archived' ? 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
               'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
            }`}>
              {t[interview.status]}
            </span>
            
            <button 
              onClick={() => setShowCalendarOptions((open) => !open)}
              className="text-[12px] font-semibold text-blue-500 flex items-center gap-1 hover:opacity-80 active:opacity-60 transition-opacity"
              aria-expanded={showCalendarOptions}
            >
              <Calendar size={14} /> {t.addToCalendar}
            </button>
          </div>

          {showCalendarOptions && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={handleGoogleCalendar}
                className="min-h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-[12px] font-semibold text-blue-600 dark:text-blue-300 flex items-center justify-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
              >
                <ExternalLink size={14} /> {t.googleCalendar}
              </button>
              <button
                onClick={handleSystemCalendar}
                className="min-h-9 rounded-xl bg-gray-100 dark:bg-white/10 px-3 py-2 text-[12px] font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
              >
                <Download size={14} /> {t.appleCalendar}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
