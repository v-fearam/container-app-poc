// Types for Container Apps Jobs API

export interface ContainerJobDto {
  name: string;
  type: 'Schedule' | 'Manual';
  cronExpression?: string;
  lastExecutionTime?: string;
  lastExecutionStatus?: 'Pending' | 'Running' | 'Succeeded' | 'Failed';
  messageCount: number;
}

export interface JobExecutionDto {
  name: string;
  status: 'Pending' | 'Running' | 'Succeeded' | 'Failed';
  startTime?: string;
  endTime?: string;
}

export interface UpdateJobScheduleRequest {
  cronExpression: string;
}

export interface TriggerJobResponse {
  executionName: string;
  message: string;
}

export interface JobExecutionCounter {
  jobName: string;
  date: string;
  totalExecutions: number;
}
