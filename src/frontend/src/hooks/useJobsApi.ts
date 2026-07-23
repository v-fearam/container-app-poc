import { useState } from 'react';
import { useApi } from './useApi';
import type {
  ContainerJobDto,
  UpdateJobScheduleRequest,
  TriggerJobResponse,
  StopExecutionResponse,
  JobExecutionDto,
  JobExecutionCounter
} from '../types/jobs';

export function useJobsApi() {
  const { get, patch, post } = useApi();
  const [isLoading, setIsLoading] = useState(false);

  const listJobs = async (): Promise<ContainerJobDto[]> => {
    setIsLoading(true);
    try {
      return await get<ContainerJobDto[]>('/api/jobs');
    } finally {
      setIsLoading(false);
    }
  };

  const getJob = async (name: string): Promise<ContainerJobDto> => {
    setIsLoading(true);
    try {
      return await get<ContainerJobDto>(`/api/jobs/${encodeURIComponent(name)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const updateJobSchedule = async (
    name: string,
    request: UpdateJobScheduleRequest
  ): Promise<ContainerJobDto> => {
    setIsLoading(true);
    try {
      return await patch<ContainerJobDto>(
        `/api/jobs/${encodeURIComponent(name)}/schedule`,
        request
      );
    } finally {
      setIsLoading(false);
    }
  };

  const triggerJob = async (name: string): Promise<TriggerJobResponse> => {
    setIsLoading(true);
    try {
      return await post<TriggerJobResponse>(
        `/api/jobs/${encodeURIComponent(name)}/trigger`,
        {}
      );
    } finally {
      setIsLoading(false);
    }
  };

  const listExecutions = async (
    jobName: string,
    status?: string
  ): Promise<JobExecutionDto[]> => {
    setIsLoading(true);
    try {
      const params = status ? `?status=${encodeURIComponent(status)}` : '';
      return await get<JobExecutionDto[]>(
        `/api/jobs/${encodeURIComponent(jobName)}/executions${params}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const stopExecution = async (
    jobName: string,
    executionName: string
  ): Promise<StopExecutionResponse> => {
    setIsLoading(true);
    try {
      return await post<StopExecutionResponse>(
        `/api/jobs/${encodeURIComponent(jobName)}/executions/${encodeURIComponent(executionName)}/stop`,
        {}
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getJobExecutionCounters = async (): Promise<JobExecutionCounter[]> => {
    setIsLoading(true);
    try {
      return await get<JobExecutionCounter[]>('/api/dashboard/job-executions');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    listJobs,
    getJob,
    updateJobSchedule,
    triggerJob,
    listExecutions,
    stopExecution,
    getJobExecutionCounters
  };
}
