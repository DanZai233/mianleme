import React, { useState } from 'react';
import { Interview, Language } from '../types';
import { useI18n } from '../i18n';
import { addToSystemCalendar, createGoogleCalendarUrl } from '../utils';
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  ExternalLink,
  Hash,
  Link as LinkIcon,
  MapPin,
  Share,
  Trash2,
  X,
} from 'lucide-react';
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

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function stopEvent(event: React.MouseEvent) {
  event.stopPropagation();
}

export function InterviewCard({ interview, lang, timezone, onEdit, onComplete, onDelete, hasConflict = false }: Props) {
  const t = useI18n(lang);
  const [showCalendarOptions, setShowCalendarOptions] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const d = new Date(interview.date);
  const hasValidDate = !isNaN(d.getTime());
  const formattedTime = hasValidDate ? format(d, 'HH:mm') : '--:--';
  const formattedDate = hasValidDate ? format(d, 'EEE, MMM d') : '-';
  const fullDate = hasValidDate ? format(d, 'yyyy-MM-dd HH:mm') : interview.date;
  const description = [
    interview.notes,
    interview.link ? `${t.link}: ${interview.link}` : '',
    interview.meetingId ? `${t.meetingId}: ${interview.meetingId}` : '',
  ].filter(Boolean).join('\n') || 'Interview Notes';

  const calendarEvent = {
    title: `${interview.company} - ${interview.role}`,
    description,
    location: interview.link || interview.platform || 'Online',
    dateStr: interview.date,
    reminderHours: interview.reminderHours,
    durationMinutes: interview.durationMinutes || 60,
    timezone,
  };

  const handleOpenDetails = () => {
    setIsDetailsOpen(true);
    setShowCalendarOptions(false);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenDetails();
    }
  };

  const handleShare = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    const text = [
      `${lang === 'zh' ? '面试' : 'Interview'}: ${interview.company} - ${interview.role}`,
      `${lang === 'zh' ? '时间' : 'Time'}: ${fullDate}`,
      interview.link ? `${t.link}: ${interview.link}` : '',
      interview.meetingId ? `${t.meetingId}: ${interview.meetingId}` : '',
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      navigator.share({
        title: `${interview.company} Interview`,
        text,
      }).catch(() => {});
    } else {
      copyToClipboard(text);
      toast.success(t.shareSuccess);
    }
  };

  const handleCopyMeetingId = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!interview.meetingId) return;
    await copyToClipboard(interview.meetingId);
    toast.success(t.meetingIdCopied);
  };

  const handleGoogleCalendar = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      window.open(createGoogleCalendarUrl(calendarEvent), '_blank', 'noopener,noreferrer');
      setShowCalendarOptions(false);
    } catch {
      toast.error(t.invalidCalendarDate);
    }
  };

  const handleSystemCalendar = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      if (!hasValidDate) throw new Error('Invalid calendar date');
      toast.success(t.calendarOpened);
      await addToSystemCalendar(calendarEvent);
      setShowCalendarOptions(false);
    } catch {
      toast.error(t.invalidCalendarDate);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${t.viewDetails}: ${interview.company} ${interview.role}`}
        onClick={handleOpenDetails}
        onKeyDown={handleCardKeyDown}
        className={`ios-card flex flex-col relative overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 active:scale-[0.99] transition-transform ${hasConflict ? 'ring-2 ring-red-500/50' : ''}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${interview.status === 'completed' ? 'bg-emerald-400' : interview.status === 'archived' ? 'bg-gray-400' : hasConflict ? 'bg-red-500' : 'bg-blue-500'}`} />

        <div className="p-5 flex gap-4 items-start relative z-10">
          <div className="w-[60px] shrink-0 pt-1 flex flex-col items-center">
            <span className="text-xl font-bold text-black dark:text-white tracking-tight">{formattedTime}</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase mt-1">{formattedDate}</span>
            {interview.status === 'upcoming' && hasConflict && (
              <span className="mt-2 text-[10px] font-bold text-red-500 bg-red-100 dark:bg-red-500/20 px-2 py-0.5 rounded-md">{t.conflict}</span>
            )}
          </div>

          <div className="flex-1 border-l border-gray-100 dark:border-white/5 pl-4 pb-1 min-w-0">
            <div className="flex justify-between items-start gap-2 mb-1">
              <h3 className="text-lg font-bold text-black dark:text-white leading-tight break-words pr-2">
                {interview.role}
              </h3>
              <div className="flex gap-2 shrink-0" onClick={stopEvent}>
                {interview.status === 'upcoming' && onComplete && (
                  <button onClick={() => onComplete(interview)} title={t.completed} className="text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors"><CheckCircle2 size={14}/></button>
                )}
                <button onClick={handleShare} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors" title={t.share}><Share size={14}/></button>
                <button onClick={() => onEdit(interview)} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors" title={t.edit}><Edit2 size={14}/></button>
                <button onClick={() => onDelete(interview.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 bg-gray-50 dark:bg-white/5 rounded-full transition-colors" title={t.delete}><Trash2 size={14}/></button>
              </div>
            </div>

            <p className="text-[14px] font-semibold text-blue-600 dark:text-blue-400 mb-2">
              {interview.company}
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
              {interview.platform && (
                <span className="flex items-center gap-1 min-w-0">
                  <MapPin size={12} className="shrink-0"/> {interview.platform}
                  {interview.link && (
                    <a href={interview.link} target="_blank" rel="noreferrer" onClick={stopEvent} className="text-blue-500 hover:underline shrink-0">
                      ({t.openMeetingLink})
                    </a>
                  )}
                </span>
              )}
              {interview.reminderHours > 0 && (
                <span className="flex items-center gap-1"><Clock size={12}/> {interview.reminderHours}h {lang === 'zh' ? '前提醒' : 'before'}</span>
              )}
            </div>

            {interview.meetingId && (
              <button
                onClick={handleCopyMeetingId}
                className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-300 active:scale-95 transition-transform"
                title={t.copyMeetingId}
              >
                <Hash size={13} className="shrink-0" />
                <span className="truncate">{interview.meetingId}</span>
                <Copy size={13} className="shrink-0" />
              </button>
            )}

            {interview.notes && (
              <p className="text-[13px] text-gray-500 dark:text-gray-400 bg-[#F2F2F7] dark:bg-black/50 p-3 rounded-xl mb-3 line-clamp-3 leading-relaxed">
                {interview.notes}
              </p>
            )}

            <div className="flex justify-between items-center mt-1">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                interview.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                interview.status === 'archived' ? 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
                'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
              }`}>
                {t[interview.status]}
              </span>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setShowCalendarOptions((open) => !open);
                }}
                className="text-[12px] font-semibold text-blue-500 flex items-center gap-1 hover:opacity-80 active:opacity-60 transition-opacity"
                aria-expanded={showCalendarOptions}
              >
                <Calendar size={14} /> {t.addToCalendar}
              </button>
            </div>

            {showCalendarOptions && (
              <div className="mt-3 grid grid-cols-2 gap-2" onClick={stopEvent}>
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
                  <CalendarPlus size={14} /> {t.appleCalendar}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isDetailsOpen && (
        <InterviewDetailsModal
          interview={interview}
          lang={lang}
          fullDate={fullDate}
          calendarOptions={{
            onGoogleCalendar: handleGoogleCalendar,
            onSystemCalendar: handleSystemCalendar,
          }}
          onClose={() => setIsDetailsOpen(false)}
          onCopyMeetingId={handleCopyMeetingId}
          onEdit={() => {
            setIsDetailsOpen(false);
            onEdit(interview);
          }}
          onShare={handleShare}
        />
      )}
    </>
  );
}

