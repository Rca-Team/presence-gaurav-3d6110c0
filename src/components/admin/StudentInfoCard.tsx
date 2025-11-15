
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { FaceInfo } from './utils/attendanceUtils';
import NotificationService from './NotificationService';
import { User } from 'lucide-react';

interface StudentInfoCardProps {
  selectedFace: FaceInfo | null;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
}

const StudentInfoCard: React.FC<StudentInfoCardProps> = ({ 
  selectedFace, 
  attendanceDays, 
  lateAttendanceDays 
}) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-border">
            <AvatarImage 
              src={selectedFace?.image_url && selectedFace.image_url.startsWith('data:') 
                ? selectedFace.image_url 
                : selectedFace?.image_url
                  ? `https://tegpyalokurixuvgeuks.supabase.co/storage/v1/object/public/face-images/${selectedFace.image_url}`
                  : undefined
              } 
              alt={selectedFace?.name || 'Student'}
            />
            <AvatarFallback>
              <User className="h-8 w-8" />
            </AvatarFallback>
          </Avatar>
          <CardTitle>{selectedFace?.name || 'Student'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-sm text-muted-foreground">ID:</span>
              <p>{selectedFace?.employee_id || 'N/A'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Department:</span>
              <p>{selectedFace?.department || 'N/A'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Position:</span>
              <p>{selectedFace?.position || 'Student'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Present Days:</span>
              <p className="font-semibold text-green-600">{attendanceDays.length} days</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Late Days:</span>
              <p className="font-semibold text-orange-600">{lateAttendanceDays.length} days</p>
            </div>
            {attendanceDays.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Last Present:</span>
                <p className="text-green-600 dark:text-green-500 font-medium">
                  {new Date(Math.max(...attendanceDays.map(d => d.getTime()))).toLocaleDateString()}
                </p>
              </div>
            )}
            {lateAttendanceDays.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Last Late:</span>
                <p className="text-yellow-600 dark:text-yellow-500 font-medium">
                  {new Date(Math.max(...lateAttendanceDays.map(d => d.getTime()))).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
          <div className="pt-4 border-t">
            <NotificationService 
              studentId={selectedFace?.user_id}
              studentName={selectedFace?.name}
              attendanceStatus="present"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentInfoCard;
