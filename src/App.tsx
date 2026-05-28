import React, { useState, useEffect, useMemo } from 'react';
import { useAppState } from './store';
import { useI18n } from './i18n';
import { Interview, InterviewResult, Language } from './types';
import { InterviewCard } from './components/InterviewCard';
import { AddInterviewModal } from './components/AddInterviewModal';
import { SettingsModal } from './components/SettingsModal';
import { Bell, CheckCircle2, MessageSquare, Plus, Search, Settings, Calendar as CalendarIcon, List, LayoutList } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { format, isSameDay, addDays, subDays, eachDayOfInterval, isToday } from 'date-fns';
import { formatDateTimeForTimezone } from './utils';

const NOTIFICATION_SENT_KEY = 'interview_tracker_notifications_sent';

function isFollowUpDue(interview: Interview, now = new Date()) {
  if (interview.status !== 'completed' || !interview.followUpDate || interview.followUpDone) return false;
  const followUpTime = new Date(interview.followUpDate).getTime();
  return !isNaN(followUpTime) && followUpTime <= now.getTime();
}

function getSentNotificationKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_SENT_KEY) || '[]');
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

export default function App() {
  const { state, addInterview, updateInterview, deleteInterview, setLanguage, setTimezone, importData, setDarkMode, setNotificationsEnabled } = useAppState();
  const t = useI18n(state.language);
  
  const [search, setSearch] = useState('');
  
  // App modes: 'list' (all upcoming), 'calendar' (selected date), 'history' (archived/completed)
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'history'>('list');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [historyResultFilter, setHistoryResultFilter] = useState<'all' | InterviewResult>('all');
  const [historyReviewFilter, setHistoryReviewFilter] = useState<'all' | 'withReview' | 'withoutReview' | 'followUpDue'>('all');
  const [historyMonthFilter, setHistoryMonthFilter] = useState('all');
  
  const [editingData, setEditingData] = useState<Interview | null>(null);
  const [completingData, setCompletingData] = useState<Interview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const resultLabels: Record<InterviewResult, string> = {
    unknown: t.resultUnknown,
    waiting: t.resultWaiting,
    offer: t.resultOffer,
    rejected: t.resultRejected,
    withdrawn: t.resultWithdrawn,
  };

  useEffect(() => {
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.darkMode]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      setNotificationsEnabled(true);
    }
  }, [setNotificationsEnabled]);

  useEffect(() => {
    if (!state.notificationsEnabled) return;
    const checkNotifications = () => {
      const now = new Date().getTime();
      const sent = getSentNotificationKeys();
      state.interviews.forEach(interview => {
        const d = new Date(interview.date).getTime();
        if (interview.status === 'upcoming' && !isNaN(d)) {
          const triggerTime = d - (interview.reminderHours * 60 * 60 * 1000);
          const key = `interview:${interview.id}:${interview.date}:${interview.reminderHours}`;
          if (now >= triggerTime && now - triggerTime < 60000 && !sent.has(key)) {
            sent.add(key);
            new Notification(t.appTitle, {
              body: `${t.notifyNow} ${interview.company} - ${interview.role}`,
              icon: '/favicon.ico'
            });
          }
        }

        const followUpTime = new Date(interview.followUpDate).getTime();
        const followUpKey = `followup:${interview.id}:${interview.followUpDate}`;
        if (
          interview.status === 'completed' &&
          interview.followUpDate &&
          !interview.followUpDone &&
          !isNaN(followUpTime) &&
          now >= followUpTime &&
          now - followUpTime < 24 * 60 * 60 * 1000 &&
          !sent.has(followUpKey)
        ) {
          sent.add(followUpKey);
          new Notification(t.appTitle, {
            body: `${t.followUpsDue}: ${interview.company} - ${interview.role}`,
            icon: '/favicon.ico'
          });
        }
      });
      localStorage.setItem(NOTIFICATION_SENT_KEY, JSON.stringify(Array.from(sent).slice(-200)));
    };
    const interval = setInterval(checkNotifications, 60000);
    return () => clearInterval(interval);
  }, [state.interviews, state.notificationsEnabled, t]);

  const requestNotifications = () => {
    if ("Notification" in window) {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
           setNotificationsEnabled(true);
           toast.success("Notifications enabled");
        }
      });
    }
  };

  // Calendar dates generation (e.g. 7 days back, 14 days forward)
  const calendarDates = useMemo(() => {
    const today = new Date();
    const start = subDays(today, 5);
    const end = addDays(today, 15);
    return eachDayOfInterval({ start, end });
  }, []);

  const hasConflict = (interview: Interview) => {
    if (interview.status !== 'upcoming' || !interview.date) return false;
    const currentStart = new Date(interview.date).getTime();
    if (isNaN(currentStart)) return false;
    const duration = interview.durationMinutes || 60;
    const currentEnd = currentStart + duration * 60 * 1000;
    const buffer = 30 * 60 * 1000; // 30 mins
    
    return state.interviews.some(i => {
      if (i.id === interview.id || i.status !== 'upcoming') return false;
      const start = new Date(i.date).getTime();
      if (isNaN(start)) return false;
      const iDuration = i.durationMinutes || 60;
      const end = start + iDuration * 60 * 1000;
      return (currentStart - buffer < end && currentEnd + buffer > start);
    });
  };

  const filteredInterviews = useMemo(() => {
    let list = state.interviews.filter(i => {
      const matchesSearch = i.company.toLowerCase().includes(search.toLowerCase()) || 
                            i.role.toLowerCase().includes(search.toLowerCase()) ||
                            i.platform.toLowerCase().includes(search.toLowerCase()) ||
                            i.meetingId.toLowerCase().includes(search.toLowerCase()) ||
                            i.notes.toLowerCase().includes(search.toLowerCase()) ||
                            i.review.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (viewMode === 'list') {
        return i.status === 'upcoming';
      } else if (viewMode === 'history') {
        if (i.status === 'upcoming') return false;
        if (historyResultFilter !== 'all' && i.result !== historyResultFilter) return false;
        if (historyMonthFilter !== 'all') {
          const time = new Date(i.date).getTime();
          if (isNaN(time) || format(new Date(time), 'yyyy-MM') !== historyMonthFilter) return false;
        }
        if (historyReviewFilter === 'withReview' && !i.review.trim()) return false;
        if (historyReviewFilter === 'withoutReview' && i.review.trim()) return false;
        if (historyReviewFilter === 'followUpDue' && !isFollowUpDue(i)) return false;
        return true;
      } else if (viewMode === 'calendar') {
        return isSameDay(new Date(i.date), selectedDate);
      }
      return true;
    });

    list.sort((a, b) => {
      if (viewMode === 'history') return new Date(b.date).getTime() - new Date(a.date).getTime(); // Descending
      return new Date(a.date).getTime() - new Date(b.date).getTime(); // Ascending
    });

    return list;
  }, [state.interviews, search, viewMode, selectedDate, historyResultFilter, historyMonthFilter, historyReviewFilter]);

  const handleExport = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mianleme_backup.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Backup exported");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.interviews && Array.isArray(data.interviews)) {
          importData(data);
          toast.success("Backup restored");
          setIsSettingsOpen(false);
        } else {
          toast.error("Invalid backup file");
        }
      } catch (err) {
        toast.error("Error reading backup");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDragged, setIsDragged] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setIsDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };
  const onMouseLeave = () => setIsDragging(false);
  const onMouseUp = () => setIsDragging(false);
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    if (Math.abs(walk) > 5) setIsDragged(true);
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  // Find next upcoming interview
  const nextInterview = useMemo(() => {
    const upcoming = state.interviews.filter(i => i.status === 'upcoming');
    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return upcoming.find(i => new Date(i.date).getTime() > new Date().getTime());
  }, [state.interviews]);

  const dueFollowUps = useMemo(() => (
    state.interviews
      .filter(i => isFollowUpDue(i))
      .sort((a, b) => new Date(a.followUpDate).getTime() - new Date(b.followUpDate).getTime())
  ), [state.interviews]);

  const historyMonths = useMemo(() => {
    const months = new Set<string>();
    state.interviews.forEach((interview) => {
      if (interview.status === 'upcoming') return;
      const time = new Date(interview.date).getTime();
      if (!isNaN(time)) months.add(format(new Date(time), 'yyyy-MM'));
    });
    return Array.from(months).sort().reverse();
  }, [state.interviews]);

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '20px', background: state.darkMode ? '#1C1C1E' : '#FFFFFF', color: state.darkMode ? '#FFFFFF' : '#000000' } }} />
      
      {/* iOS Style Large Header */}
      <header className="px-5 pt-12 pb-4 sticky top-0 bg-[#F2F2F7]/90 dark:bg-[#000000]/90 backdrop-blur-2xl z-20 border-b border-gray-200/50 dark:border-white/10">
        <div className="flex flex-col gap-4 max-w-lg mx-auto">
          <div className="flex justify-between items-end">
            <h1 className="text-3xl font-extrabold tracking-tight text-black dark:text-white">
               {t.appTitle}
            </h1>
            <button 
               onClick={() => setIsSettingsOpen(true)}
               className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              <Settings size={20} />
            </button>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={18} />
            </div>
            <input 
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               placeholder={t.searchPlaceholder}
               className="w-full bg-white dark:bg-[#1C1C1E] text-black dark:text-white placeholder-gray-400 border border-transparent rounded-2xl py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm dark:shadow-none text-sm"
            />
          </div>

          {/* Custom Segmented Control */}
          <div className="bg-gray-200/50 dark:bg-[#1C1C1E] rounded-xl p-1 flex gap-1">
            <button onClick={()=>setViewMode('list')} className={`flex-1 flex justify-center items-center gap-1.5 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-[#2C2C2E] shadow-sm text-black dark:text-white' : 'text-gray-500'}`}>
              <List size={14} /> {t.upcoming}
            </button>
            <button onClick={()=>setViewMode('calendar')} className={`flex-1 flex justify-center items-center gap-1.5 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-[#2C2C2E] shadow-sm text-black dark:text-white' : 'text-gray-500'}`}>
              <CalendarIcon size={14} /> {t.calendar}
            </button>
            <button onClick={()=>setViewMode('history')} className={`flex-1 flex justify-center items-center gap-1.5 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${viewMode === 'history' ? 'bg-white dark:bg-[#2C2C2E] shadow-sm text-black dark:text-white' : 'text-gray-500'}`}>
              <LayoutList size={14} /> {t.history}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg flex-1 mx-auto w-full px-5 pt-6 pb-32">

        {/* Horizontal Calendar View (only shown in calendar mode) */}
        {viewMode === 'calendar' && (
          <div 
            ref={scrollRef}
            onMouseDown={onMouseDown}
            onMouseLeave={onMouseLeave}
            onMouseUp={onMouseUp}
            onMouseMove={onMouseMove}
            className={`mb-6 -mx-5 px-5 flex gap-2 overflow-x-auto hide-scrollbar pb-2 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            {calendarDates.map((date) => {
              const selected = isSameDay(date, selectedDate);
              const today = isToday(date);
              return (
                <button 
                  key={date.toISOString()}
                  onClick={(e) => { 
                    if (isDragged) { e.preventDefault(); e.stopPropagation(); return; }
                    setSelectedDate(date);
                  }} 
                  className={`flex flex-col items-center min-w-[56px] py-3 rounded-2xl shrink-0 transition-transform active:scale-95 ${selected ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white dark:bg-[#1C1C1E] text-gray-500 dark:text-gray-400 hover:bg-white/80 dark:hover:bg-[#2C2C2E]'}`}
                >
                  <span className="text-[11px] font-bold uppercase mb-1">{format(date, 'EEE')}</span>
                  <span className={`text-[20px] font-bold ${today && !selected ? 'text-blue-500' : ''}`}>{format(date, 'd')}</span>
                  {today && <div className={`w-1 h-1 rounded-full mt-1 ${selected ? 'bg-white' : 'bg-blue-500'}`} />}
                </button>
              );
            })}
          </div>
        )}

        {/* Next Interview Banner (Shown in List mode when there is an upcoming interview) */}
        {viewMode === 'list' && nextInterview && (
          <div className="mb-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
               <CalendarIcon size={120} />
            </div>
            <div className="relative z-10">
              <span className="text-blue-100 text-[11px] font-bold uppercase tracking-wider mb-1 block">
                {t.nextInterview}
              </span>
              <h3 className="text-xl font-bold mb-2 pr-12 line-clamp-2">
                 {nextInterview.company} - {nextInterview.role}
              </h3>
              <div className="flex items-center gap-4 text-sm font-medium">
                <span className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                  {format(new Date(nextInterview.date), 'MMM d, HH:mm')}
                </span>
                <span className="bg-white/20 text-white backdrop-blur-sm px-3 py-1.5 rounded-xl animate-pulse">
                   {(() => {
                      const diffMs = new Date(nextInterview.date).getTime() - new Date().getTime();
                      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
                      const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
                      if (days > 0) return `In ${days}${t.daysSuffix} ${hours}${t.hoursSuffix}`;
                      if (hours > 0) return `In ${hours}${t.hoursSuffix} ${minutes}${t.minsSuffix}`;
                      if (minutes > 0) return `In ${minutes}${t.minsSuffix}`;
                      return t.startingSoon;
                   })()}
                </span>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'list' && dueFollowUps.length > 0 && (
          <div className="mb-6 ios-card p-4 border border-amber-200/70 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-500/10">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Bell size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-amber-700 dark:text-amber-300 uppercase">{t.followUpsDue}</p>
                  <p className="text-sm text-amber-800/80 dark:text-amber-100/80 truncate">{dueFollowUps.length} {t.followUps}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {dueFollowUps.slice(0, 3).map((interview) => (
                <div key={interview.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 dark:bg-black/25 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-black dark:text-white truncate">{interview.company} - {interview.role}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(interview.followUpDate), 'yyyy-MM-dd HH:mm')}</p>
                  </div>
                  <button
                    onClick={() => updateInterview(interview.id, { followUpDone: true })}
                    className="min-h-9 shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white active:scale-95 transition-transform"
                  >
                    {t.markFollowedUp}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overview Stats (only shown in history mode) */}
        {viewMode === 'history' && (
          <>
          <div className="mb-4 grid grid-cols-3 gap-3">
             <div className="bg-white dark:bg-[#1C1C1E] p-4 rounded-3xl flex flex-col items-center justify-center shadow-[0_2px_10px_rgb(0,0,0,0.03)] dark:shadow-none">
                <span className="text-2xl font-bold text-black dark:text-white mb-1">{state.interviews.length}</span>
                <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase text-center">{t.total}</span>
             </div>
             <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-3xl flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                  {state.interviews.filter(i => i.status === 'completed').length}
                </span>
                <span className="text-[10px] sm:text-xs font-semibold text-emerald-600/70 dark:text-emerald-400/70 uppercase text-center">{t.completed}</span>
             </div>
             <div className="bg-blue-50 dark:bg-blue-500/10 p-4 rounded-3xl flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  {dueFollowUps.length}
                </span>
                <span className="text-[10px] sm:text-xs font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase text-center">{t.followUpsDue}</span>
             </div>
          </div>
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={historyResultFilter} onChange={(e) => setHistoryResultFilter(e.target.value as 'all' | InterviewResult)} className="min-h-11 rounded-2xl bg-white dark:bg-[#1C1C1E] px-3 text-sm font-semibold text-black dark:text-white outline-none">
              <option value="all">{t.allResults}</option>
              {Object.entries(resultLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select value={historyReviewFilter} onChange={(e) => setHistoryReviewFilter(e.target.value as 'all' | 'withReview' | 'withoutReview' | 'followUpDue')} className="min-h-11 rounded-2xl bg-white dark:bg-[#1C1C1E] px-3 text-sm font-semibold text-black dark:text-white outline-none">
              <option value="all">{t.allReviews}</option>
              <option value="withReview">{t.withReview}</option>
              <option value="withoutReview">{t.withoutReview}</option>
              <option value="followUpDue">{t.dueFollowUps}</option>
            </select>
            <select value={historyMonthFilter} onChange={(e) => setHistoryMonthFilter(e.target.value)} className="min-h-11 rounded-2xl bg-white dark:bg-[#1C1C1E] px-3 text-sm font-semibold text-black dark:text-white outline-none">
              <option value="all">{t.allMonths}</option>
              {historyMonths.map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
          </>
        )}

        {/* List Content */}
        <div className="flex flex-col gap-4">
           {filteredInterviews.length > 0 ? (
            filteredInterviews.map(interview => (
              <InterviewCard 
                key={interview.id} 
                interview={interview} 
                lang={state.language} 
                timezone={state.timezone}
                onEdit={(i) => { setEditingData(i); setIsModalOpen(true); }}
                onComplete={(i) => {
                  setCompletingData(i);
                }}
                onUpdate={(id, updates) => updateInterview(id, updates)}
                onDelete={deleteInterview}
                hasConflict={hasConflict(interview)}
              />
            ))
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-gray-200 dark:bg-[#1C1C1E] rounded-full flex items-center justify-center mb-4">
                 <CalendarIcon size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">
                {viewMode === 'calendar' ? t.noInterviewsToday : viewMode === 'history' ? t.noHistoryMatches : t.noInterviews}
              </p>
            </div>
          )}
        </div>
        
      </main>

      {/* Floating Add Button (Apple style blue circle) */}
      <button
        onClick={() => { setEditingData(null); setIsModalOpen(true); }}
        className="fixed bottom-8 right-6 lg:right-auto lg:left-1/2 lg:translate-x-[220px] w-[60px] h-[60px] bg-blue-500 hover:bg-blue-400 text-white rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-30 shadow-[0_8px_30px_rgb(59,130,246,0.3)]"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      {isModalOpen && (
        <AddInterviewModal 
          initialData={editingData} 
          lang={state.language} 
          existingInterviews={state.interviews}
          timezone={state.timezone}
          onClose={() => setIsModalOpen(false)} 
          onSave={(data) => {
            if (editingData) {
              updateInterview(data.id, data);
              toast.success(t.extractedSuccess); // Reuse success message
            } else {
              addInterview(data);
              toast.success(t.extractedSuccess);
            }
            setIsModalOpen(false);
          }} 
        />
      )}

      {completingData && (
        <CompletionModal
          interview={completingData}
          lang={state.language}
          timezone={state.timezone}
          onClose={() => setCompletingData(null)}
          onSave={(updates) => {
            updateInterview(completingData.id, updates);
            toast.success(t.reviewSaved);
            setCompletingData(null);
          }}
        />
      )}

      {/* Settings Modal Extracted */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        lang={state.language}
        setLang={setLanguage}
        timezone={state.timezone}
        setTimezone={setTimezone}
        darkMode={state.darkMode}
        setDarkMode={setDarkMode}
        notificationsEnabled={state.notificationsEnabled}
        requestNotifications={requestNotifications}
        onExport={handleExport}
        onImport={handleImport}
      />

    </div>
  );
}

function CompletionModal({
  interview,
  lang,
  timezone,
  onClose,
  onSave,
}: {
  interview: Interview;
  lang: Language;
  timezone: string;
  onClose: () => void;
  onSave: (updates: Partial<Interview>) => void;
}) {
  const t = useI18n(lang);
  const resultLabels: Record<InterviewResult, string> = {
    unknown: t.resultUnknown,
    waiting: t.resultWaiting,
    offer: t.resultOffer,
    rejected: t.resultRejected,
    withdrawn: t.resultWithdrawn,
  };
  const defaultFollowUp = interview.followUpDate || formatDateTimeForTimezone(addDays(new Date(), 3), timezone);
  const [result, setResult] = useState<InterviewResult>(interview.result === 'unknown' ? 'waiting' : interview.result);
  const [review, setReview] = useState(interview.review || '');
  const [followUpDate, setFollowUpDate] = useState(defaultFollowUp);

  const save = (includeReview: boolean) => {
    onSave({
      status: 'completed',
      result: includeReview ? result : interview.result,
      review: includeReview ? review : interview.review,
      followUpDate: includeReview ? followUpDate : interview.followUpDate,
      followUpDone: includeReview ? false : interview.followUpDone,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 animate-fade-in-native" onClick={onClose} />
      <section className="relative z-10 w-full max-w-lg bg-white dark:bg-[#1C1C1E] sm:rounded-3xl rounded-t-[32px] shadow-2xl overflow-hidden animate-slide-up-native">
        <div className="p-5 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 size={21} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-black dark:text-white">{t.completionTitle}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">{t.completionSubtitle}</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-[#F2F2F7] dark:bg-black/40 p-4">
            <p className="text-sm font-bold text-black dark:text-white truncate">{interview.company} - {interview.role}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{interview.date ? format(new Date(interview.date), 'yyyy-MM-dd HH:mm') : '-'}</p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.result}</label>
            <select value={result} onChange={(e) => setResult(e.target.value as InterviewResult)} className="w-full min-h-12 rounded-2xl bg-[#F2F2F7] dark:bg-black/40 px-4 text-sm font-semibold text-black dark:text-white outline-none">
              {Object.entries(resultLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 flex items-center gap-1">
              <MessageSquare size={13} /> {t.postInterviewReview}
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder={lang === 'zh' ? '题目、表现、风险点、需要补充的内容...' : 'Questions, performance, risks, and next steps...'}
              className="w-full h-28 resize-none rounded-2xl bg-[#F2F2F7] dark:bg-black/40 px-4 py-3 text-sm text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase ml-1 mb-1 block">{t.followUpDate}</label>
            <input
              type="datetime-local"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full min-h-12 rounded-2xl bg-[#F2F2F7] dark:bg-black/40 px-4 text-sm font-semibold text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={() => save(false)} className="min-h-12 rounded-2xl bg-gray-100 dark:bg-white/10 px-3 text-sm font-bold text-gray-700 dark:text-gray-200 active:scale-[0.99] transition-transform">
              {t.skipReview}
            </button>
            <button onClick={() => save(true)} className="min-h-12 rounded-2xl bg-emerald-500 px-3 text-sm font-bold text-white active:scale-[0.99] transition-transform">
              {t.completeAndSave}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
