
import { supabase } from '@/integrations/supabase/client';
import { SetDatesFunction, AttendanceRecord } from './types';

// Type guard to check if an object is a record with metadata
function hasMetadata(obj: any): obj is { metadata: any } {
  return obj && typeof obj === 'object' && 'metadata' in obj;
}

// Type guard to check if an object has a name property
function hasName(obj: any): obj is { name: string } {
  return obj && typeof obj === 'object' && 'name' in obj;
}

// Fetch attendance records from Supabase with improved status normalization
export const fetchAttendanceRecords = async (
  faceId: string,
  setAttendanceDays: SetDatesFunction,
  setLateAttendanceDays: SetDatesFunction
) => {
  try {
    console.log('Fetching attendance records for face ID:', faceId);
    
    // First try to fetch records where id equals faceId
    let { data: recordsById, error: errorById } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('id', faceId);
    
    // Then try to fetch records where user_id equals faceId
    let { data: recordsByUserId, error: errorByUserId } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', faceId);
    
    // Combine the results
    let allRecords = [...(recordsById || []), ...(recordsByUserId || [])];
    
    if (allRecords.length === 0) {
      console.log('No records found for face ID:', faceId);
      setAttendanceDays([]);
      setLateAttendanceDays([]);
      return;
    }
    
    console.log('Total records found:', allRecords.length);
    
    // Normalize all status values to lowercase for consistent processing
    allRecords = allRecords.map(record => ({
      ...record,
      status: typeof record.status === 'string' ? record.status.toLowerCase() : record.status
    }));
    
    // Filter out records for unknown faces
    allRecords = allRecords.filter(record => {
      // Extract name information from device_info if available
      let name = '';
      try {
        const deviceInfo = record.device_info;
        if (deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
          // Type-safe access to metadata
          if (hasMetadata(deviceInfo) && deviceInfo.metadata) {
            if (hasMetadata(deviceInfo.metadata) && hasName(deviceInfo.metadata)) {
              name = deviceInfo.metadata.name;
            }
          }
          // Direct name property on device_info
          if (hasName(deviceInfo)) {
            name = deviceInfo.name;
          }
        }
      } catch (e) {
        console.error('Error extracting name from device_info:', e);
      }
      
      // Filter out records with unknown names
      return name !== '' && 
             name !== 'User' && 
             name !== 'Unknown Student' && 
             !name.toLowerCase().includes('unknown');
    });
    
    console.log('Records after filtering unknown faces:', allRecords.length);
    
    // Filter records with normalized status check (includes present, Present)
    const presentRecords = allRecords.filter(record => 
      record.status === 'present' || 
      record.status === 'unauthorized' // Include unauthorized as present for backward compatibility
    );
    
    // Filter for 'late' status records (includes late, Late)
    const lateRecords = allRecords.filter(record => 
      record.status === 'late'
    );
    
    console.log('Present records:', presentRecords.length);
    console.log('Late records:', lateRecords.length);
    
    if (presentRecords.length > 0) {
      // Convert timestamps to Date objects for the calendar
      const days = presentRecords
        .map(record => record.timestamp ? new Date(record.timestamp) : null)
        .filter(date => date !== null) as Date[];
      
      console.log('Setting present days:', days.length);
      setAttendanceDays(days);
    } else {
      setAttendanceDays([]);
    }
    
    if (lateRecords.length > 0) {
      const lateDays = lateRecords
        .map(record => record.timestamp ? new Date(record.timestamp) : null)
        .filter(date => date !== null) as Date[];
      
      console.log('Setting late days:', lateDays.length);
      setLateAttendanceDays(lateDays);
    } else {
      setLateAttendanceDays([]);
    }
  } catch (error) {
    console.error('Error in fetchAttendanceRecords:', error);
    throw error;
  }
};

// Fetch daily attendance for a specific date with improved status normalization
export const fetchDailyAttendance = async (
  faceId: string, 
  date: Date,
  setDailyAttendance: (records: AttendanceRecord[]) => void
) => {
  try {
    console.log('Fetching daily attendance for date:', date);
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Use a more inclusive timestamp range query
    const timestampStart = startOfDay.toISOString();
    const timestampEnd = endOfDay.toISOString();
    
    console.log(`Querying from ${timestampStart} to ${timestampEnd}`);
    
    // First try to fetch records where id equals faceId
    let { data: recordsById, error: errorById } = await supabase
      .from('attendance_records')
      .select('id, timestamp, status, device_info, user_id, image_url')  // Include image_url
      .eq('id', faceId)
      .gte('timestamp', timestampStart)
      .lte('timestamp', timestampEnd)
      .order('timestamp', { ascending: true });
    
    // Then try to fetch records where user_id equals faceId
    let { data: recordsByUserId, error: errorByUserId } = await supabase
      .from('attendance_records')
      .select('id, timestamp, status, device_info, user_id, image_url')  // Include image_url
      .eq('user_id', faceId)
      .gte('timestamp', timestampStart)
      .lte('timestamp', timestampEnd)
      .order('timestamp', { ascending: true });
    
    // Combine the results
    let allRecords = [...(recordsById || []), ...(recordsByUserId || [])];
    
    if (allRecords.length > 0) {
      console.log('Daily attendance records found:', allRecords.length);
      
      // Get names from device_info where available
      const normalizedRecords = await Promise.all(allRecords.map(async (record) => {
        let name = 'User';
        
        // Try to extract name from device_info
        if (record.device_info) {
          try {
            const deviceInfo = typeof record.device_info === 'string' 
              ? JSON.parse(record.device_info) 
              : record.device_info;
            
            if (typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
              // Type-safe access to metadata
              if (hasMetadata(deviceInfo) && deviceInfo.metadata) {
                if (hasName(deviceInfo.metadata)) {
                  name = deviceInfo.metadata.name;
                }
              } 
              // Direct name property on device_info
              if (hasName(deviceInfo)) {
                name = deviceInfo.name;
              }
            }
          } catch (e) {
            console.error('Error parsing device_info:', e);
          }
        }
        
        // If we couldn't find name in device_info, try to get it from profiles table
        if (name === 'User') {
          try {
            // First try to get the user_id if this record doesn't have it directly
            const userId = record.user_id || faceId;
            
            if (userId) {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', userId)
                .maybeSingle();
                
              if (profileData && profileData.username) {
                name = profileData.username;
              }
            }
          } catch (e) {
            console.error('Error fetching profile data:', e);
          }
        }
        
        return {
          ...record,
          name,
          image_url: (record as any).image_url,
          status: typeof record.status === 'string' ? 
            record.status.toLowerCase() === 'unauthorized' ? 'present' : record.status.toLowerCase() 
            : 'unknown'
        };
      }));
      
      // Filter out unknown faces - only include faces with meaningful names
      const knownFaces = normalizedRecords.filter(record => 
        record.name !== 'User' && 
        record.name !== 'Unknown Student' &&
        !record.name.toLowerCase().includes('unknown')
      );
      
      console.log('Filtered out unknown faces:', normalizedRecords.length - knownFaces.length);
      
      setDailyAttendance(knownFaces);
    } else {
      setDailyAttendance([]);
    }
  } catch (error) {
    console.error('Error in fetchDailyAttendance:', error);
    throw error;
  }
};
