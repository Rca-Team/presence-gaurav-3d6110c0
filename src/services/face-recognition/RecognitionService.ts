import { supabase } from '@/integrations/supabase/client';
import { descriptorToString, stringToDescriptor } from './ModelService';
import { getAttendanceCutoffTime } from '../attendance/AttendanceSettingsService';

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  position: string;
  firebase_image_url: string;
}

interface RecognitionResult {
  recognized: boolean;
  employee?: Employee;
  confidence?: number;
}

// Fixed interface for DeviceInfo properly defining the structure
interface DeviceInfo {
  metadata?: {
    name?: string;
    employee_id?: string;
    department?: string;
    position?: string;
    firebase_image_url?: string;
    faceDescriptor?: string;
  };
  type?: string;
  timestamp?: string;
  registration?: boolean;
  firebase_image_url?: string; // For the unrecognized face case
}

export async function recognizeFace(faceDescriptor: Float32Array): Promise<RecognitionResult> {
  try {
    console.log('Starting face recognition process');
    
    // Convert the descriptor to a string for comparison
    const faceDescriptorString = descriptorToString(faceDescriptor);
    
    // Query registered faces from attendance_records (registered or pending_approval)
    const { data, error } = await supabase
      .from('attendance_records')
      .select('id, user_id, status, device_info, face_descriptor')
      .in('status', ['registered', 'pending_approval']);
    
    if (error) {
      console.error('Error querying attendance records:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      console.log('No registered faces found in the database');
      return { recognized: false };
    }
    
    console.log(`Found ${data.length} registered faces to compare against`);
    
    let bestMatch: any = null;
    let bestDistance = 0.6; // Threshold distance (lower is better)
    
    // Compare the face descriptor against all registered faces
    for (const record of data) {
      try {
        // Prefer explicit column first
        if (record.face_descriptor && typeof record.face_descriptor === 'string') {
          const registeredDescriptor = stringToDescriptor(record.face_descriptor);
          const distance = calculateDistance(faceDescriptor, registeredDescriptor);
          console.log(`Face comparison (column): distance = ${distance.toFixed(4)} for record ${record.id}`);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = record;
          }
        }
        
        // Fallback to legacy storage in device_info.metadata.faceDescriptor
        const deviceInfo = record.device_info as DeviceInfo | null;
        const metaDescriptor = deviceInfo?.metadata?.faceDescriptor;
        if (metaDescriptor && typeof metaDescriptor === 'string') {
          const registeredDescriptor = stringToDescriptor(metaDescriptor);
          const distance = calculateDistance(faceDescriptor, registeredDescriptor);
          const personName = deviceInfo?.metadata?.name || 'unknown';
          console.log(`Face comparison (metadata): distance = ${distance.toFixed(4)} for ${personName}`);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = record;
          }
        }
      } catch (e) {
        console.error('Error processing record:', e);
        // Continue with the next record
      }
    }
    
    if (bestMatch) {
      console.log(`Best match found with confidence: ${((1 - bestDistance) * 100).toFixed(2)}%`);
      
      const deviceInfo = bestMatch.device_info as DeviceInfo | null;
      const employeeData = deviceInfo?.metadata;
      
      if (!employeeData) {
        console.error('Employee metadata missing from best match');
        return { recognized: false };
      }
      
      const employee: Employee = {
        id: bestMatch.user_id || 'unknown',
        name: employeeData.name || 'Unknown',
        employee_id: employeeData.employee_id || 'Unknown',
        department: employeeData.department || 'Unknown',
        position: employeeData.position || 'Unknown',
        firebase_image_url: employeeData.firebase_image_url || '',
      };
      
      return {
        recognized: true,
        employee,
        confidence: 1 - bestDistance
      };
    }
    
    console.log('No face match found above confidence threshold');
    return { recognized: false };
  } catch (error) {
    console.error('Face recognition error:', error);
    throw error;
  }
}

// Calculate Euclidean distance between two face descriptors
function calculateDistance(descriptor1: Float32Array, descriptor2: Float32Array): number {
  if (descriptor1.length !== descriptor2.length) {
    throw new Error('Face descriptors have different dimensions');
  }
  
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

// Check if current time is past cutoff time
async function isPastCutoffTime(): Promise<boolean> {
  try {
    const cutoffTime = await getAttendanceCutoffTime();
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffTime.hour, cutoffTime.minute, 0, 0);
    
    return now > cutoffDate;
  } catch (error) {
    console.error('Error checking cutoff time, defaulting to 9:00 AM:', error);
    // Fallback to 9:00 AM if there's an error
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setHours(9, 0, 0, 0);
    return now > cutoffDate;
  }
}

export async function recordAttendance(
  userId: string,
  status: 'present' | 'late' | 'absent' | 'unauthorized',
  confidence?: number,
  deviceInfo?: any
): Promise<any> {
  try {
    console.log(`Recording attendance for user ${userId} with status ${status}`);
    
    // Apply time-based status logic - if it's past cutoff time, mark as late
    let timeAdjustedStatus = status;
    if (status === 'present') {
      const pastCutoff = await isPastCutoffTime();
      if (pastCutoff) {
        timeAdjustedStatus = 'late';
        console.log('Adjusting status to late based on cutoff time');
      } else {
        console.log('Status remains present - before cutoff time');
      }
    }
    
    // Normalize status to 'present' for universal compatibility
    let normalizedStatus = timeAdjustedStatus;
    if (status === 'unauthorized') {
      normalizedStatus = 'present';
      console.log('Normalizing status from unauthorized to present for consistency');
    }
    
    const timestamp = new Date().toISOString();
    
    // First, check if we can get user info from profiles table
    let userName = null;
    let userMetadata = null;
    
    if (userId && userId !== 'unknown') {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();
        
      if (profileData && profileData.username) {
        userName = profileData.username;
        console.log(`Found username '${userName}' in profiles table`);
      }
    }
    
    // Preserve existing device info if available
    const fullDeviceInfo = {
      type: 'webcam',
      timestamp,
      confidence,
      ...deviceInfo,
      metadata: {
        ...deviceInfo?.metadata,
        name: userName || deviceInfo?.metadata?.name || 'Unknown'
      }
    };
    
    console.log('Recording attendance with device info:', fullDeviceInfo);
    
    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: userId,
        timestamp,
        status: normalizedStatus,
        device_info: fullDeviceInfo,
        confidence_score: confidence
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error recording attendance:', error);
      throw new Error(`Failed to record attendance: ${error.message}`);
    }
    
    console.log('Attendance recorded successfully:', data);
    return data;
  } catch (error) {
    console.error('Error in recordAttendance:', error);
    throw error;
  }
}
