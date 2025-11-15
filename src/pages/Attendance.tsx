
import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import PageLayout from '@/components/layouts/PageLayout';
import { loadOptimizedModels } from '@/services/face-recognition/OptimizedModelService';
import AttendanceCapture from '@/components/attendance/AttendanceCapture';
import MultipleAttendanceCapture from '@/components/attendance/MultipleAttendanceCapture';
import AttendanceInstructions from '@/components/attendance/AttendanceInstructions';
import AttendanceSidebar from '@/components/attendance/AttendanceSidebar';
import AttendanceResult from '@/components/attendance/AttendanceResult';
import AttendanceToday from '@/components/attendance/AttendanceToday';
import AttendanceStats from '@/components/attendance/AttendanceStats';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, Users, BarChart3, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Attendance = () => {
  const [activeTab, setActiveTab] = useState('single');
  const { toast } = useToast();
  
  useEffect(() => {
    const initModels = async () => {
      try {
        await loadOptimizedModels();
      } catch (err) {
        console.error('Error loading face recognition models:', err);
        toast({
          title: "Model Loading Error",
          description: "Failed to load face recognition models. Please try again later.",
          variant: "destructive",
        });
      }
    };
    
    initModels();
  }, [toast]);
  
  return (
    <PageLayout className="school-gradient-bg">
      <PageHeader 
        title="Face Recognition Attendance" 
        description="Advanced facial recognition system with multiple face detection and optimized performance"
        className="animate-slide-in-down"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 p-1">
          <TabsTrigger value="single" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2">
            <Camera className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Single Face</span>
            <span className="sm:hidden">Single</span>
          </TabsTrigger>
          <TabsTrigger value="multiple" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2">
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Multiple Faces</span>
            <span className="sm:hidden">Multiple</span>
            <Badge variant="secondary" className="text-xs ml-1 hidden sm:inline">New</Badge>
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Statistics</span>
            <span className="sm:hidden">Stats</span>
          </TabsTrigger>
          <TabsTrigger value="help" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2">
            <Info className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Help</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 space-y-4 sm:space-y-6 order-2 lg:order-1">
              <AttendanceCapture />
            </div>
            <div className="space-y-4 sm:space-y-6 order-1 lg:order-2">
              <div className="block lg:hidden">
                <AttendanceToday />
              </div>
              <div className="hidden lg:block">
                <AttendanceSidebar />
                <div className="mt-4 sm:mt-6">
                  <AttendanceToday />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="multiple" className="space-y-6">
          <MultipleAttendanceCapture />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 order-2 lg:order-1">
              <AttendanceStats />
            </div>
            <div className="space-y-4 sm:space-y-6 order-1 lg:order-2">
              <AttendanceToday />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="help" className="space-y-6">
          <AttendanceInstructions />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
};

export default Attendance;
