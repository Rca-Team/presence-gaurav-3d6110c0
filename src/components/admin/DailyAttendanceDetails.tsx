
import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { UserCheck, Clock, X, User } from 'lucide-react';
import { useAttendance } from '@/contexts/AttendanceContext';

interface DailyAttendanceDetailsProps {
  selectedDate: Date | undefined;
  dailyAttendance: {
    id: string;
    timestamp: string;
    status: string;
    name?: string;
    image_url?: string;
  }[];
  isDateInArray: (date: Date, dateArray: Date[]) => boolean;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
}

const DailyAttendanceDetails: React.FC<DailyAttendanceDetailsProps> = ({
  selectedDate,
  dailyAttendance,
  isDateInArray,
  attendanceDays = [],
  lateAttendanceDays = [],
  absentDays = []
}) => {
  const { recentAttendance } = useAttendance();

  // Format time to 12-hour format with AM/PM
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'h:mm a');
  };

  // Format full date and time
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'MMM d, yyyy h:mm a');
  };

  // Format date to show day of week and date
  const formatDateWithDay = (date: Date) => {
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  // Check if the selected date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  // Check if the selected date is in the future
  const isFutureDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date > today;
  };

  // Filter out unknown faces from attendance records
  const filterKnownFaces = (records: any[]) => {
    return records.filter(record => {
      const name = record.name || '';
      return name !== '' && 
             name !== 'User' && 
             name !== 'Unknown Student' && 
             !name.toLowerCase().includes('unknown');
    });
  };

  // Group attendance records by person's name
  const groupByName = (records: any[]) => {
    const grouped: Record<string, any[]> = {};
    
    records.forEach(record => {
      const name = record.name || 'Unknown';
      if (!grouped[name]) {
        grouped[name] = [];
      }
      grouped[name].push(record);
    });
    
    return grouped;
  };

  // Check for real-time attendance from recent records
  const getRealtimeAttendance = () => {
    if (!selectedDate || recentAttendance.length === 0) return null;
    
    const selectedDateStart = new Date(selectedDate);
    selectedDateStart.setHours(0, 0, 0, 0);
    const selectedDateEnd = new Date(selectedDate);
    selectedDateEnd.setHours(23, 59, 59, 999);
    
    // Get the name of the currently selected user from dailyAttendance
    const selectedUserName = dailyAttendance.length > 0 ? dailyAttendance[0].name : null;
    
    // Filter records by date AND name
    const filteredRecords = recentAttendance.filter(record => {
      const recordDate = new Date(record.timestamp);
      const matchesDate = recordDate >= selectedDateStart && recordDate <= selectedDateEnd;
      const matchesName = !selectedUserName || record.name === selectedUserName;
      
      // Filter out unknown names
      const isKnownFace = record.name && 
                         record.name !== 'User' && 
                         record.name !== 'Unknown Student' && 
                         !record.name.toLowerCase().includes('unknown');
      
      return matchesDate && matchesName && isKnownFace;
    });
    
    return filteredRecords;
  };

  if (!selectedDate) return null;

  // Check if there are attendance records for this date
  const hasAttendanceRecords = dailyAttendance && dailyAttendance.length > 0;
  const realtimeRecords = getRealtimeAttendance();
  const hasRealtimeRecords = realtimeRecords && realtimeRecords.length > 0;
  
  // Filter out unknown faces from dailyAttendance
  const filteredDailyAttendance = filterKnownFaces(dailyAttendance);
  const hasFilteredAttendanceRecords = filteredDailyAttendance.length > 0;
  
  // Group attendance by name
  const groupedDailyAttendance = groupByName(filteredDailyAttendance);
  const groupedRealtimeAttendance = realtimeRecords ? groupByName(realtimeRecords) : {};
  
  // Check if the date is in any of the attendance arrays (present, late, absent)
  const isPresentDate = isDateInArray(selectedDate, attendanceDays);
  const isLateDate = isDateInArray(selectedDate, lateAttendanceDays);
  const isAbsentDate = isDateInArray(selectedDate, absentDays);

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="font-medium mb-2 flex items-center">
        {formatDateWithDay(selectedDate)}
        {isToday(selectedDate) && (
          <span className="ml-2 text-sm text-green-500 flex items-center">
            (Today)
          </span>
        )}
      </h3>
      
      {isFutureDate(selectedDate) ? (
        <p className="text-sm text-muted-foreground">Future date selected. No attendance data available yet.</p>
      ) : hasRealtimeRecords ? (
        <div className="space-y-4">
          {/* Group by person name */}
          {Object.entries(groupedRealtimeAttendance).map(([name, records]) => (
            <div key={name} className="bg-muted/30 rounded-md p-3">
              <div className="flex items-center gap-3 mb-2">
                <img 
                  src={records[0]?.image_url && records[0].image_url.startsWith('data:') 
                    ? records[0].image_url 
                    : records[0]?.image_url
                      ? `https://tegpyalokurixuvgeuks.supabase.co/storage/v1/object/public/face-images/${records[0].image_url}`
                      : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=32`
                  } 
                  alt={name} 
                  className="h-8 w-8 rounded-full object-cover border-2 border-border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=32`;
                  }}
                />
                <h4 className="font-medium text-sm">{name}</h4>
              </div>
              <div className="space-y-2">
                {records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md animate-fade-in">
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        {record.status === 'Late' ? (
                          <Clock className="h-4 w-4 text-amber-500 mr-2" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-green-500 mr-2" />
                        )}
                        <span className="text-sm text-muted-foreground">
                          {formatTime(record.timestamp)}
                        </span>
                      </div>
                    </div>
                    <Badge variant={record.status === 'Late' ? "outline" : "default"}>
                      {record.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : hasFilteredAttendanceRecords ? (
        <div className="space-y-4">
          {/* Group by person name */}
          {Object.entries(groupedDailyAttendance).map(([name, records]) => (
            <div key={name} className="bg-muted/30 rounded-md p-3">
              <div className="flex items-center gap-3 mb-2">
                <img 
                  src={records[0]?.image_url && records[0].image_url.startsWith('data:') 
                    ? records[0].image_url 
                    : records[0]?.image_url
                      ? `https://tegpyalokurixuvgeuks.supabase.co/storage/v1/object/public/face-images/${records[0].image_url}`
                      : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=32`
                  } 
                  alt={name} 
                  className="h-8 w-8 rounded-full object-cover border-2 border-border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=32`;
                  }}
                />
                <h4 className="font-medium text-sm">{name}</h4>
              </div>
              <div className="space-y-2">
                {records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md animate-fade-in">
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        {record.status === 'late' ? (
                          <Clock className="h-4 w-4 text-amber-500 mr-2" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-green-500 mr-2" />
                        )}
                        <span className="text-sm text-muted-foreground">
                          {formatTime(record.timestamp)}
                        </span>
                      </div>
                    </div>
                    <Badge variant={record.status === 'late' ? "outline" : "default"}>
                      {record.status === 'late' ? 'Late' : 'Present'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : isPresentDate ? (
        <div className="flex items-center justify-center p-4 bg-green-50 rounded-md animate-fade-in">
          <UserCheck className="h-5 w-5 text-green-500 mr-2" />
          <span className="text-green-500 font-medium">Present</span>
        </div>
      ) : isLateDate ? (
        <div className="flex items-center justify-center p-4 bg-amber-50 rounded-md animate-fade-in">
          <Clock className="h-5 w-5 text-amber-500 mr-2" />
          <span className="text-amber-500 font-medium">Late</span>
        </div>
      ) : isAbsentDate ? (
        <div className="flex items-center justify-center p-4 bg-red-50 rounded-md animate-fade-in">
          <X className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-500 font-medium">Absent</span>
        </div>
      ) : (
        <div className="flex items-center justify-center p-4 bg-red-50 rounded-md animate-fade-in">
          <X className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-500 font-medium">Absent</span>
        </div>
      )}
    </div>
  );
};

export default DailyAttendanceDetails;
