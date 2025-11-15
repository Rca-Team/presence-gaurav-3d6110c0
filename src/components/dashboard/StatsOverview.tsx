
import React from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface StatsOverviewProps {
  isLoading: boolean;
  data?: {
    totalUsers?: number;
    presentToday?: number;
    presentPercentage?: number;
    weeklyAverage?: number;
  };
  refetch: () => void;
}

// Define the type for the attendance stats query result
interface AttendanceStats {
  totalUsers: number;
  presentToday: number;
  presentPercentage: number;
}

const StatsOverview: React.FC<StatsOverviewProps> = ({ isLoading, data, refetch }) => {
  // Fetch real-time attendance data
  const { data: attendanceStats, refetch: refetchStats } = useQuery<AttendanceStats>({
    queryKey: ['attendanceStatsRealtime'],
    queryFn: async () => {
      // Get today's date
      const today = new Date().toISOString().split('T')[0];
      
      // Count all users
      const { count: totalUsers, error: usersError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      if (usersError) throw usersError;
      
      // Count present users today
      const { count: presentToday, error: presentError } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'present')
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`);
      
      if (presentError) throw presentError;
      
      const totalUsersCount = totalUsers || 0;
      const presentTodayCount = presentToday || 0;
      const presentPercentage = totalUsersCount > 0 ? Math.round((presentTodayCount / totalUsersCount) * 100) : 0;
      
      return {
        totalUsers: totalUsersCount,
        presentToday: presentTodayCount,
        presentPercentage
      };
    },
    initialData: data && data.totalUsers !== undefined && data.presentToday !== undefined && data.presentPercentage !== undefined 
      ? {
          totalUsers: data.totalUsers,
          presentToday: data.presentToday,
          presentPercentage: data.presentPercentage
        } 
      : undefined,
    refetchInterval: 2000, // Poll every 2 seconds for realtime feel
    enabled: !isLoading
  });
  
  React.useEffect(() => {
    // Listen for changes in attendance_records and profiles tables
    const attendanceChannel = supabase
      .channel('stats_attendance_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance_records'
      }, () => {
        refetchStats();
        refetch();
      })
      .subscribe();

    const profilesChannel = supabase
      .channel('stats_profiles_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles'
      }, () => {
        refetchStats();
        refetch();
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, [refetch, refetchStats]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-slide-in-up">
      {isLoading ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : (
        <>
          <StatCard
            title="Total Users"
            value={attendanceStats?.totalUsers.toString() || "..."}
            trend={{ value: 12, positive: true }}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            }
          />
          
          <StatCard
            title="Present Today"
            value={attendanceStats?.presentToday.toString() || "..."}
            description={`${attendanceStats?.presentPercentage || 0}% attendance rate`}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            }
          />
          
          <StatCard
            title="Average Weekly"
            value={`${data?.weeklyAverage || 0}%`}
            trend={{ value: 5, positive: true }}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            }
          />
        </>
      )}
    </div>
  );
};

export default StatsOverview;
