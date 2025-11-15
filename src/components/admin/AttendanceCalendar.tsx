
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAttendanceCalendar } from './hooks/useAttendanceCalendar';
import StudentInfoCard from './StudentInfoCard';
import DailyAttendanceDetails from './DailyAttendanceDetails';
import AttendanceCalendarView from './AttendanceCalendarView';
import ReportControls from './ReportControls';
import { GraduationCap, User } from 'lucide-react';

interface AttendanceCalendarProps {
  selectedFaceId: string | null;
}

const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ selectedFaceId }) => {
  const {
    attendanceDays,
    lateAttendanceDays,
    absentDays,
    selectedFace,
    selectedDate,
    setSelectedDate,
    dailyAttendance,
    workingDays,
    isDateInArray,
    attendanceRecords
  } = useAttendanceCalendar(selectedFaceId);

  return (
    <div className="space-y-6">
      {selectedFaceId ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="school-card overflow-hidden">
              <CardHeader className="flex flex-row justify-between items-center bg-gradient-to-r from-[hsl(var(--school-blue))]/10 to-transparent">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-[hsl(var(--school-blue))]" />
                  <CardTitle>Attendance Calendar</CardTitle>
                </div>
                <ReportControls
                  selectedFace={selectedFace}
                  workingDays={workingDays}
                  attendanceDays={attendanceDays}
                  lateAttendanceDays={lateAttendanceDays}
                  absentDays={absentDays}
                  selectedDate={selectedDate}
                  dailyAttendance={dailyAttendance}
                />
              </CardHeader>
              <CardContent>
                <AttendanceCalendarView
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  attendanceDays={attendanceDays}
                  lateAttendanceDays={lateAttendanceDays}
                  absentDays={absentDays}
                  attendanceRecords={attendanceRecords}
                />
              </CardContent>
            </Card>

            <Card className="school-card overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-[hsl(var(--school-green))]/10 to-transparent">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-[hsl(var(--school-green))]" />
                  <CardTitle>{selectedFace?.name || 'Student'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <StudentInfoCard 
                    selectedFace={selectedFace} 
                    attendanceDays={attendanceDays} 
                    lateAttendanceDays={lateAttendanceDays} 
                  />
                  
                  {selectedDate && (
                    <DailyAttendanceDetails
                      selectedDate={selectedDate}
                      dailyAttendance={dailyAttendance}
                      isDateInArray={isDateInArray}
                      attendanceDays={attendanceDays}
                      lateAttendanceDays={lateAttendanceDays}
                      absentDays={absentDays}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card className="school-card overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center p-6">
            <div className="w-20 h-20 rounded-full bg-[hsl(var(--school-blue))]/10 flex items-center justify-center mb-4">
              <User className="h-10 w-10 text-[hsl(var(--school-blue))]/50" />
            </div>
            <div className="w-full max-w-md text-center">
              <h3 className="text-lg font-medium mb-2">No student selected</h3>
              <p className="text-muted-foreground">
                Select a student from the list to view their attendance calendar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AttendanceCalendar;
