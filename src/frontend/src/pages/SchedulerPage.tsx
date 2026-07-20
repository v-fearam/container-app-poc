import { useEffect, useState } from 'react';
import { useJobsApi } from '../hooks/useJobsApi';
import type { ContainerJobDto } from '../types/jobs';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Calendar, Clock, Play, RefreshCw, Settings } from 'lucide-react';
import { CronEditorDialog } from '../components/CronEditorDialog';

export function SchedulerPage() {
  const { listJobs, triggerJob, isLoading } = useJobsApi();
  const [jobs, setJobs] = useState<ContainerJobDto[]>([]);
  const [selectedJob, setSelectedJob] = useState<ContainerJobDto | null>(null);
  const [isCronDialogOpen, setIsCronDialogOpen] = useState(false);
  const [triggeringJob, setTriggeringJob] = useState<string | null>(null);

  const loadJobs = async () => {
    try {
      const data = await listJobs();
      setJobs(data);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleEditSchedule = (job: ContainerJobDto) => {
    setSelectedJob(job);
    setIsCronDialogOpen(true);
  };

  const handleTriggerJob = async (jobName: string) => {
    setTriggeringJob(jobName);
    try {
      await triggerJob(jobName);
      // Reload jobs to show latest execution
      await loadJobs();
    } catch (error) {
      console.error('Failed to trigger job:', error);
    } finally {
      setTriggeringJob(null);
    }
  };

  const formatExecutionStatus = (status: string | undefined) => {
    if (!status) return null;
    
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      Running: 'default',
      Succeeded: 'secondary',
      Failed: 'destructive',
      Pending: 'outline',
    };

    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const formatDateTime = (dateStr: string | undefined) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  };

  const getMessageCount = (envVars: Record<string, string>) => {
    return envVars['MESSAGE_COUNT'] || 'N/A';
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Calendar className="w-8 h-8 text-primary" />
            Scheduler
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Gestión de Container Apps Jobs programados
          </p>
        </div>
        <Button
          onClick={loadJobs}
          disabled={isLoading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jobs Activos</CardTitle>
          <CardDescription>
            Container Apps Jobs configurados en el ambiente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 && !isLoading && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay jobs configurados</p>
            </div>
          )}

          {jobs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Mensajes/Ejecución</TableHead>
                  <TableHead>Última Ejecución</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.name}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>
                      <Badge variant={job.triggerType === 'Schedule' ? 'default' : 'outline'}>
                        {job.triggerType === 'Schedule' ? (
                          <>
                            <Clock className="w-3 h-3 mr-1" />
                            Programado
                          </>
                        ) : (
                          'Manual'
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {job.cronExpression || 'N/A'}
                    </TableCell>
                    <TableCell>{getMessageCount(job.environmentVariables)}</TableCell>
                    <TableCell>
                      {job.latestExecution?.startTime
                        ? formatDateTime(job.latestExecution.startTime)
                        : 'Nunca'}
                    </TableCell>
                    <TableCell>
                      {job.latestExecution
                        ? formatExecutionStatus(job.latestExecution.status)
                        : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.triggerType === 'Schedule' && (
                          <Button
                            onClick={() => handleEditSchedule(job)}
                            variant="ghost"
                            size="sm"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          onClick={() => handleTriggerJob(job.name)}
                          disabled={triggeringJob === job.name}
                          variant="outline"
                          size="sm"
                        >
                          {triggeringJob === job.name ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedJob && (
        <CronEditorDialog
          isOpen={isCronDialogOpen}
          onClose={() => {
            setIsCronDialogOpen(false);
            setSelectedJob(null);
          }}
          job={selectedJob}
          onScheduleUpdated={loadJobs}
        />
      )}
    </div>
  );
}
