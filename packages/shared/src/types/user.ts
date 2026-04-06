export interface User {
  id: number;
  email: string;
  displayName: string;
  createdAt: Date;
  lastLogin?: Date;
  subscription: 'free' | 'premium';
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Device {
  deviceId: string;
  deviceName: string;
  platform: 'linux' | 'windows' | 'android';
  lastSync: Date;
  widgetPositionX?: number;
  widgetPositionY?: number;
}
