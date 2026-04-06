import { APIClient } from './client';
import { Settings, UpdateSettingsInput } from '../types';

export class SettingsAPI {
  constructor(private client: APIClient) {}

  async getSettings(): Promise<Settings> {
    return this.client.get('/api/settings');
  }

  async updateSettings(input: UpdateSettingsInput): Promise<Settings> {
    return this.client.put('/api/settings', input);
  }
}
