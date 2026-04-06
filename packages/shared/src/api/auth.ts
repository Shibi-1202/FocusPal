import { APIClient } from './client';
import { LoginInput, RegisterInput, AuthResponse } from '../types';

export class AuthAPI {
  constructor(private client: APIClient) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    return this.client.post('/api/auth/register', input);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    return this.client.post('/api/auth/login', input);
  }

  async logout(refreshToken: string): Promise<void> {
    return this.client.post('/api/auth/logout', { refreshToken });
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    return this.client.post('/api/auth/refresh', { refreshToken });
  }
}
