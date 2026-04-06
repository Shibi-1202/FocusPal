import { APIClient } from './client';
import { Task, CreateTaskInput, UpdateTaskInput, CompleteTaskInput } from '../types';

export class TasksAPI {
  constructor(private client: APIClient) {}

  async getTasks(date?: string): Promise<Task[]> {
    const params = date ? { date } : {};
    return this.client.get('/api/tasks', { params });
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    return this.client.post('/api/tasks', input);
  }

  async updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
    return this.client.put(`/api/tasks/${id}`, input);
  }

  async deleteTask(id: number): Promise<void> {
    return this.client.delete(`/api/tasks/${id}`);
  }

  async completeTask(id: number, input: CompleteTaskInput): Promise<Task> {
    return this.client.post(`/api/tasks/${id}/complete`, input);
  }
}
