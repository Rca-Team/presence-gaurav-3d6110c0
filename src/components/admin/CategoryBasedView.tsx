import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  User, 
  Printer, 
  Calendar, 
  Bell, 
  ChevronLeft,
  GraduationCap,
  FileText,
  Download
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Category = 'A' | 'B' | 'C' | 'D' | 'Teacher';

interface CategoryUser {
  id: string;
  user_id?: string;
  name: string;
  employee_id: string;
  department: string;
  image_url: string;
  category: Category;
  total_attendance: number;
}

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'A', label: 'Category A', icon: <span className="font-bold text-lg">A</span>, color: 'bg-blue-500' },
  { key: 'B', label: 'Category B', icon: <span className="font-bold text-lg">B</span>, color: 'bg-green-500' },
  { key: 'C', label: 'Category C', icon: <span className="font-bold text-lg">C</span>, color: 'bg-yellow-500' },
  { key: 'D', label: 'Category D', icon: <span className="font-bold text-lg">D</span>, color: 'bg-orange-500' },
  { key: 'Teacher', label: 'Teachers', icon: <GraduationCap className="h-5 w-5" />, color: 'bg-purple-500' },
];

const CategoryBasedView: React.FC = () => {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [users, setUsers] = useState<CategoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryCounts, setCategoryCounts] = useState<Record<Category, number>>({
    A: 0, B: 0, C: 0, D: 0, Teacher: 0
  });
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationSubject, setNotificationSubject] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category, timestamp')
        .eq('status', 'registered')
        .order('timestamp', { ascending: false });

      if (error) throw error;

      if (data) {
        const processedUsers: CategoryUser[] = data
          .map(record => {
            const deviceInfo = record.device_info as any;
            const metadata = deviceInfo?.metadata || {};
            return {
              id: record.id,
              user_id: record.user_id || undefined,
              name: metadata.name || 'Unknown',
              employee_id: metadata.employee_id || 'N/A',
              department: metadata.department || 'N/A',
              image_url: record.image_url || metadata.firebase_image_url || '',
              category: (record.category as Category) || 'A',
              total_attendance: 0,
            };
          })
          .filter(user => user.name !== 'Unknown' && !user.name.toLowerCase().includes('unknown'));

        setUsers(processedUsers);

        // Calculate category counts
        const counts: Record<Category, number> = { A: 0, B: 0, C: 0, D: 0, Teacher: 0 };
        processedUsers.forEach(user => {
          counts[user.category] = (counts[user.category] || 0) + 1;
        });
        setCategoryCounts(counts);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!selectedCategory) return [];
    return users.filter(user => user.category === selectedCategory);
  }, [users, selectedCategory]);

  const handlePrintDailyAttendance = async () => {
    if (!selectedCategory) return;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const categoryUsers = filteredUsers;

    // Fetch today's attendance for category users
    const employeeIds = categoryUsers.map(u => u.employee_id);
    const { data: attendanceData } = await supabase
      .from('attendance_records')
      .select('*')
      .in('status', ['present', 'late'])
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`);

    const presentIds = new Set(
      (attendanceData || [])
        .map(r => (r.device_info as any)?.employee_id)
        .filter(Boolean)
    );

    const printContent = `
      <html>
        <head>
          <title>Daily Attendance - Category ${selectedCategory} - ${format(new Date(), 'dd MMM yyyy')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; }
            h2 { color: #666; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f5f5f5; }
            .present { color: green; }
            .absent { color: red; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <h1>Daily Attendance Report</h1>
          <h2>Category: ${selectedCategory} | Date: ${format(new Date(), 'dd MMMM yyyy')}</h2>
          <p>Total Students: ${categoryUsers.length}</p>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Name</th>
                <th>ID</th>
                <th>Department</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${categoryUsers.map((user, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${user.name}</td>
                  <td>${user.employee_id}</td>
                  <td>${user.department}</td>
                  <td class="${presentIds.has(user.employee_id) ? 'present' : 'absent'}">
                    ${presentIds.has(user.employee_id) ? 'Present' : 'Absent'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            <p>Generated on ${format(new Date(), 'dd MMM yyyy HH:mm')}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }

    toast({
      title: 'Print Ready',
      description: 'Daily attendance report generated',
    });
  };

  const handlePrintMonthlyAttendance = async () => {
    if (!selectedCategory) return;

    const categoryUsers = filteredUsers;
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const workingDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
      .filter(day => !isWeekend(day));

    // Fetch monthly attendance
    const { data: attendanceData } = await supabase
      .from('attendance_records')
      .select('*')
      .in('status', ['present', 'late'])
      .gte('timestamp', format(monthStart, 'yyyy-MM-dd'))
      .lte('timestamp', format(monthEnd, 'yyyy-MM-dd'));

    // Build attendance map by employee
    const attendanceMap: Record<string, Set<string>> = {};
    (attendanceData || []).forEach(record => {
      const empId = (record.device_info as any)?.employee_id;
      if (empId) {
        if (!attendanceMap[empId]) attendanceMap[empId] = new Set();
        attendanceMap[empId].add(format(new Date(record.timestamp), 'yyyy-MM-dd'));
      }
    });

    const printContent = `
      <html>
        <head>
          <title>Monthly Attendance - Category ${selectedCategory} - ${format(selectedMonth, 'MMMM yyyy')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; }
            h2 { color: #666; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 5px; text-align: center; }
            th { background-color: #f5f5f5; }
            .present { background-color: #c8e6c9; }
            .absent { background-color: #ffcdd2; }
            .name-col { text-align: left; white-space: nowrap; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #888; }
            .summary { margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Monthly Attendance Report</h1>
          <h2>Category: ${selectedCategory} | Month: ${format(selectedMonth, 'MMMM yyyy')}</h2>
          <p>Total Students: ${categoryUsers.length} | Working Days: ${workingDays.length}</p>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th class="name-col">Name</th>
                <th>ID</th>
                ${workingDays.map(day => `<th>${format(day, 'd')}</th>`).join('')}
                <th>Total</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              ${categoryUsers.map((user, idx) => {
                const userAttendance = attendanceMap[user.employee_id] || new Set();
                const presentCount = workingDays.filter(day => 
                  userAttendance.has(format(day, 'yyyy-MM-dd'))
                ).length;
                const percentage = workingDays.length > 0 
                  ? Math.round((presentCount / workingDays.length) * 100) 
                  : 0;
                
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="name-col">${user.name}</td>
                    <td>${user.employee_id}</td>
                    ${workingDays.map(day => {
                      const isPresent = userAttendance.has(format(day, 'yyyy-MM-dd'));
                      return `<td class="${isPresent ? 'present' : 'absent'}">${isPresent ? 'P' : 'A'}</td>`;
                    }).join('')}
                    <td><strong>${presentCount}</strong></td>
                    <td>${percentage}%</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="footer">
            <p>Generated on ${format(new Date(), 'dd MMM yyyy HH:mm')}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }

    toast({
      title: 'Print Ready',
      description: 'Monthly attendance report generated',
    });
  };

  const handleBulkNotification = async () => {
    if (!selectedCategory || !notificationMessage.trim()) return;
    
    setSendingNotification(true);
    try {
      const categoryUsers = filteredUsers;
      let successCount = 0;
      let failCount = 0;

      for (const user of categoryUsers) {
        if (!user.user_id) continue;

        // Get parent email from profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('parent_email, parent_name')
          .eq('user_id', user.user_id)
          .single();

        if (profile?.parent_email) {
          try {
            await supabase.functions.invoke('send-notification', {
              body: {
                recipient: profile.parent_email,
                subject: notificationSubject || `Category ${selectedCategory} Notification`,
                message: notificationMessage,
                studentName: user.name,
                parentName: profile.parent_name || 'Parent',
              },
            });
            successCount++;
          } catch (e) {
            failCount++;
          }
        }
      }

      toast({
        title: 'Notifications Sent',
        description: `Sent to ${successCount} parents${failCount > 0 ? `, ${failCount} failed` : ''}`,
      });

      setNotificationOpen(false);
      setNotificationMessage('');
      setNotificationSubject('');
    } catch (error) {
      console.error('Error sending notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to send notifications',
        variant: 'destructive',
      });
    } finally {
      setSendingNotification(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-20 w-20 rounded-full mx-auto mb-4" />
              <Skeleton className="h-4 w-24 mx-auto" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (selectedCategory) {
    return (
      <div className="space-y-4">
        {/* Header with back button and actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setSelectedCategory(null)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-xl font-semibold">
                {CATEGORIES.find(c => c.key === selectedCategory)?.label}
              </h2>
              <p className="text-sm text-muted-foreground">{filteredUsers.length} users</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handlePrintDailyAttendance}>
              <Printer className="h-4 w-4 mr-2" />
              Daily Report
            </Button>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Monthly Report
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Monthly Attendance Report</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Select Month</Label>
                    <Input
                      type="month"
                      value={format(selectedMonth, 'yyyy-MM')}
                      onChange={(e) => setSelectedMonth(new Date(e.target.value + '-01'))}
                      className="mt-1"
                    />
                  </div>
                  <Button onClick={handlePrintMonthlyAttendance} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Generate & Print
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={notificationOpen} onOpenChange={setNotificationOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Bell className="h-4 w-4 mr-2" />
                  Bulk Notify
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Notification to Category {selectedCategory}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Subject</Label>
                    <Input
                      value={notificationSubject}
                      onChange={(e) => setNotificationSubject(e.target.value)}
                      placeholder={`Category ${selectedCategory} Notification`}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Message</Label>
                    <Textarea
                      value={notificationMessage}
                      onChange={(e) => setNotificationMessage(e.target.value)}
                      placeholder="Enter your message..."
                      rows={4}
                      className="mt-1"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This will send to all {filteredUsers.length} users in Category {selectedCategory}
                  </p>
                  <Button 
                    onClick={handleBulkNotification} 
                    disabled={!notificationMessage.trim() || sendingNotification}
                    className="w-full"
                  >
                    {sendingNotification ? 'Sending...' : 'Send Notifications'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Users grid */}
        {filteredUsers.length === 0 ? (
          <Card className="p-8 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No users in this category</h3>
            <p className="text-sm text-muted-foreground">Add users to Category {selectedCategory} to see them here</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredUsers.map(user => (
              <Card key={user.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage 
                        src={user.image_url?.startsWith('data:') 
                          ? user.image_url 
                          : user.image_url ? `https://zovwmlqnrsionbolcpng.supabase.co/storage/v1/object/public/face-images/${user.image_url}` : ''
                        } 
                        alt={user.name}
                      />
                      <AvatarFallback>
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{user.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{user.employee_id}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.department}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold">Select a Category</h2>
        <p className="text-sm text-muted-foreground">View users, attendance reports, and send bulk notifications</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {CATEGORIES.map(category => (
          <Card 
            key={category.key}
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
            onClick={() => setSelectedCategory(category.key)}
          >
            <CardContent className="p-6 text-center">
              <div className={`w-16 h-16 ${category.color} rounded-full flex items-center justify-center mx-auto mb-4 text-white`}>
                {category.icon}
              </div>
              <h3 className="font-semibold text-lg">{category.label}</h3>
              <Badge variant="secondary" className="mt-2">
                <Users className="h-3 w-3 mr-1" />
                {categoryCounts[category.key]} users
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CategoryBasedView;
