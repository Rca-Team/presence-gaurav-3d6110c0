import { format } from 'date-fns';
import { FaceInfo, isDateInArray } from './attendanceUtils';
import { supabase } from '@/integrations/supabase/client';

interface ReportGenerationProps {
  selectedFace: FaceInfo;
  workingDays: Date[];
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
  selectedDate?: Date;
  dailyAttendance: {
    id: string;
    timestamp: string;
    status: string;
  }[];
}

// Generate and open a printable report
export const generatePrintableReport = async ({
  selectedFace,
  workingDays,
  attendanceDays,
  lateAttendanceDays,
  absentDays,
  selectedDate,
  dailyAttendance
}: ReportGenerationProps): Promise<Window | null> => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return null;
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Get today's actual date for reference
  const today = new Date();
  
  // Get date 30 days ago from today
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  // First, get the registration record to find the face ID and face descriptor
  const { data: registrationRecord, error: regError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', selectedFace.recordId) // Use the record ID to fetch the registration record
    .eq('status', 'registered')
    .single();

  if (regError || !registrationRecord) {
    console.warn('No registration record found for selected face ID:', selectedFace.recordId);
    return null;
  }

  const deviceInfo = registrationRecord.device_info as any;
  const faceDescriptor = deviceInfo?.metadata?.faceDescriptor;
  if (!faceDescriptor) {
    console.warn('No face descriptor found in registration record');
    return null;
  }

  // Now get all attendance records for the last 30 days
  const { data: allAttendanceRecords, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('*')
    .gte('timestamp', thirtyDaysAgo.toISOString())
    .lte('timestamp', today.toISOString())
    .order('timestamp', { ascending: false });

  if (attendanceError) {
    console.error('Error fetching attendance records:', attendanceError);
    return null;
  }

  // Filter records to find matches for this specific face by comparing descriptors
  let attendanceRecords: any[] = [];
  if (allAttendanceRecords) {
    attendanceRecords = allAttendanceRecords.filter(record => {
      const deviceInfo = record.device_info as any;
      if (!deviceInfo || deviceInfo.registration) return false;
      
      // If there's a face descriptor in the record, compare it
      if (deviceInfo.faceDescriptor) {
        const recordDescriptor = deviceInfo.faceDescriptor;
        if (Array.isArray(recordDescriptor) && Array.isArray(faceDescriptor)) {
          // Calculate similarity between descriptors (simple comparison)
          const similarity = calculateDescriptorSimilarity(faceDescriptor, recordDescriptor);
          return similarity > 0.6; // Threshold for matching faces
        }
      }
      
      // Fallback: try to match by user_id if available
      if (record.user_id && registrationRecord.user_id) {
        return record.user_id === registrationRecord.user_id;
      }
      
      return false;
    });
  }

  // Helper function to calculate descriptor similarity
  function calculateDescriptorSimilarity(desc1: number[], desc2: number[]): number {
    if (desc1.length !== desc2.length) return 0;
    
    let distance = 0;
    for (let i = 0; i < desc1.length; i++) {
      distance += Math.pow(desc1[i] - desc2[i], 2);
    }
    distance = Math.sqrt(distance);
    
    // Convert distance to similarity (lower distance = higher similarity)
    return Math.max(0, 1 - distance);
  }

  if (attendanceRecords.length === 0) {
    console.warn('No attendance records found for selected face');
  }

  // Process attendance records to get status counts
  const recordsByDate = new Map<string, any[]>();
  attendanceRecords?.forEach(record => {
    const recordDate = new Date(record.timestamp).toDateString();
    if (!recordsByDate.has(recordDate)) {
      recordsByDate.set(recordDate, []);
    }
    recordsByDate.get(recordDate)!.push(record);
  });

  // Generate working days for the last 30 days
  const realtimeWorkingDays: Date[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      realtimeWorkingDays.push(date);
    }
  }

  // Calculate realtime stats
  const totalWorkDays = realtimeWorkingDays.length;
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  realtimeWorkingDays.forEach(workDate => {
    const dateKey = workDate.toDateString();
    const dayRecords = recordsByDate.get(dateKey) || [];
    
    if (dayRecords.length > 0) {
      // Check for registration records (these don't count as attendance)
      const attendanceOnlyRecords = dayRecords.filter(record => {
        const deviceInfo = record.device_info as any;
        return !deviceInfo?.registration;
      });
      
      if (attendanceOnlyRecords.length > 0) {
        const hasLateRecord = attendanceOnlyRecords.some(record => 
          record.status === 'late' || record.status === 'unauthorized'
        );
        if (hasLateRecord) {
          lateCount++;
        } else {
          presentCount++;
        }
      } else {
        absentCount++;
      }
    } else {
      absentCount++;
    }
  });
  
  const attendanceRate = totalWorkDays > 0 ? ((presentCount + lateCount) / totalWorkDays * 100).toFixed(1) : "0.0";

  // Create rows for attendance table using realtime data
  const tableRows = realtimeWorkingDays
    .sort((a, b) => b.getTime() - a.getTime())
    .map(date => {
      const dateKey = date.toDateString();
      const dayRecords = recordsByDate.get(dateKey) || [];
      
      // Filter out registration records
      const attendanceOnlyRecords = dayRecords.filter(record => {
        const deviceInfo = record.device_info as any;
        return !deviceInfo?.registration;
      });
      
      let attendanceTime = '';
      let status = 'Absent';
      let statusClass = 'status-absent';
      let statusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-icon"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      
      if (attendanceOnlyRecords.length > 0) {
        const firstRecord = attendanceOnlyRecords[0];
        const recordTime = new Date(firstRecord.timestamp);
        attendanceTime = recordTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const hasLateRecord = attendanceOnlyRecords.some(record => 
          record.status === 'late' || record.status === 'unauthorized'
        );
        if (hasLateRecord) {
          status = 'Late';
          statusClass = 'status-late';
          statusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
        } else {
          status = 'Present';
          statusClass = 'status-present';
          statusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>';
        }
      }
      
      return `
        <tr>
          <td>${formatDate(date)}</td>
          <td>
            <div class="status-with-icon">
              ${statusIcon}
              <span class="status-badge ${statusClass}">${status}</span>
            </div>
          </td>
          <td>${attendanceOnlyRecords.length > 0 ? attendanceTime : '-'}</td>
        </tr>
      `;
    }).join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>Attendance Report - ${selectedFace.name}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1, h2, h3 {
            color: #2563eb;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 30px;
          }
          .info-item {
            margin-bottom: 10px;
          }
          .label {
            font-weight: bold;
            color: #666;
          }
          .summary {
            background-color: #f9fafb;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
          }
          .status-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            color: white;
            margin-left: 5px;
          }
          .status-present {
            background-color: #10b981;
          }
          .status-late {
            background-color: #f59e0b;
          }
          .status-absent {
            background-color: #ef4444;
          }
          .status-with-icon {
            display: flex;
            align-items: center;
          }
          .status-icon {
            margin-right: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
          }
          th {
            background-color: #f1f5f9;
          }
          .attendance-summary-icons {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .icon-present {
            color: #10b981;
          }
          .icon-late {
            color: #f59e0b;
          }
          .icon-absent {
            color: #ef4444;
          }
          @media print {
            body {
              font-size: 12pt;
            }
            button {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Attendance Report</h1>
          <p>Generated on ${formatDate(today)}</p>
          <p>Showing last 30 days: ${formatDate(thirtyDaysAgo)} - ${formatDate(today)}</p>
        </div>
        
        <h2>Student Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="label">Name:</div>
            <div>${selectedFace.name}</div>
          </div>
          <div class="info-item">
            <div class="label">ID:</div>
            <div>${selectedFace.employee_id}</div>
          </div>
          <div class="info-item">
            <div class="label">Department:</div>
            <div>${selectedFace.department}</div>
          </div>
          <div class="info-item">
            <div class="label">Position:</div>
            <div>${selectedFace.position}</div>
          </div>
        </div>
        
        <h2>Attendance Summary (Last 30 Days)</h2>
        <div class="summary">
          <div class="info-item">
            <div class="label">Total Working Days:</div>
            <div>${totalWorkDays}</div>
          </div>
          <div class="info-item">
            <div class="label">Present Days:</div>
            <div class="attendance-summary-icons">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-present"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>
              ${presentCount} <span class="status-badge status-present">Present</span>
            </div>
          </div>
          <div class="info-item">
            <div class="label">Late Days:</div>
            <div class="attendance-summary-icons">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-late"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              ${lateCount} <span class="status-badge status-late">Late</span>
            </div>
          </div>
          <div class="info-item">
            <div class="label">Absent Days:</div>
            <div class="attendance-summary-icons">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-absent"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              ${absentCount} <span class="status-badge status-absent">Absent</span>
            </div>
          </div>
          <div class="info-item">
            <div class="label">Attendance Rate:</div>
            <div>${attendanceRate}%</div>
          </div>
        </div>
        
        <h2>Attendance Details (Last 30 Days)</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Time (if present)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        
        <div style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()">Print Report</button>
        </div>
      </body>
    </html>
  `);
  
  printWindow.document.close();
  return printWindow;
};

// Generate and download CSV file
export const exportToCSV = async ({
  selectedFace,
  workingDays,
  attendanceDays,
  lateAttendanceDays,
  absentDays,
  selectedDate,
  dailyAttendance
}: ReportGenerationProps): Promise<void> => {
  let csvContent = "Date,Status,Time\n";
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Get today's actual date for reference
  const today = new Date();
  
  // Get date 30 days ago from today
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  // First, get the registration record to find the face ID and face descriptor
  const { data: registrationRecord, error: regError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', selectedFace.recordId) // Use the record ID to fetch the registration record
    .eq('status', 'registered')
    .single();

  if (regError || !registrationRecord) {
    console.warn('No registration record found for selected face ID:', selectedFace.recordId);
    return;
  }

  const regDeviceInfo = registrationRecord.device_info as any;
  const faceDescriptor = regDeviceInfo?.metadata?.faceDescriptor;
  if (!faceDescriptor) {
    console.warn('No face descriptor found in registration record');
    return;
  }

  // Now get all attendance records for the last 30 days
  const { data: allAttendanceRecords, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('*')
    .gte('timestamp', thirtyDaysAgo.toISOString())
    .lte('timestamp', today.toISOString())
    .order('timestamp', { ascending: false });

  if (attendanceError) {
    console.error('Error fetching attendance records:', attendanceError);
    return;
  }

  // Filter records to find matches for this specific face by comparing descriptors
  let attendanceRecords: any[] = [];
  if (allAttendanceRecords) {
    attendanceRecords = allAttendanceRecords.filter(record => {
      const deviceInfo = record.device_info as any;
      if (!deviceInfo || deviceInfo.registration) return false;
      
      // If there's a face descriptor in the record, compare it
      if (deviceInfo.faceDescriptor) {
        const recordDescriptor = deviceInfo.faceDescriptor;
        if (Array.isArray(recordDescriptor) && Array.isArray(faceDescriptor)) {
          // Calculate similarity between descriptors (simple comparison)
          const similarity = calculateDescriptorSimilarityCSV(faceDescriptor, recordDescriptor);
          return similarity > 0.6; // Threshold for matching faces
        }
      }
      
      // Fallback: try to match by user_id if available
      if (record.user_id && registrationRecord.user_id) {
        return record.user_id === registrationRecord.user_id;
      }
      
      return false;
    });
  }

  // Helper function to calculate descriptor similarity for CSV
  function calculateDescriptorSimilarityCSV(desc1: number[], desc2: number[]): number {
    if (desc1.length !== desc2.length) return 0;
    
    let distance = 0;
    for (let i = 0; i < desc1.length; i++) {
      distance += Math.pow(desc1[i] - desc2[i], 2);
    }
    distance = Math.sqrt(distance);
    
    // Convert distance to similarity (lower distance = higher similarity)
    return Math.max(0, 1 - distance);
  }

  // Process attendance records
  const recordsByDate = new Map<string, any[]>();
  attendanceRecords?.forEach(record => {
    const recordDate = new Date(record.timestamp).toDateString();
    if (!recordsByDate.has(recordDate)) {
      recordsByDate.set(recordDate, []);
    }
    recordsByDate.get(recordDate)!.push(record);
  });

  // Generate working days for the last 30 days
  const realtimeWorkingDays: Date[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    // Skip weekends
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      realtimeWorkingDays.push(date);
    }
  }

  const sortedDays = [...realtimeWorkingDays]
    .sort((a, b) => b.getTime() - a.getTime());
  
  sortedDays.forEach(date => {
    const dateKey = date.toDateString();
    const dayRecords = recordsByDate.get(dateKey) || [];
    
    // Filter out registration records
    const attendanceOnlyRecords = dayRecords.filter(record => {
      const deviceInfo = record.device_info as any;
      return !deviceInfo?.registration;
    });
    
    let status = 'Absent';
    let timeInfo = '';
    
    if (attendanceOnlyRecords.length > 0) {
      const firstRecord = attendanceOnlyRecords[0];
      const recordTime = new Date(firstRecord.timestamp);
      timeInfo = recordTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const hasLateRecord = attendanceOnlyRecords.some(record => 
        record.status === 'late' || record.status === 'unauthorized'
      );
      status = hasLateRecord ? 'Late' : 'Present';
    }
    
    csvContent += `${formatDate(date)},${status},${attendanceOnlyRecords.length > 0 ? timeInfo : '-'}\n`;
  });
  
  const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${selectedFace.name.replace(/\s+/g, '_')}_last_30_days_attendance.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
