export interface Settings {
  id: number;
  userId: number;
  wordLookupCacheSize: number;
  pomodoroWorkDuration: number;
  pomodoroShortBreak: number;
  pomodoroLongBreak: number;
  pomodoroCyclesBeforeLong: number;
  updatedAt: Date;
}

export interface UpdateSettingsInput extends Partial<Omit<Settings, 'id' | 'userId' | 'updatedAt'>> {}
