export type TaskPriority = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'personal';
export type TaskRecurring = 'none' | 'daily' | 'weekdays' | 'weekends' | 'custom';
export type TaskStatus = 'pending' | 'active' | 'completed' | 'partial' | 'skipped';

export interface Task {
  id: number;
  userId: number;
  name: string;
  startTime: string;
  endTime: string;
  priority: TaskPriority;
  recurring: TaskRecurring;
  status: TaskStatus;
  completionNote?: string;
  color: string;
  createdAt: Date;
  completedAt?: Date;
  taskDate: string;
}

export interface CreateTaskInput {
  name: string;
  startTime: string;
  endTime: string;
  priority?: TaskPriority;
  recurring?: TaskRecurring;
  color?: string;
  taskDate?: string;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  status?: TaskStatus;
  completionNote?: string;
}

export interface CompleteTaskInput {
  status: 'completed' | 'partial' | 'skipped';
  completionNote?: string;
  actualDuration?: number;
  focusScore?: number;
}
