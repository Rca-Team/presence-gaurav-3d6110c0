
import React, { useState, useEffect } from 'react';
import PageLayout from '@/components/layouts/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import AdminFacesList from '@/components/admin/AdminFacesList';
import AttendanceCalendar from '@/components/admin/AttendanceCalendar';
import AttendanceCutoffSetting from '@/components/admin/AttendanceCutoffSetting';
import AutoNotificationScheduler from '@/components/admin/AutoNotificationScheduler';
import BulkNotificationService from '@/components/admin/BulkNotificationService';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Calendar, Filter, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const Admin = () => {
  const { toast } = useToast();
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('faces');
  const [attendanceUpdated, setAttendanceUpdated] = useState(false);
  const [nameFilter, setNameFilter] = useState<string>('all');
  const [availableFaces, setAvailableFaces] = useState<{id: string, name: string, employee_id: string}[]>([]);

  useEffect(() => {
    // Fetch available face names for the filter dropdown
    const fetchFaceNames = async () => {
      try {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('id, user_id, device_info')
          .eq('status', 'registered');
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          const uniqueFaces = data.reduce((acc: {id: string, name: string, employee_id: string}[], record) => {
            try {
              const deviceInfo = record.device_info as any;
              const name = deviceInfo?.metadata?.name || 'Unknown';
              const employee_id = deviceInfo?.metadata?.employee_id || 'N/A';
              
              // Skip unknown faces
              if (name === 'Unknown' || name === 'User' || name.toLowerCase().includes('unknown')) {
                return acc;
              }
              
              // Use user_id if available, otherwise use record id as fallback
              const userId = record.user_id || record.id;
              
              // Check if we already have this user
              if (!acc.some(face => face.id === userId)) {
                acc.push({ id: userId, name, employee_id });
              }
              
              return acc;
            } catch (e) {
              console.error('Error processing record:', e);
              return acc;
            }
          }, []);
          
          setAvailableFaces(uniqueFaces);
        }
      } catch (error) {
        console.error('Error fetching face names:', error);
      }
    };
    
    fetchFaceNames();
    
    // Set up real-time channel for general admin updates
    const adminChannel = supabase
      .channel('admin-dashboard')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'attendance_records' 
        },
        (payload) => {
          console.log('Admin dashboard real-time update received:', payload);
          
          // Debounce notifications to prevent spam
          const notificationTimeout = setTimeout(() => {
            // Show notification and trigger refresh
            setAttendanceUpdated(true);
            
            // If a record was deleted and it was the selected face, reset the selected face
            if (payload.eventType === 'DELETE' && payload.old && payload.old.id === selectedFaceId) {
              setSelectedFaceId(null);
              toast({
                title: "Face Deleted",
                description: "The selected face has been deleted.",
                variant: "default",
              });
            } else if (payload.eventType === 'INSERT') {
              toast({
                title: "New Registration",
                description: "A new face has been registered.",
                variant: "default",
              });
            }
            
            // Refresh the list of available faces with debouncing
            clearTimeout(notificationTimeout);
            const refreshTimeout = setTimeout(() => {
              fetchFaceNames();
            }, 500);
            
            return () => clearTimeout(refreshTimeout);
          }, 300);
          
          return () => clearTimeout(notificationTimeout);
        }
      )
      .subscribe();

    console.log('Subscribed to admin dashboard real-time updates');

    // Clean up subscription on unmount
    return () => {
      supabase.removeChannel(adminChannel);
      console.log('Unsubscribed from admin dashboard updates');
    };
  }, [toast, selectedFaceId]);

  // Reset the update flag after a short delay
  useEffect(() => {
    if (attendanceUpdated) {
      const timer = setTimeout(() => setAttendanceUpdated(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [attendanceUpdated]);

  return (
    <PageLayout>
      <PageHeader 
        title="Admin Dashboard" 
        description="Manage registered faces and view detailed attendance records in real-time"
      >
        <div className="flex gap-2">
          <Select value={nameFilter} onValueChange={setNameFilter}>
            <SelectTrigger className="w-[180px]">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <SelectValue placeholder="Filter by name" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Registered Faces</SelectItem>
              {availableFaces.map((face) => (
                <SelectItem key={face.id} value={face.id}>
                  {face.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <BulkNotificationService availableFaces={availableFaces} />
          <Button variant="outline" onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
            {viewMode === 'grid' ? 'List View' : 'Grid View'}
          </Button>
        </div>
      </PageHeader>

      <Tabs 
        defaultValue="faces" 
        className="w-full"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="faces" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>Registered Faces</span>
            {attendanceUpdated && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Attendance Calendar</span>
            {attendanceUpdated && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="faces" className="space-y-4">
          <AdminFacesList 
            viewMode={viewMode} 
            selectedFaceId={selectedFaceId}
            nameFilter={nameFilter}
            setSelectedFaceId={(id) => {
              setSelectedFaceId(id);
              if (id) {
                setActiveTab('calendar');
              }
            }} 
          />
        </TabsContent>
        <TabsContent value="calendar">
          <AttendanceCalendar selectedFaceId={selectedFaceId} />
        </TabsContent>
        <TabsContent value="settings" className="space-y-6">
          <AttendanceCutoffSetting />
          <AutoNotificationScheduler />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
};

export default Admin;
