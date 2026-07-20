// Types for Container Apps Jobs API

export interface ContainerJobDto {
  name: string;
  triggerType: 'Schedule' | 'Manual';
  cronExpression?: string;
  replicaTimeout: number;
  replicaRetryLimit: number;
  containerImage: string;
  environmentVariables: Record<string, string>;
  latestExecution?: JobExecutionDto;
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
