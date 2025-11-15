import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  fetchSelectedFace, 
  fetchAttendanceRecords, 
  fetchDailyAttendance,
  generateWorkingDays,
  isDateInArray,
  FaceInfo
} from '../utils/attendanceUtils';
import { useAttendance } from '@/contexts/AttendanceContext';
import { format } from 'date-fns';

interface AttendanceRecord {
  id: string;
  timestamp: string;
  status: string;
  name?: string;
  image_url?: string;
}

export const useAttendanceCalendar = (selectedFaceId: string | null) => {
  const { toast } = useToast();
  const { recentAttendance } = useAttendance();
  
  const [attendanceDays, setAttendanceDays] = useState<Date[]>([]);
  const [lateAttendanceDays, setLateAttendanceDays] = useState<Date[]>([]);
  const [absentDays, setAbsentDays] = useState<Date[]>([]);
  const [selectedFace, setSelectedFace] = useState<FaceInfo | null>(null);
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  const [loading, setLoading] = useState(false);
  const [dailyAttendance, setDailyAttendance] = useState<AttendanceRecord[]>([]);
  
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord[]>>({});
  
  const currentDate = new Date();
  const [workingDays, setWorkingDays] = useState<Date[]>([]);

  useEffect(() => {
    if (selectedFaceId && recentAttendance.length > 0) {
      const faceRecords = recentAttendance.filter(record => 
        record.user_id === selectedFaceId || record.id === selectedFaceId
      );
      
      const knownFaceRecords = faceRecords.filter(record => 
        record.name !== 'User' && 
        record.name !== 'Unknown Student' && 
        !record.name.toLowerCase().includes('unknown')
      );
      
      if (knownFaceRecords.length > 0) {
        const presentDates: Date[] = [];
        const lateDates: Date[] = [];
        const recordsByDate: Record<string, AttendanceRecord[]> = {};
        
        knownFaceRecords.forEach(record => {
          const recordDate = new Date(record.timestamp);
          const dateWithoutTime = new Date(recordDate);
          dateWithoutTime.setHours(0, 0, 0, 0);
          
          const dateKey = format(dateWithoutTime, 'yyyy-MM-dd');
          
          if (!recordsByDate[dateKey]) {
            recordsByDate[dateKey] = [];
          }
          
          recordsByDate[dateKey].push({
            id: record.id,
            timestamp: record.timestamp,
            status: record.status,
            name: record.name
          });
          
          const dateExists = 
            presentDates.some(d => d.getTime() === dateWithoutTime.getTime()) || 
            lateDates.some(d => d.getTime() === dateWithoutTime.getTime());
            
          if (!dateExists) {
            if (record.status === 'Present' || record.status.toLowerCase().includes('present')) {
              presentDates.push(dateWithoutTime);
            } else if (record.status === 'Late' || record.status.toLowerCase().includes('late')) {
              lateDates.push(dateWithoutTime);
            }
          }
        });
        
        setAttendanceRecords(recordsByDate);
        
        if (presentDates.length > 0) {
          setAttendanceDays(prev => {
            const combined = [...prev];
            presentDates.forEach(date => {
              if (!isDateInArray(date, combined)) {
                combined.push(date);
              }
            });
            return combined;
          });
        }
        
        if (lateDates.length > 0) {
          setLateAttendanceDays(prev => {
            const combined = [...prev];
            lateDates.forEach(date => {
              if (!isDateInArray(date, combined)) {
                combined.push(date);
              }
            });
            return combined;
          });
        }
        
        if (selectedDate) {
          const selectedDateStart = new Date(selectedDate);
          selectedDateStart.setHours(0, 0, 0, 0);
          const selectedDateEnd = new Date(selectedDate);
          selectedDateEnd.setHours(23, 59, 59, 999);
          
          const recordsForSelectedDate = knownFaceRecords.filter(record => {
            const recordDate = new Date(record.timestamp);
            return recordDate >= selectedDateStart && recordDate <= selectedDateEnd;
          });
          
          if (recordsForSelectedDate.length > 0) {
            setDailyAttendance(recordsForSelectedDate.map(record => ({
              id: record.id,
              timestamp: record.timestamp,
              status: record.status.toLowerCase(),
              name: record.name,
              image_url: record.image_url
            })));
          }
        }
      }
    }
  }, [selectedFaceId, recentAttendance, selectedDate]);

  useEffect(() => {
    let attendanceChannel: any = null;

    if (selectedFaceId) {
      fetchFaceDetails(selectedFaceId);
      loadAttendanceRecords(selectedFaceId);
      
      setWorkingDays(generateWorkingDays(currentDate.getFullYear(), currentDate.getMonth()));

      attendanceChannel = supabase
        .channel(`attendance-calendar-${selectedFaceId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'attendance_records'
          }, 
          (payload) => {
            console.log('Real-time update received for attendance calendar:', payload);
            loadAttendanceRecords(selectedFaceId);
            if (selectedDate) {
              loadDailyAttendance(selectedFaceId, selectedDate);
            }
          }
        )
        .subscribe();

      console.log('Subscribed to real-time updates for attendance calendar');
    } else {
      setSelectedFace(null);
      setAttendanceDays([]);
      setLateAttendanceDays([]);
      setAbsentDays([]);
      setAttendanceRecords({});
    }

    return () => {
      if (attendanceChannel) {
        supabase.removeChannel(attendanceChannel);
        console.log('Unsubscribed from attendance calendar updates');
      }
    };
  }, [selectedFaceId]);

  useEffect(() => {
    if (selectedFaceId && selectedDate) {
      loadDailyAttendance(selectedFaceId, selectedDate);
    } else {
      setDailyAttendance([]);
    }
  }, [selectedFaceId, selectedDate]);

  useEffect(() => {
    if (workingDays.length > 0 && (attendanceDays.length > 0 || lateAttendanceDays.length > 0)) {
      const today = new Date();
      const absent = workingDays.filter(workDay => {
        if (workDay > today) return false;
        
        return !isDateInArray(workDay, attendanceDays) && !isDateInArray(workDay, lateAttendanceDays);
      });
      
      setAbsentDays(absent);
    }
  }, [workingDays, attendanceDays, lateAttendanceDays]);

  const fetchFaceDetails = async (faceId: string) => {
    try {
      const faceInfo = await fetchSelectedFace(faceId);
      setSelectedFace(faceInfo);
    } catch (error) {
      console.error('Error fetching face details:', error);
      toast({
        title: "Error",
        description: "Failed to load face details",
        variant: "destructive"
      });
    }
  };

  const loadAttendanceRecords = async (faceId: string) => {
    try {
      setLoading(true);
      await fetchAttendanceRecords(faceId, setAttendanceDays, setLateAttendanceDays);
      
      const { data: records } = await supabase
        .from('attendance_records')
        .select('id, timestamp, status, device_info, image_url')
        .or(`user_id.eq.${faceId},id.eq.${faceId}`)
        .order('timestamp', { ascending: false });
        
      if (records && records.length > 0) {
        const recordsByDate: Record<string, AttendanceRecord[]> = {};
        
        for (const record of records) {
          let name = selectedFace?.name || 'User';
          
          if (record.device_info) {
            try {
              const deviceInfo = typeof record.device_info === 'string' 
                ? JSON.parse(record.device_info) 
                : record.device_info;
              
              if (deviceInfo.metadata && deviceInfo.metadata.name) {
                name = deviceInfo.metadata.name;
              } else if (deviceInfo.name) {
                name = deviceInfo.name;
              }
            } catch (e) {
              console.error('Error parsing device_info:', e);
            }
          }
          
          if (name === 'User' || name === 'Unknown Student' || name.toLowerCase().includes('unknown')) {
            continue;
          }
          
          const recordDate = new Date(record.timestamp);
          const dateKey = format(recordDate, 'yyyy-MM-dd');
          
          if (!recordsByDate[dateKey]) {
            recordsByDate[dateKey] = [];
          }
          
          recordsByDate[dateKey].push({
            id: record.id,
            timestamp: record.timestamp,
            status: typeof record.status === 'string' ? record.status.toLowerCase() : 'unknown',
            name,
            image_url: (record as any).image_url
          });
        }
        
        setAttendanceRecords(recordsByDate);
      }
    } catch (error) {
      console.error('Error loading attendance records:', error);
      toast({
        title: "Error",
        description: "Failed to load attendance records",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDailyAttendance = async (faceId: string, date: Date) => {
    try {
      await fetchDailyAttendance(faceId, date, (records) => {
        const enhancedRecords = records.map(record => {
          const dateKey = format(new Date(record.timestamp), 'yyyy-MM-dd');
          const matchingRecords = attendanceRecords[dateKey] || [];
          const matchingRecord = matchingRecords.find(r => r.id === record.id);
          
          return {
            ...record,
            name: matchingRecord?.name || selectedFace?.name || 'User'
          };
        });
        
        setDailyAttendance(enhancedRecords);
      });
    } catch (error) {
      console.error('Error loading daily attendance:', error);
      toast({
        title: "Error",
        description: "Failed to load daily attendance details",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    let attendanceChannel: any = null;

    if (selectedFaceId) {
      fetchFaceDetails(selectedFaceId);
      loadAttendanceRecords(selectedFaceId);
      
      setWorkingDays(generateWorkingDays(currentDate.getFullYear(), currentDate.getMonth()));

      attendanceChannel = supabase
        .channel(`attendance-calendar-${selectedFaceId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'attendance_records'
          }, 
          (payload) => {
            console.log('Real-time update received for attendance calendar:', payload);
            loadAttendanceRecords(selectedFaceId);
            if (selectedDate) {
              loadDailyAttendance(selectedFaceId, selectedDate);
            }
          }
        )
        .subscribe();

      console.log('Subscribed to real-time updates for attendance calendar');
    } else {
      setSelectedFace(null);
      setAttendanceDays([]);
      setLateAttendanceDays([]);
      setAbsentDays([]);
      setAttendanceRecords({});
    }

    return () => {
      if (attendanceChannel) {
        supabase.removeChannel(attendanceChannel);
        console.log('Unsubscribed from attendance calendar updates');
      }
    };
  }, [selectedFaceId]);

  return {
    attendanceDays,
    lateAttendanceDays,
    absentDays,
    selectedFace,
    selectedDate,
    setSelectedDate,
    loading,
    dailyAttendance,
    workingDays,
    isDateInArray,
    attendanceRecords
  };
};
