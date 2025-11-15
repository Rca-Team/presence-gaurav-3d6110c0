
import React from 'react';
import { cn } from '@/lib/utils';
import { GraduationCap, BookOpen, Award } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const Logo: React.FC<LogoProps> = ({ className, size = 'md' }) => {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  return (
    <div className={cn("font-semibold tracking-tight flex items-center gap-2", sizeClasses[size], className)}>
      <div className="relative w-12 h-12 rounded-lg overflow-hidden group hover-3d">
        {/* Animated background with enhanced shine effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/40 via-indigo-600/40 to-sky-500/40 animate-pulse-subtle"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer bg-[length:200%_100%]"></div>
        
        {/* School icons that rotate on hover with smoother transitions */}
        <div className="absolute inset-0 flex items-center justify-center transition-all duration-500 group-hover:rotate-0 rotate-0">
          <GraduationCap className="w-6 h-6 text-primary animate-float z-10" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center transition-all duration-500 opacity-0 group-hover:opacity-100 rotate-90">
          <BookOpen className="w-6 h-6 text-[hsl(var(--school-green))] animate-float z-10" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center transition-all duration-500 opacity-0 group-hover:opacity-100 rotate-180">
          <Award className="w-6 h-6 text-[hsl(var(--school-yellow))] animate-float z-10" />
        </div>
        
        {/* Decorative school elements with glow effect */}
        <div className="absolute bottom-1 left-1 w-2 h-2 bg-[hsl(var(--school-red))] rounded-full opacity-70 shadow-[0_0_10px_rgba(220,38,38,0.5)]"></div>
        <div className="absolute top-1 right-1 w-2 h-2 bg-[hsl(var(--school-green))] rounded-full opacity-70 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
        <div className="absolute top-1 left-1 w-2 h-2 bg-[hsl(var(--school-blue))] rounded-full opacity-70 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
        <div className="absolute bottom-1 right-1 w-2 h-2 bg-[hsl(var(--school-yellow))] rounded-full opacity-70 shadow-[0_0_10px_rgba(234,179,8,0.5)]"></div>
      </div>
      <div className="flex flex-col">
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 animate-shimmer bg-[length:200%_100%]">Presence</span>
        <span className="text-xs text-muted-foreground mt-[-3px]">School Attendance</span>
      </div>
    </div>
  );
};

export default Logo;
