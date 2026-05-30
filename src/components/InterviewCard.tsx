import React, { useEffect, useState } from 'react';
import { Interview, InterviewResult, InterviewStage, Language } from '../types';
import { useI18n } from '../i18n';
import { addToSystemCalendar, createGoogleCalendarUrl } from '../utils';
import {
  Brain,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  FileText,
  Download,
  Edit2,
  ExternalLink,
  Hash,
  Link as LinkIcon,
  Mail,
  MapPin,
  RefreshCw,
  Save,
  Share,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { apiUrl } from '../api';
import { createPrepChecklist } from '../interviewDefaults';
import { ensureAiServiceConsent } from '../aiConsent';

interface Props {
  interview: Interview;
  lang: Language;
  timezone: string;
  onEdit: (i: Interview) => void;
  onComplete?: (i: Interview) => void;
  onUpdate: (id: string, updates: Partial<Interview>) => void;
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

function slugifyFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'interview-document';
}

async function downloadMarkdownFile(title: string, content: string) {
  const filename = `${slugifyFileName(title)}.md`;
  const file = new File([content], filename, { type: 'text/markdown;charset=utf-8' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function normalizeMarkdownResponse(data: any, fallbackTitle: string) {
  const now = new Date().toISOString();
  return {
    generatedAt: String(data?.generatedAt || now),
    updatedAt: String(data?.updatedAt || data?.generatedAt || now),
    title: String(data?.title || fallbackTitle),
    content: String(data?.content || '').trim(),
    chatMessages: Array.isArray(data?.chatMessages) ? data.chatMessages : [],
  };
}

function createLocalId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function parseSseEvent(rawEvent: string) {
  const lines = rawEvent.split('\n');
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return { event, data };
}

export function InterviewCard({ interview, lang, timezone, onEdit, onComplete, onUpdate, onDelete, hasConflict = false }: Props) {
  const t = useI18n(lang);
  const [showCalendarOptions, setShowCalendarOptions] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const resultLabels: Record<InterviewResult, string> = {
    unknown: t.resultUnknown,
    waiting: t.resultWaiting,
    offer: t.resultOffer,
    rejected: t.resultRejected,
    withdrawn: t.resultWithdrawn,
  };
  const stageLabels: Record<InterviewStage, string> = {
    applied: t.stageApplied,
    hr: t.stageHr,
    technical1: t.stageTechnical1,
    technical2: t.stageTechnical2,
    final: t.stageFinal,
    offerTalk: t.stageOfferTalk,
    closed: t.stageClosed,
  };

  const d = new Date(interview.date);
  const hasValidDate = !isNaN(d.getTime());
  const formattedTime = hasValidDate ? format(d, 'HH:mm') : '--:--';
  const formattedDate = hasValidDate ? format(d, 'EEE, MMM d') : '-';
  const fullDate = hasValidDate ? format(d, 'yyyy-MM-dd HH:mm') : interview.date;
  const followUpTime = new Date(interview.followUpDate);
  const hasFollowUp = interview.status === 'completed' && interview.followUpDate && !isNaN(followUpTime.getTime());
  const isFollowUpDue = Boolean(hasFollowUp && !interview.followUpDone && followUpTime.getTime() <= Date.now());
  const prepTotal = interview.prepChecklist?.length || 0;
  const prepDone = interview.prepChecklist?.filter(item => item.done).length || 0;
  const description = [
    interview.notes,
    interview.review ? `${t.postInterviewReview}: ${interview.review}` : '',
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
      const result = await addToSystemCalendar(calendarEvent);
      if (result === 'native-canceled') {
        setShowCalendarOptions(false);
        return;
      }
      toast.success(result === 'native' ? t.calendarAdded : t.calendarFileDownloaded);
      setShowCalendarOptions(false);
    } catch (error: any) {
      if (error?.message === 'calendar-permission-denied') {
        toast.error(t.calendarPermissionDenied);
      } else if (error?.message === 'calendar-unavailable') {
        toast.error(t.calendarUnavailable);
      } else {
        toast.error(t.invalidCalendarDate);
      }
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
              <span className="flex items-center gap-1 min-w-0">
                <ClipboardCheck size={12} className="shrink-0"/> {stageLabels[interview.stage]}
              </span>
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
              {interview.status === 'upcoming' && prepTotal > 0 && (
                <span className="flex items-center gap-1"><Brain size={12}/> {t.prepProgress} {prepDone}/{prepTotal}</span>
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

            {interview.status !== 'upcoming' && (
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200">
                  {resultLabels[interview.result || 'unknown']}
                </span>
                {hasFollowUp && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpdate(interview.id, { followUpDone: true });
                      toast.success(t.markFollowedUp);
                    }}
                    disabled={interview.followUpDone}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition-colors ${
                      interview.followUpDone
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : isFollowUpDue
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                          : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
                    }`}
                  >
                    {interview.followUpDone ? t.followUpDone : `${t.followUpDate}: ${format(followUpTime, 'MM-dd HH:mm')}`}
                  </button>
                )}
              </div>
            )}

            {interview.review && (
              <p className="text-[13px] text-gray-700 dark:text-gray-300 bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-xl mb-3 line-clamp-3 leading-relaxed">
                {interview.review}
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
          timezone={timezone}
          fullDate={fullDate}
          calendarOptions={{
            onGoogleCalendar: handleGoogleCalendar,
            onSystemCalendar: handleSystemCalendar,
          }}
          onUpdate={(updates) => onUpdate(interview.id, updates)}
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
  timezone: string;
  fullDate: string;
  calendarOptions: {
    onGoogleCalendar: (event?: React.MouseEvent) => void;
    onSystemCalendar: (event?: React.MouseEvent) => void;
  };
  onUpdate: (updates: Partial<Interview>) => void;
  onClose: () => void;
  onCopyMeetingId: (event?: React.MouseEvent) => void;
  onEdit: () => void;
  onShare: (event?: React.MouseEvent) => void;
}

function InterviewDetailsModal({ interview, lang, timezone, fullDate, calendarOptions, onUpdate, onClose, onCopyMeetingId, onEdit, onShare }: DetailsProps) {
  const t = useI18n(lang);
  const [isGeneratingPrep, setIsGeneratingPrep] = useState(false);
  const [isGeneratingTemplates, setIsGeneratingTemplates] = useState(false);
  const resultLabels: Record<InterviewResult, string> = {
    unknown: t.resultUnknown,
    waiting: t.resultWaiting,
    offer: t.resultOffer,
    rejected: t.resultRejected,
    withdrawn: t.resultWithdrawn,
  };
  const stageLabels: Record<InterviewStage, string> = {
    applied: t.stageApplied,
    hr: t.stageHr,
    technical1: t.stageTechnical1,
    technical2: t.stageTechnical2,
    final: t.stageFinal,
    offerTalk: t.stageOfferTalk,
    closed: t.stageClosed,
  };
  const followUpTime = new Date(interview.followUpDate);
  const hasFollowUp = interview.status === 'completed' && interview.followUpDate && !isNaN(followUpTime.getTime());
  const prepChecklist = interview.prepChecklist || [];
  const prepDone = prepChecklist.filter(item => item.done).length;

  const togglePrepItem = (id: string) => {
    onUpdate({
      prepChecklist: prepChecklist.map(item => item.id === id ? { ...item, done: !item.done } : item),
    });
  };

  const addDefaultPrep = () => {
    onUpdate({ prepChecklist: createPrepChecklist(lang) });
  };

  const generatePrepPack = async () => {
    if (!ensureAiServiceConsent(lang)) {
      toast.error(t.aiConsentRequired);
      return;
    }
    setIsGeneratingPrep(true);
    const previousMessages = interview.prepPackMarkdown?.chatMessages || [];
    const fallbackTitle = `${interview.company || interview.role || 'Interview'} Prep Pack`;
    const startedAt = new Date().toISOString();
    let currentDocument = {
      generatedAt: interview.prepPackMarkdown?.generatedAt || startedAt,
      updatedAt: startedAt,
      title: interview.prepPackMarkdown?.title || fallbackTitle,
      content: '',
      chatMessages: previousMessages,
    };
    try {
      const sections = ['overview', 'questions', 'deepDive', 'star', 'closing'];
      let accumulatedContent = `# ${lang === 'zh' ? '面试准备包' : 'Interview Prep Pack'}\n\n`;
      onUpdate({ prepPackMarkdown: { ...currentDocument, content: accumulatedContent } });

      for (const sectionId of sections) {
        let sectionContent = '';
        const response = await fetch(apiUrl('/api/generate-prep-pack-stream'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interview, lang, timezone, sectionId }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || 'Failed to generate prep pack');
        }
        if (!response.body) throw new Error('Streaming is unavailable');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finished = false;
        let lastFlushAt = 0;
        const flushDocument = (force = false) => {
          const now = Date.now();
          if (!force && now - lastFlushAt < 350) return;
          lastFlushAt = now;
          currentDocument = {
            ...currentDocument,
            content: `${accumulatedContent}${sectionContent}`,
            updatedAt: new Date().toISOString(),
          };
          onUpdate({ prepPackMarkdown: currentDocument });
        };

        while (!finished) {
          const { value, done } = await reader.read();
          finished = done;
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const rawEvent of events) {
            if (!rawEvent.trim()) continue;
            const { event, data } = parseSseEvent(rawEvent);
            const payload = data ? JSON.parse(data) : {};
            if (event === 'meta') {
              currentDocument = {
                ...currentDocument,
                title: String(payload.title || currentDocument.title),
                generatedAt: String(payload.generatedAt || currentDocument.generatedAt),
                updatedAt: String(payload.updatedAt || currentDocument.updatedAt),
              };
              flushDocument(true);
            } else if (event === 'delta') {
              sectionContent = `${sectionContent}${String(payload.delta || '')}`;
              flushDocument(false);
            } else if (event === 'done') {
              sectionContent = String(payload.document?.content || sectionContent).trim();
              flushDocument(true);
            } else if (event === 'error') {
              throw new Error(payload.error || 'Failed to generate prep pack');
            }
          }
        }

        accumulatedContent = `${accumulatedContent}${sectionContent.trim()}\n\n`;
        currentDocument = {
          ...currentDocument,
          content: accumulatedContent.trim(),
          updatedAt: new Date().toISOString(),
        };
        onUpdate({ prepPackMarkdown: currentDocument });
      }
      toast.success(t.aiPrepPack);
    } catch (error: any) {
      toast.error(error?.message || t.calendarUnavailable);
    } finally {
      setIsGeneratingPrep(false);
    }
  };

  const generateFollowUpTemplates = async () => {
    if (!ensureAiServiceConsent(lang)) {
      toast.error(t.aiConsentRequired);
      return;
    }
    setIsGeneratingTemplates(true);
    try {
      const response = await fetch(apiUrl('/api/generate-followup-message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview, lang }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to generate templates');
      }
      const data = await response.json();
      const previousMessages = interview.followUpTemplatesMarkdown?.chatMessages || [];
      const followUpTemplatesMarkdown = {
        ...normalizeMarkdownResponse(data, `${interview.company || interview.role || 'Interview'} Follow-up Templates`),
        chatMessages: previousMessages,
      };
      onUpdate({ followUpTemplatesMarkdown });
      toast.success(t.followUpTemplates);
    } catch (error: any) {
      toast.error(error?.message || t.calendarUnavailable);
    } finally {
      setIsGeneratingTemplates(false);
    }
  };

  const copyTemplate = async (text: string) => {
    if (!text) return;
    await copyToClipboard(text);
    toast.success(t.templateCopied);
  };

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
          <DetailRow icon={<ClipboardCheck size={17} />} label={t.stage} value={stageLabels[interview.stage]} />
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

          {(interview.jobDescription || interview.resumeSnapshot || interview.companyResearch || interview.interviewerInfo) && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-4">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase text-amber-700 dark:text-amber-300">
                <FileText size={15} /> {t.aiContext}
              </div>
              <div className="space-y-3">
                {interview.jobDescription && <ContextBlock title={t.jobDescription} text={interview.jobDescription} />}
                {interview.resumeSnapshot && <ContextBlock title={t.resumeSnapshot} text={interview.resumeSnapshot} />}
                {interview.companyResearch && <ContextBlock title={t.companyResearch} text={interview.companyResearch} />}
                {interview.interviewerInfo && <ContextBlock title={t.interviewerInfo} text={interview.interviewerInfo} />}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase text-indigo-700 dark:text-indigo-300">{t.prepChecklist}</p>
                <p className="text-sm font-bold text-black dark:text-white">{prepDone}/{prepChecklist.length || 0}</p>
              </div>
              {prepChecklist.length === 0 && (
                <button onClick={addDefaultPrep} className="min-h-9 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-bold text-white">
                  {t.addDefaultPrep}
                </button>
              )}
            </div>
            {prepChecklist.length > 0 && (
              <div className="space-y-2">
                {prepChecklist.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => togglePrepItem(item.id)}
                    className="w-full rounded-xl bg-white/80 dark:bg-black/20 p-3 text-left flex items-start gap-3 active:scale-[0.99] transition-transform"
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${item.done ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300 dark:border-white/20'}`}>
                      {item.done && <CheckCircle2 size={14} />}
                    </span>
                    <span className={`text-sm leading-relaxed ${item.done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'}`}>{item.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-violet-50 dark:bg-violet-500/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase text-violet-700 dark:text-violet-300">{t.aiPrepPack}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{interview.prepPackMarkdown ? format(new Date(interview.prepPackMarkdown.updatedAt), 'yyyy-MM-dd HH:mm') : t.generatePrepPack}</p>
              </div>
              <button
                onClick={generatePrepPack}
                disabled={isGeneratingPrep}
                className="min-h-9 shrink-0 rounded-xl bg-violet-500 disabled:bg-violet-300 px-3 py-2 text-xs font-bold text-white flex items-center gap-1.5"
              >
                {isGeneratingPrep ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {isGeneratingPrep ? t.generating : interview.prepPackMarkdown ? t.regeneratePrepPack : t.generatePrepPack}
              </button>
            </div>
            {interview.prepPackMarkdown && (
              <MarkdownDocumentPanel
                document={interview.prepPackMarkdown}
                documentType="prep"
                interview={interview}
                lang={lang}
                timezone={timezone}
                onSave={(document) => onUpdate({ prepPackMarkdown: document })}
              />
            )}
          </div>

          {interview.status !== 'upcoming' && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 p-4">
              <p className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300 mb-2">{t.result}</p>
              <p className="text-sm font-bold text-black dark:text-white">{resultLabels[interview.result || 'unknown']}</p>
              {interview.review && (
                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300 mb-1">{t.postInterviewReview}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300">{interview.review}</p>
                </div>
              )}
              {hasFollowUp && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase text-gray-500">{t.followUpDate}</p>
                    <p className="text-sm font-semibold text-black dark:text-white">{format(followUpTime, 'yyyy-MM-dd HH:mm')}</p>
                  </div>
                  <button
                    onClick={() => onUpdate({ followUpDone: true })}
                    disabled={interview.followUpDone}
                    className="min-h-9 shrink-0 rounded-xl bg-emerald-500 disabled:bg-gray-300 dark:disabled:bg-white/10 px-3 py-2 text-xs font-bold text-white disabled:text-gray-500"
                  >
                    {interview.followUpDone ? t.followUpDone : t.markFollowedUp}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase text-cyan-700 dark:text-cyan-300">{t.followUpTemplates}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{interview.followUpTemplatesMarkdown ? format(new Date(interview.followUpTemplatesMarkdown.updatedAt), 'yyyy-MM-dd HH:mm') : t.generateFollowUpTemplates}</p>
              </div>
              <button
                onClick={generateFollowUpTemplates}
                disabled={isGeneratingTemplates}
                className="min-h-9 shrink-0 rounded-xl bg-cyan-500 disabled:bg-cyan-300 px-3 py-2 text-xs font-bold text-white flex items-center gap-1.5"
              >
                {isGeneratingTemplates ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
                {isGeneratingTemplates ? t.generating : t.generateFollowUpTemplates}
              </button>
            </div>
            {interview.followUpTemplatesMarkdown && (
              <MarkdownDocumentPanel
                document={interview.followUpTemplatesMarkdown}
                documentType="followUp"
                interview={interview}
                lang={lang}
                timezone={timezone}
                onSave={(document) => onUpdate({ followUpTemplatesMarkdown: document })}
              />
            )}
          </div>

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

function ContextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-white/80 dark:bg-black/20 p-3">
      <p className="mb-1 text-[11px] font-bold uppercase text-gray-500">{title}</p>
      <p className="max-h-32 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200">{text}</p>
    </div>
  );
}

type MarkdownDocument = NonNullable<Interview['prepPackMarkdown']>;

function MarkdownDocumentPanel({
  document,
  documentType,
  interview,
  lang,
  timezone,
  onSave,
}: {
  document: MarkdownDocument;
  documentType: 'prep' | 'followUp';
  interview: Interview;
  lang: Language;
  timezone: string;
  onSave: (document: MarkdownDocument) => void;
}) {
  const t = useI18n(lang);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(document.content);
  const [aiMessage, setAiMessage] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  useEffect(() => {
    setDraft(document.content);
  }, [document.content]);

  const saveDraft = () => {
    onSave({ ...document, content: draft, updatedAt: new Date().toISOString() });
    setIsEditing(false);
    toast.success(t.documentSaved);
  };

  const copyDocument = async () => {
    await copyToClipboard(document.content);
    toast.success(t.documentCopied);
  };

  const downloadDocument = async () => {
    try {
      await downloadMarkdownFile(document.title, document.content);
      toast.success(t.documentDownloaded);
    } catch (error) {
      toast.error(t.calendarUnavailable);
    }
  };

  const askAi = async () => {
    if (!aiMessage.trim()) return;
    if (!ensureAiServiceConsent(lang)) {
      toast.error(t.aiConsentRequired);
      return;
    }
    setIsChatting(true);
    const now = new Date().toISOString();
    const userMessage = {
      id: createLocalId('user'),
      role: 'user' as const,
      content: aiMessage.trim(),
      createdAt: now,
    };
    const optimisticMessages = [...(document.chatMessages || []), userMessage];
    const currentMessage = aiMessage.trim();
    onSave({ ...document, chatMessages: optimisticMessages, updatedAt: now });
    setAiMessage('');
    try {
      const response = await fetch(apiUrl('/api/chat-document'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview,
          document: { ...document, chatMessages: optimisticMessages },
          documentType,
          message: currentMessage,
          chatMessages: optimisticMessages,
          lang,
          timezone,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update document');
      }
      const data = await response.json();
      const assistantMessage = {
        id: createLocalId('assistant'),
        role: 'assistant' as const,
        content: String(data.reply || ''),
        createdAt: new Date().toISOString(),
      };
      const nextDocument = {
        ...normalizeMarkdownResponse(data.document, document.title),
        chatMessages: [...optimisticMessages, assistantMessage].filter((message) => message.content).slice(-50),
      };
      onSave(nextDocument);
      setDraft(nextDocument.content);
    } catch (error: any) {
      onSave({ ...document, chatMessages: document.chatMessages || [] });
      toast.error(error?.message || t.calendarUnavailable);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white/80 dark:bg-black/20 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button onClick={() => setIsEditing((value) => !value)} className="min-h-9 rounded-xl bg-gray-900 dark:bg-white px-3 py-2 text-xs font-bold text-white dark:text-black flex items-center gap-1.5">
            <Edit2 size={14} /> {isEditing ? t.previewMarkdown : t.editMarkdown}
          </button>
          <button onClick={copyDocument} className="min-h-9 rounded-xl bg-white dark:bg-white/10 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
            <Copy size={14} /> {t.copyMarkdown}
          </button>
          <button onClick={downloadDocument} className="min-h-9 rounded-xl bg-white dark:bg-white/10 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
            <Download size={14} /> {t.downloadMarkdown}
          </button>
          {isEditing && (
            <button onClick={saveDraft} className="min-h-9 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white flex items-center gap-1.5">
              <Save size={14} /> {t.save}
            </button>
          )}
        </div>

        {isEditing ? (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-[320px] w-full resize-y rounded-xl bg-white dark:bg-[#1C1C1E] p-3 font-mono text-[13px] leading-relaxed text-black dark:text-white outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        ) : (
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-white dark:bg-[#1C1C1E] p-3 text-sm leading-relaxed text-gray-800 dark:text-gray-100">
            {document.content}
          </pre>
        )}
      </div>

      <div className="rounded-xl bg-white/80 dark:bg-black/20 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase text-gray-500">{t.aiDocumentChat}</p>
        {document.chatMessages.length > 0 && (
          <div className="mb-3 max-h-64 space-y-2 overflow-auto rounded-xl bg-white dark:bg-[#1C1C1E] p-2">
            {document.chatMessages.map((message) => (
              <div
                key={message.id}
                className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'ml-8 bg-violet-500 text-white'
                    : 'mr-8 bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-gray-100'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className={`mt-1 text-[10px] ${message.role === 'user' ? 'text-white/70' : 'text-gray-400'}`}>
                  {message.role === 'user' ? t.you : t.aiAssistant} · {format(new Date(message.createdAt), 'MM-dd HH:mm')}
                </p>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={aiMessage}
          onChange={(event) => setAiMessage(event.target.value)}
          placeholder={t.aiDocumentPlaceholder}
          className="mb-2 min-h-[84px] w-full resize-y rounded-xl bg-white dark:bg-[#1C1C1E] p-3 text-sm leading-relaxed text-black dark:text-white outline-none focus:ring-2 focus:ring-violet-500/40"
        />
        <button
          onClick={askAi}
          disabled={isChatting || !aiMessage.trim()}
          className="min-h-9 rounded-xl bg-violet-500 disabled:bg-violet-300 px-3 py-2 text-xs font-bold text-white flex items-center gap-1.5"
        >
          {isChatting ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {isChatting ? t.generating : t.askAi}
        </button>
      </div>
    </div>
  );
}

function TemplateBlock({ title, text, onCopy, copyLabel }: { title: string; text: string; onCopy: (text: string) => void; copyLabel: string }) {
  if (!text) return null;
  return (
    <div className="rounded-xl bg-white/80 dark:bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase text-gray-500">{title}</p>
        <button onClick={() => onCopy(text)} className="rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[11px] font-bold text-white">
          {copyLabel}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200">{text}</p>
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
