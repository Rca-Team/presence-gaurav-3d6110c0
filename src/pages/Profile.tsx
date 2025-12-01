import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageLayout from '@/components/layouts/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  BarChart3, 
  Bell, 
  Shield,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    display_name: '',
    parent_name: '',
    parent_email: '',
    parent_phone: ''
  });

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login');
      return;
    }
    setUser(user);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    setProfile(profileData);
    if (profileData) {
      setFormData({
        display_name: profileData.display_name || '',
        parent_name: profileData.parent_name || '',
        parent_email: profileData.parent_email || '',
        parent_phone: profileData.parent_phone || ''
      });
    }
  };

  // Fetch attendance stats
  const { data: attendanceStats } = useQuery({
    queryKey: ['userAttendance', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, count } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id);
      
      const present = data?.filter(r => r.status === 'present').length || 0;
      const late = data?.filter(r => r.status === 'late').length || 0;
      const rate = count ? (present / count * 100).toFixed(1) : '0';
      
      return { total: count || 0, present, late, rate };
    },
    enabled: !!user
  });

  // Fetch AI insights
  const { data: aiInsights } = useQuery({
    queryKey: ['aiInsights', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user
  });

  // Fetch notifications
  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!user
  });

  const handleSave = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update(formData)
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: "Profile updated successfully"
      });
      setIsEditing(false);
      fetchUserData();
    }
  };

  const generateAIInsight = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-insights', {
        body: { 
          type: 'performance_insights',
          userId: user.id,
          data: {} 
        }
      });

      if (error) throw error;

      toast({
        title: "AI Insight Generated",
        description: "Your personalized insights are ready!",
        variant: "default"
      });
    } catch (error) {
      console.error('Error generating insight:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI insights",
        variant: "destructive"
      });
    }
  };

  return (
    <PageLayout className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950">
      <div className="mobile-container">
        <PageHeader
          title="My Profile"
          description="Manage your account and view your attendance analytics"
          icon={<User className="h-8 w-8 text-primary" />}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Profile Card */}
          <Card className="glass-panel lg:col-span-1">
            <CardHeader>
              <div className="flex flex-col items-center space-y-4">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profile?.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {profile?.display_name?.[0] || user?.email?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <CardTitle className="text-xl">{profile?.display_name || 'User'}</CardTitle>
                  <CardDescription>{user?.email}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5">
                  <span className="text-sm font-medium">Attendance Rate</span>
                  <Badge variant="default" className="text-base">{attendanceStats?.rate}%</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10">
                  <span className="text-sm font-medium">Total Present</span>
                  <span className="text-lg font-bold text-green-600">{attendanceStats?.present}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10">
                  <span className="text-sm font-medium">Total Late</span>
                  <span className="text-lg font-bold text-yellow-600">{attendanceStats?.late}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="details" className="mobile-touch-target">
                  <User className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Details</span>
                </TabsTrigger>
                <TabsTrigger value="insights" className="mobile-touch-target">
                  <Sparkles className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">AI Insights</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="mobile-touch-target">
                  <Bell className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Alerts</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details">
                <Card className="glass-panel">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Personal Information</CardTitle>
                      <Button 
                        variant={isEditing ? "default" : "outline"}
                        onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                        className="mobile-touch-target"
                      >
                        {isEditing ? 'Save' : 'Edit'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="display_name">Display Name</Label>
                        <Input
                          id="display_name"
                          value={formData.display_name}
                          onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                          disabled={!isEditing}
                          className="mobile-touch-target"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          value={user?.email || ''}
                          disabled
                          className="mobile-touch-target"
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <h3 className="font-semibold mb-4">Parent/Guardian Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="parent_name">Parent Name</Label>
                          <Input
                            id="parent_name"
                            value={formData.parent_name}
                            onChange={(e) => setFormData({...formData, parent_name: e.target.value})}
                            disabled={!isEditing}
                            className="mobile-touch-target"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="parent_email">Parent Email</Label>
                          <Input
                            id="parent_email"
                            type="email"
                            value={formData.parent_email}
                            onChange={(e) => setFormData({...formData, parent_email: e.target.value})}
                            disabled={!isEditing}
                            className="mobile-touch-target"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="parent_phone">Parent Phone</Label>
                          <Input
                            id="parent_phone"
                            value={formData.parent_phone}
                            onChange={(e) => setFormData({...formData, parent_phone: e.target.value})}
                            disabled={!isEditing}
                            className="mobile-touch-target"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="insights">
                <Card className="glass-panel">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-purple-500" />
                          AI-Powered Insights
                        </CardTitle>
                        <CardDescription>Personalized analytics powered by AI</CardDescription>
                      </div>
                      <Button onClick={generateAIInsight} className="mobile-touch-target">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Generate
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {aiInsights && aiInsights.length > 0 ? (
                      aiInsights.map((insight: any) => (
                        <div key={insight.id} className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                          <div className="flex justify-between items-start mb-2">
                            <Badge variant="secondary">{insight.insight_type.replace('_', ' ')}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(insight.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="mt-2 text-sm">
                            {insight.data?.insights && (
                              <ul className="list-disc list-inside space-y-1">
                                {insight.data.insights.map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No AI insights yet. Click "Generate" to create personalized insights!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notifications">
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      Notifications & Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {notifications && notifications.length > 0 ? (
                      notifications.map((notif: any) => (
                        <div 
                          key={notif.id} 
                          className={`p-4 rounded-lg border transition-all hover:shadow-md ${
                            notif.read 
                              ? 'bg-muted/30 border-muted' 
                              : 'bg-primary/5 border-primary/20'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-sm">{notif.title}</h4>
                            <Badge variant={notif.type === 'warning' ? 'destructive' : 'default'}>
                              {notif.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{notif.message}</p>
                          <span className="text-xs text-muted-foreground mt-2 block">
                            {new Date(notif.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No notifications yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default Profile;