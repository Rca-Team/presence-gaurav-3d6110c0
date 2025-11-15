
import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import CalendarLegend from './CalendarLegend';
import { cn } from '@/lib/utils';
import { UserCheck, Clock, X } from 'lucide-react';
import { format } from 'date-fns';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AttendanceRecord {
  name?: string;
  timestamp: string;
  status: string;
}

interface AttendanceCalendarViewProps {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
  attendanceRecords?: Record<string, AttendanceRecord[]>;
}

const AttendanceCalendarView: React.FC<AttendanceCalendarViewProps> = ({
  selectedDate,
  setSelectedDate,
  attendanceDays,
  lateAttendanceDays,
  absentDays,
  attendanceRecords = {}
}) => {
  // Get current date for today indicator
  const today = new Date();
  // Get current month for default display
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  // Helper function to get formatted date key from Date object
  const getDateKey = (date: Date) => {
    return format(date, 'yyyy-MM-dd');
  };
  
  // Helper function to render the day content with icons and tooltips
  const renderDayContent = (day: Date) => {
    const dateKey = getDateKey(day);
    const records = attendanceRecords[dateKey] || [];
    
    const isPresentDay = attendanceDays.some(d => 
      d.getDate() === day.getDate() && 
      d.getMonth() === day.getMonth() && 
      d.getFullYear() === day.getFullYear()
    );
    
    const isLateDay = lateAttendanceDays.some(d => 
      d.getDate() === day.getDate() && 
      d.getMonth() === day.getMonth() && 
      d.getFullYear() === day.getFullYear()
    );
    
    const isAbsentDay = absentDays.some(d => 
      d.getDate() === day.getDate() && 
      d.getMonth() === day.getMonth() && 
      d.getFullYear() === day.getFullYear()
    );

    let icon = null;
    let tooltipContent = null;

    if (isPresentDay) {
      icon = <UserCheck className="h-3.5 w-3.5 text-white z-10" />;
      
      if (records.length > 0) {
        const recordInfo = records.find(r => r.status.toLowerCase().includes('present'));
        if (recordInfo) {
          const userName = recordInfo.name || 'Student';
          const attendanceTime = format(new Date(recordInfo.timestamp), 'h:mm a');
          tooltipContent = `${userName} - Present at ${attendanceTime}`;
        } else {
          tooltipContent = 'Present';
        }
      } else {
        tooltipContent = 'Present';
      }
    } else if (isLateDay) {
      icon = <Clock className="h-3.5 w-3.5 text-white z-10" />;
      
      if (records.length > 0) {
        const recordInfo = records.find(r => r.status.toLowerCase().includes('late'));
        if (recordInfo) {
          const userName = recordInfo.name || 'Student';
          const attendanceTime = format(new Date(recordInfo.timestamp), 'h:mm a');
          tooltipContent = `${userName} - Late at ${attendanceTime}`;
        } else {
          tooltipContent = 'Late';
        }
      } else {
        tooltipContent = 'Late';
      }
    } else if (isAbsentDay) {
      icon = <X className="h-3.5 w-3.5 text-white z-10" />;
      tooltipContent = 'Absent';
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {icon}
              </div>
              <span className="z-20">{day.getDate()}</span>
            </div>
          </TooltipTrigger>
          {tooltipContent && (
            <TooltipContent>
              <p>{tooltipContent}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  };
  
  return (
    <div className="flex flex-col items-center animate-fade-in relative school-card p-4">
      {/* School-themed animated background */}
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--school-blue))]/5 to-[hsl(var(--school-purple))]/5 rounded-xl opacity-70 animate-pulse-subtle -z-10"></div>
      
      <CalendarLegend />
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={setSelectedDate}
        className="rounded-md border shadow-sm bg-white/50 dark:bg-black/20 backdrop-blur-sm"
        modifiersStyles={{
          present: { 
            backgroundColor: "hsl(var(--school-green))", 
            color: "white",
            transform: "scale(1.15)",
            boxShadow: "0 8px 16px -2px rgba(34, 197, 94, 0.3)",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
          },
          late: { 
            backgroundColor: "hsl(var(--school-yellow))", 
            color: "black",
            transform: "scale(1.15)",
            boxShadow: "0 8px 16px -2px rgba(245, 158, 11, 0.3)",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
          },
          absent: {
            backgroundColor: "hsl(var(--school-red))", 
            color: "white",
            transform: "scale(1.15)",
            boxShadow: "0 8px 16px -2px rgba(239, 68, 68, 0.3)",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
          },
          today: {
            backgroundColor: "hsl(var(--accent))",
            color: "hsl(var(--accent-foreground))",
            borderWidth: "2px",
            borderColor: "hsl(var(--school-blue))",
            boxShadow: "0 0 15px 2px rgba(0, 120, 255, 0.3)",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
          }
        }}
        components={{
          DayContent: ({ date }) => renderDayContent(date)
        }}
        modifiers={{
          present: attendanceDays || [],
          late: lateAttendanceDays || [],
          absent: absentDays || [],
          today: [today]
        }}
        defaultMonth={currentMonth}
        classNames={{
          day: cn(
            "relative transition-all duration-300 hover:scale-125 hover:rotate-3 hover:font-bold z-10"
          )
        }}
      />
      
      {/* School decorative dots */}
      <div className="flex justify-center gap-3 mt-4">
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--school-blue))]"></div>
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--school-green))]"></div>
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--school-yellow))]"></div>
      </div>
    </div>
  );
};

export default AttendanceCalendarView;
