import React, { useState, useEffect, useMemo } from 'react';
import { useAppState } from './store';
import { useI18n } from './i18n';
import { Interview } from './types';
import { InterviewCard } from './components/InterviewCard';
import { AddInterviewModal } from './components/AddInterviewModal';
import { SettingsModal } from './components/SettingsModal';
import { Plus, Search, Settings, Calendar as CalendarIcon, List, LayoutList } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { format, isSameDay, addDays, subDays, eachDayOfInterval, isToday } from 'date-fns';

export default function App() {
  const { state, addInterview, updateInterview, deleteInterview, setLanguage, importData } = useAppState();
  const t = useI18n(state.language);
  
  const [darkMode, setDarkMode] = useState(true);
  const [search, setSearch] = useState('');
  
  // App modes: 'list' (all upcoming), 'calendar' (selected date), 'history' (archived/completed)
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'history'>('list');
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const [editingData, setEditingData] = useState<Interview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      setNotificationsEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (!notificationsEnabled) return;
    const checkNotifications = () => {
      const now = new Date().getTime();
      state.interviews.forEach(interview => {
        if (interview.status !== 'upcoming') return;
        const d = new Date(interview.date).getTime();
        if (isNaN(d)) return;
        const triggerTime = d - (interview.reminderHours * 60 * 60 * 1000);
        if (Math.abs(now - triggerTime) < 60000) {
          new Notification(t.appTitle, {
            body: `${t.notifyNow} ${interview.company} - ${interview.role}`,
            icon: '/favicon.ico'
          });
        }
      });
    };
    const interval = setInterval(checkNotifications, 60000);
    return () => clearInterval(interval);
  }, [state.interviews, notificationsEnabled, t]);

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
                            i.role.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (viewMode === 'list') {
        return i.status === 'upcoming';
      } else if (viewMode === 'history') {
        return i.status !== 'upcoming';
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
  }, [state.interviews, search, viewMode, selectedDate]);

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

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '20px', background: darkMode ? '#1C1C1E' : '#FFFFFF', color: darkMode ? '#FFFFFF' : '#000000' } }} />
      
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

        {/* Overview Stats (only shown in history mode) */}
        {viewMode === 'history' && (
          <div className="mb-6 grid grid-cols-3 gap-3">
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
                  {state.interviews.filter(i => i.status === 'upcoming').length}
                </span>
                <span className="text-[10px] sm:text-xs font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase text-center">{t.upcoming}</span>
             </div>
          </div>
        )}

        {/* List Content */}
        <div className="flex flex-col gap-4">
           {filteredInterviews.length > 0 ? (
            filteredInterviews.map(interview => (
              <InterviewCard 
                key={interview.id} 
                interview={interview} 
                lang={state.language} 
                onEdit={(i) => { setEditingData(i); setIsModalOpen(true); }}
                onComplete={(i) => {
                  updateInterview(i.id, { ...i, status: 'completed' });
                  toast.success(t.completed);
                }}
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
                {viewMode === 'calendar' ? t.noInterviewsToday : t.noInterviews}
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

      {/* Settings Modal Extracted */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        lang={state.language}
        setLang={setLanguage}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        notificationsEnabled={notificationsEnabled}
        requestNotifications={requestNotifications}
        onExport={handleExport}
        onImport={handleImport}
      />

    </div>
  );
}
