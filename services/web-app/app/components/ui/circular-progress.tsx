import { Check, CheckCircle } from 'lucide-react';
import { cn } from '~/utils/misc';

interface CircularProgressProps {
  progress: number;
  index: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function sanitizeCircularProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

export function CircularProgress({
  progress,
  index,
  className,
  size = 'md',
}: CircularProgressProps) {
  const safeProgress = sanitizeCircularProgress(progress);
  const isCompleted = safeProgress >= 95;

  // Size configurations
  const sizeConfig = {
    sm: {
      container: 'w-8 h-8',
      stroke: 2,
      text: 'text-xs',
      check: 'w-3 h-3',
    },
    md: {
      container: 'w-12 h-12',
      stroke: 3,
      text: 'text-sm',
      check: 'w-4 h-4',
    },
    lg: {
      container: 'w-16 h-16',
      stroke: 4,
      text: 'text-base',
      check: 'w-5 h-5',
    },
  };

  const config = sizeConfig[size];
  const radius = size === 'sm' ? 14 : size === 'md' ? 20 : 26;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (safeProgress / 100) * circumference;

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        config.container,
        className
      )}
    >
      {/* Background circle */}
      <svg
        className="absolute inset-0 transform -rotate-90"
        width="100%"
        height="100%"
        viewBox={`0 0 ${radius * 2 + config.stroke * 2} ${radius * 2 + config.stroke * 2}`}
      >
        {/* Background track */}
        <circle
          cx={radius + config.stroke}
          cy={radius + config.stroke}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.stroke}
          className="text-muted-foreground/20"
        />

        {/* Progress arc */}
        <circle
          cx={radius + config.stroke}
          cy={radius + config.stroke}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.stroke}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            'transition-all duration-300 ease-in-out',
            isCompleted ? 'text-green-600' : 'text-primary'
          )}
        />
      </svg>

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center">
        {isCompleted ? (
          <Check className={cn(config.check, 'text-green-600')} />
        ) : (
          <span
            className={cn(
              'font-medium',
              config.text,
              safeProgress > 0 ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            {index}
          </span>
        )}
      </div>
    </div>
  );
}
