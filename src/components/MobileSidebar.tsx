
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Home, BarChart, UserPlus, Clock, Menu, User, ShieldCheck, Sun, Moon, UserCircle } from 'lucide-react';
import Logo from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/integrations/supabase/client';

const MobileSidebar = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  
  useEffect(() => {
    // Close the sidebar when location changes
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
    }
  };
  
  // Hide on desktop
  if (!isMobile) return null;
  
  const navigation = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Dashboard', path: '/dashboard', icon: BarChart },
    { name: 'Profile', path: '/profile', icon: User },
    { name: 'Register', path: '/register', icon: UserPlus },
    { name: 'Attendance', path: '/attendance', icon: Clock },
    { name: 'Admin', path: '/admin', icon: ShieldCheck },
  ];
  
  const isActive = (path: string) => location.pathname === path;

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const displayName = profile?.display_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:hidden flex justify-center">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="icon" className="rounded-full h-12 w-12 shadow-lg">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl max-h-[85vh] p-0 border-t">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b flex justify-between items-center">
              <Logo />
              <div className="flex items-center gap-2">
                {user && (
                  <Link to="/profile" onClick={() => setOpen(false)}>
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-8 w-8 rounded-full object-cover border-2 border-primary/20"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                        <UserCircle className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </Link>
                )}
                <Toggle 
                  pressed={theme === 'dark'} 
                  onPressedChange={toggleTheme}
                  aria-label="Toggle theme"
                  className="relative w-10 h-10 rounded-full bg-background hover:bg-accent"
                >
                  {theme === 'dark' ? (
                    <Moon className="h-5 w-5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 rotate-0 scale-100" />
                  ) : (
                    <Sun className="h-5 w-5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 rotate-0 scale-100 text-yellow-500 animate-pulse-subtle" />
                  )}
                </Toggle>
              </div>
            </div>
            
            <nav className="px-2 pt-4 pb-2 flex-1 overflow-y-auto">
              <ul className="space-y-1">
                {navigation.map((item) => (
                  <li key={item.name}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center py-3 px-4 rounded-lg",
                        isActive(item.path)
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 mr-3",
                        isActive(item.path) ? "text-primary" : "text-muted-foreground"
                      )} />
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            
            {!user && (
              <div className="p-4 border-t space-y-2">
                <Link to="/login" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <User className="h-4 w-4 mr-2" />
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup" className="block">
                  <Button className="w-full justify-start">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileSidebar;
