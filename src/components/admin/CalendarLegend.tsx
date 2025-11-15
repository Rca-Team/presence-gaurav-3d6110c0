
import React from 'react';
import { cn } from '@/lib/utils';
import { Check, Clock, X, Calendar } from 'lucide-react';

const CalendarLegend: React.FC = () => {
  const legendItems = [
    { label: 'Present', color: 'bg-[hsl(var(--school-green))]', icon: <Check className="h-3 w-3 text-white" /> },
    { label: 'Late', color: 'bg-[hsl(var(--school-yellow))]', icon: <Clock className="h-3 w-3 text-white" /> },
    { label: 'Absent', color: 'bg-[hsl(var(--school-red))]', icon: <X className="h-3 w-3 text-white" /> },
    { label: 'Today', color: 'bg-accent', icon: <Calendar className="h-3 w-3 text-accent-foreground" /> },
  ];

  return (
    <div className="mb-6 flex flex-wrap gap-4 justify-center">
      {legendItems.map((item, index) => (
        <div 
          key={index} 
          className={cn(
            "flex items-center px-3 py-1.5 rounded-full transition-all duration-300 hover:scale-105",
            "border border-muted shadow-sm bg-white/60 dark:bg-black/20 backdrop-blur-sm"
          )}
        >
          <div className={cn(
            "h-5 w-5 rounded-full mr-2 flex items-center justify-center", 
            item.color
          )}>
            {item.icon}
          </div>
          <span className="text-sm font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
};

export default CalendarLegend;
