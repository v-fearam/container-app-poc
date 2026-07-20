import { useState, useEffect } from 'react';
import { useJobsApi } from '../hooks/useJobsApi';
import type { ContainerJobDto } from '../types/jobs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Calendar, Check, X, Info } from 'lucide-react';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/es';

interface CronEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  job: ContainerJobDto;
  onScheduleUpdated: () => void;
}

export function CronEditorDialog({
  isOpen,
  onClose,
  job,
  onScheduleUpdated,
}: CronEditorDialogProps) {
  const { updateJobSchedule } = useJobsApi();
  const [cronExpression, setCronExpression] = useState(job.cronExpression || '');
  const [isValid, setIsValid] = useState(true);
  const [humanReadable, setHumanReadable] = useState('');
  const [nextExecutions, setNextExecutions] = useState<Date[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCronExpression(job.cronExpression || '');
  }, [job.cronExpression]);

  useEffect(() => {
    validateAndParseCron(cronExpression);
  }, [cronExpression]);

  const validateAndParseCron = (expression: string) => {
    if (!expression.trim()) {
      setIsValid(false);
      setHumanReadable('');
      setNextExecutions([]);
      return;
    }

    try {
      // Validate CRON expression with cronstrue (supports 5-part cron)
      const description = cronstrue.toString(expression, { locale: 'es', verbose: true });
      setHumanReadable(description);
      setIsValid(true);

      // Calculate next 5 executions (simplified preview)
      const next = calculateNextExecutions(expression, 5);
      setNextExecutions(next);
    } catch (error) {
      setIsValid(false);
      setHumanReadable('Expresión CRON inválida');
      setNextExecutions([]);
    }
  };

  const calculateNextExecutions = (expression: string, count: number): Date[] => {
    // Simplified calculation for common CRON patterns
    // For production, use a library like 'cron-parser' or 'node-cron'
    const executions: Date[] = [];
    const now = new Date();
    const parts = expression.split(' ');
    
    if (parts.length !== 5) return [];

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Handle simple pattern: */N * * * * (every N minutes)
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const intervalMinutes = parseInt(minute.substring(2), 10);
      let next = new Date(now);
      next.setMinutes(Math.ceil(next.getMinutes() / intervalMinutes) * intervalMinutes);
      next.setSeconds(0);
      next.setMilliseconds(0);

      for (let i = 0; i < count; i++) {
        executions.push(new Date(next));
        next = new Date(next.getTime() + intervalMinutes * 60 * 1000);
      }
    } else if (minute !== '*' && hour !== '*') {
      // Handle pattern: M H * * * (daily at specific time)
      const targetMinute = parseInt(minute, 10);
      const targetHour = parseInt(hour, 10);
      let next = new Date(now);
      next.setHours(targetHour, targetMinute, 0, 0);

      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      for (let i = 0; i < count; i++) {
        executions.push(new Date(next));
        next.setDate(next.getDate() + 1);
      }
    } else {
      // Fallback: just show hourly intervals for preview
      let next = new Date(now);
      next.setMinutes(0);
      next.setSeconds(0);
      next.setHours(next.getHours() + 1);

      for (let i = 0; i < count; i++) {
        executions.push(new Date(next));
        next.setHours(next.getHours() + 1);
      }
    }

    return executions;
  };

  const handleSave = async () => {
    if (!isValid || !cronExpression.trim()) return;

    setIsSaving(true);
    try {
      await updateJobSchedule(job.name, { cronExpression });
      onScheduleUpdated();
      onClose();
    } catch (error) {
      console.error('Failed to update schedule:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const presetSchedules = [
    { label: 'Cada 5 minutos', value: '*/5 * * * *' },
    { label: 'Cada 15 minutos', value: '*/15 * * * *' },
    { label: 'Cada hora', value: '0 * * * *' },
    { label: 'Cada 6 horas', value: '0 */6 * * *' },
    { label: 'Diario a las 9:00', value: '0 9 * * *' },
    { label: 'Diario a medianoche', value: '0 0 * * *' },
  ];

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Editar Frecuencia
          </DialogTitle>
          <DialogDescription>
            Job: <span className="font-semibold text-slate-900 dark:text-white">{job.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* CRON Expression Input */}
          <div className="space-y-2">
            <Label htmlFor="cron-expression">Expresión CRON</Label>
            <Input
              id="cron-expression"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="*/5 * * * *"
              className={`font-mono ${!isValid && cronExpression ? 'border-red-500' : ''}`}
            />
            {humanReadable && (
              <p className={`text-sm flex items-start gap-2 ${isValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isValid ? <Check className="w-4 h-4 mt-0.5" /> : <X className="w-4 h-4 mt-0.5" />}
                {humanReadable}
              </p>
            )}
          </div>

          {/* Preset Schedules */}
          <div className="space-y-2">
            <Label>Frecuencias Predefinidas</Label>
            <div className="flex flex-wrap gap-2">
              {presetSchedules.map((preset) => (
                <Badge
                  key={preset.value}
                  variant={cronExpression === preset.value ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-primary/10"
                  onClick={() => setCronExpression(preset.value)}
                >
                  {preset.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Next Executions Preview */}
          {nextExecutions.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                Próximas Ejecuciones
              </Label>
              <div className="space-y-1.5 bg-slate-50 dark:bg-slate-900/50 rounded-md p-3">
                {nextExecutions.map((execution, index) => (
                  <div
                    key={index}
                    className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2"
                  >
                    <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">
                      {index + 1}.
                    </span>
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {formatDateTime(execution)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CRON Format Help */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm">
            <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Formato CRON: <span className="font-mono">minuto hora día mes día-semana</span>
            </p>
            <ul className="text-blue-700 dark:text-blue-300 space-y-0.5 text-xs">
              <li><span className="font-mono">*/5 * * * *</span> - Cada 5 minutos</li>
              <li><span className="font-mono">0 9 * * *</span> - Diario a las 9:00</li>
              <li><span className="font-mono">0 */6 * * *</span> - Cada 6 horas</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
