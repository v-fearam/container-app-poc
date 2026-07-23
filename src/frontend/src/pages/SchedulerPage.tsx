import { useEffect, useState } from 'react';
import { useJobsApi } from '../hooks/useJobsApi';
import type { ContainerJobDto, JobExecutionDto } from '../types/jobs';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Badge } from '../components/ui/badge';
import { Calendar, Clock, Play, RefreshCw, Settings, StopCircle } from 'lucide-react';
import { CronEditorDialog } from '../components/CronEditorDialog';

export function SchedulerPage() {
  const { listJobs, triggerJob, listExecutions, stopExecution, isLoading } = useJobsApi();
  const [jobs, setJobs] = useState<ContainerJobDto[]>([]);
  const [selectedJob, setSelectedJob] = useState<ContainerJobDto | null>(null);
  const [isCronDialogOpen, setIsCronDialogOpen] = useState(false);
  const [triggeringJob, setTriggeringJob] = useState<string | null>(null);
  const [stoppingExecution, setStoppingExecution] = useState<{ jobName: string; executionName: string } | null>(null);
  const [runningExecutions, setRunningExecutions] = useState<Map<string, JobExecutionDto>>(new Map());

  const loadJobs = async () => {
    try {
      const data = await listJobs();
      setJobs(data);
      
      // Para cada job con status Running, obtener el executionName
      for (const job of data) {
        if (job.lastExecutionStatus === 'Running') {
          await loadRunningExecution(job.name);
        }
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const loadRunningExecution = async (jobName: string) => {
    try {
      const executions = await listExecutions(jobName, 'Running');
      if (executions.length > 0) {
        setRunningExecutions(prev => new Map(prev).set(jobName, executions[0]));
      }
    } catch (error) {
      console.error(`Failed to load running execution for ${jobName}:`, error);
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
      await loadJobs();
    } catch (error) {
      console.error('Failed to trigger job:', error);
    } finally {
      setTriggeringJob(null);
    }
  };

  const handleStopExecutionClick = (jobName: string) => {
    const execution = runningExecutions.get(jobName);
    if (execution) {
      setStoppingExecution({ jobName, executionName: execution.name });
    }
  };

  const confirmStopExecution = async () => {
    if (!stoppingExecution) return;

    try {
      await stopExecution(stoppingExecution.jobName, stoppingExecution.executionName);
      // Reload jobs to show updated status
      await loadJobs();
    } catch (error) {
      console.error('Failed to stop execution:', error);
    } finally {
      setStoppingExecution(null);
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
                      <Badge variant={job.type === 'Schedule' ? 'default' : 'outline'}>
                        {job.type === 'Schedule' ? (
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
                    <TableCell>
                      {job.lastExecutionTime
                        ? formatDateTime(job.lastExecutionTime)
                        : 'Nunca'}
                    </TableCell>
                    <TableCell>
                      {job.lastExecutionStatus
                        ? formatExecutionStatus(job.lastExecutionStatus)
                        : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.type === 'Schedule' && (
                          <Button
                            onClick={() => handleEditSchedule(job)}
                            variant="ghost"
                            size="sm"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        )}
                        {job.lastExecutionStatus === 'Running' && runningExecutions.has(job.name) && (
                          <Button
                            onClick={() => handleStopExecutionClick(job.name)}
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <StopCircle className="w-4 h-4" />
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

      <AlertDialog open={!!stoppingExecution} onOpenChange={() => setStoppingExecution(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Detener ejecución?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción enviará SIGTERM al job en ejecución. El job puede tardar
              hasta 30 segundos en detenerse completamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStopExecution}>
              Detener
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
