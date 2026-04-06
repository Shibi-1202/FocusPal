import { APIClient } from './client';

export interface WordCache {
  word: string;
  definition: any;
  translation: string;
  accessCount: number;
  lastAccessed: Date;
}

export class WordLookupAPI {
  constructor(private client: APIClient) {}

  async getCache(): Promise<WordCache[]> {
    return this.client.get('/api/word-lookup/cache');
  }

  async addToCache(word: string, definition: any, translation: string): Promise<WordCache> {
    return this.client.post('/api/word-lookup/cache', { word, definition, translation });
  }

  async deleteFromCache(word: string): Promise<void> {
    return this.client.delete(`/api/word-lookup/cache/${word}`);
  }

  async clearCache(): Promise<void> {
    return this.client.delete('/api/word-lookup/cache');
  }
}
