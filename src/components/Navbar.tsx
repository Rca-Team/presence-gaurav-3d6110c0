
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Logo from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sun, Moon } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/integrations/supabase/client';
import ProfileDropdown from './ProfileDropdown';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  
  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY;
      setIsScrolled(offset > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 md:px-8 py-4 backdrop-blur-md",
        isScrolled ? "bg-white/80 dark:bg-black/30 shadow-sm" : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="animate-fade-in">
          <Logo />
        </Link>
        
        {/* Desktop Navigation - Hidden on Mobile */}
        <nav className="hidden md:flex items-center space-x-1 animate-fade-in">
          {[
            { text: 'Home', path: '/' },
            { text: 'Dashboard', path: '/dashboard' },
            { text: 'Profile', path: '/profile' },
            { text: 'Register', path: '/register' },
            { text: 'Attendance', path: '/attendance' },
            { text: 'Admin', path: '/admin' },
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors mobile-touch-target",
                isActive(item.path)
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {item.text}
            </Link>
          ))}
        </nav>
        
        {/* Auth section - Only show on desktop */}
        <div className="hidden md:flex items-center space-x-4 animate-fade-in">
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
          {isAuthenticated ? (
            <ProfileDropdown />
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="animate-pulse-subtle">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
