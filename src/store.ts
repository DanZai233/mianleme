import { useState, useEffect } from "react";
import { AppState, Interview, Language, ModelConfig } from "./types";
import { getBrowserTimezone } from "./utils";

const STORAGE_KEY = "interview_tracker_data";

const defaultState: AppState = {
  interviews: [],
  language: "zh",
  timezone: getBrowserTimezone(),
  darkMode: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
  notificationsEnabled: false,
  modelConfig: {
    provider: "google",
    apiKey: "",
    modelName: "gemini-2.5-flash",
  }
};

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Clean up legacy data if needed
        return { ...defaultState, ...parsed };
      } catch (e) {
        console.error("Local storage decode error", e);
        return defaultState;
      }
    }
    return defaultState;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addInterview = (interview: Interview) => {
    setState((s) => ({ ...s, interviews: [...s.interviews, interview] }));
  };

  const updateInterview = (id: string, updates: Partial<Interview>) => {
    setState((s) => ({
      ...s,
      interviews: s.interviews.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
  };

  const deleteInterview = (id: string) => {
    setState((s) => ({
      ...s,
      interviews: s.interviews.filter((i) => i.id !== id),
    }));
  };

  const setLanguage = (lang: Language) => {
    setState((s) => ({ ...s, language: lang }));
  };

  const setTimezone = (timezone: string) => {
    setState((s) => ({ ...s, timezone }));
  };

  const setDarkMode = (darkMode: boolean) => {
    setState((s) => ({ ...s, darkMode }));
  };

  const setNotificationsEnabled = (enabled: boolean) => {
    setState((s) => ({ ...s, notificationsEnabled: enabled }));
  };

  const setModelConfig = (config: Partial<ModelConfig>) => {
    setState((s) => ({ ...s, modelConfig: { ...s.modelConfig, ...config } }));
  };

  const importData = (data: AppState) => {
    setState(data);
  };

  return {
    state,
    addInterview,
    updateInterview,
    deleteInterview,
    setLanguage,
    setTimezone,
    setDarkMode,
    setNotificationsEnabled,
    setModelConfig,
    importData,
  };
}