interface DetailsProps {
  interview: Interview;
  lang: Language;
  fullDate: string;
  calendarOptions: {
    onGoogleCalendar: (event?: React.MouseEvent) => void;
    onSystemCalendar: (event?: React.MouseEvent) => void;
  };
  onClose: () => void;
  onCopyMeetingId: (event?: React.MouseEvent) => void;
  onEdit: () => void;
  onShare: (event?: React.MouseEvent) => void;
}

function InterviewDetailsModal({ interview, lang, fullDate, calendarOptions, onClose, onCopyMeetingId, onEdit, onShare }: DetailsProps) {
  const t = useI18n(lang);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 animate-fade-in-native" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t.details}
        onClick={stopEvent}
        className="relative z-10 w-full max-w-lg max-h-[92dvh] bg-white dark:bg-[#1C1C1E] sm:rounded-3xl rounded-t-[32px] shadow-2xl overflow-y-auto hide-scrollbar animate-slide-up-native"
      >
        <div className="sticky top-0 z-10 bg-white/85 dark:bg-[#1C1C1E]/85 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 px-5 py-4 flex items-center justify-between sm:rounded-t-3xl rounded-t-[32px]">
          <div className="min-w-0 pr-4">
            <p className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 truncate">{interview.company}</p>
            <h2 className="text-lg font-bold text-black dark:text-white truncate">{interview.role}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-300 flex items-center justify-center shrink-0" aria-label={t.close}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <DetailRow icon={<Clock size={17} />} label={t.dateTime} value={fullDate} />
          <DetailRow icon={<Calendar size={17} />} label={t.duration} value={`${interview.durationMinutes || 60} ${lang === 'zh' ? '分钟' : 'min'}`} />
          {interview.platform && <DetailRow icon={<MapPin size={17} />} label={t.platform} value={interview.platform} />}

          {interview.link && (
            <div className="rounded-2xl bg-[#F2F2F7] dark:bg-black/40 p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-gray-500 mb-2">
                <LinkIcon size={15} /> {t.link}
              </div>
              <a href={interview.link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 dark:text-blue-400 break-all inline-flex items-center gap-1">
                {interview.link}
                <ExternalLink size={14} className="shrink-0" />
              </a>
            </div>
          )}

          {interview.meetingId && (
            <div className="rounded-2xl bg-blue-50 dark:bg-blue-500/10 p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-blue-600 dark:text-blue-300 mb-2">
                <Hash size={15} /> {t.meetingId}
              </div>
              <button onClick={onCopyMeetingId} className="w-full min-h-11 rounded-xl bg-white dark:bg-[#1C1C1E] px-3 py-2 flex items-center justify-between gap-3 text-left text-sm font-bold text-black dark:text-white shadow-sm dark:shadow-none active:scale-[0.99] transition-transform">
                <span className="break-all">{interview.meetingId}</span>
                <Copy size={16} className="text-blue-500 shrink-0" />
              </button>
            </div>
          )}

          {interview.notes && (
            <div className="rounded-2xl bg-[#F2F2F7] dark:bg-black/40 p-4">
              <p className="text-[11px] font-bold uppercase text-gray-500 mb-2">{t.notes}</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300">{interview.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={calendarOptions.onGoogleCalendar} className="min-h-11 rounded-xl bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-[13px] font-semibold text-blue-600 dark:text-blue-300 flex items-center justify-center gap-1.5">
              <ExternalLink size={15} /> {t.googleCalendar}
            </button>
            <button onClick={calendarOptions.onSystemCalendar} className="min-h-11 rounded-xl bg-gray-100 dark:bg-white/10 px-3 py-2 text-[13px] font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5">
              <CalendarPlus size={15} /> {t.appleCalendar}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={onEdit} className="min-h-11 rounded-xl bg-gray-100 dark:bg-white/10 px-3 py-2 text-[13px] font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5">
              <Edit2 size={15} /> {t.edit}
            </button>
            <button onClick={onShare} className="min-h-11 rounded-xl bg-gray-100 dark:bg-white/10 px-3 py-2 text-[13px] font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5">
              <Share size={15} /> {t.share}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F2F2F7] dark:bg-black/40 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-gray-500 mb-1">
        {icon} {label}
      </div>
      <p className="text-sm font-semibold text-black dark:text-white break-words">{value}</p>
    </div>
  );
}
