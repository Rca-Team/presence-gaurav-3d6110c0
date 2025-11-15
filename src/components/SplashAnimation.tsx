
import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import Logo from '@/components/Logo';
import { Sparkles, Zap } from 'lucide-react';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 3500,
}) => {
  const [animationState, setAnimationState] = useState<'initial' | 'animate' | 'exit'>('initial');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setAnimationState('animate');

    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, duration / 50);

    const timer = setTimeout(() => {
      setAnimationState('exit');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 600);
    }, duration);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [duration, onComplete]);

  return (
    <div className={cn(
      "fixed inset-0 flex items-center justify-center z-50 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden",
      animationState === 'initial' && 'opacity-0',
      animationState === 'animate' && 'opacity-100 transition-opacity duration-700',
      animationState === 'exit' && 'opacity-0 transition-opacity duration-600'
    )}>
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: '2s' }} />
      </div>

      {/* Main content */}
      <div className={cn(
        "relative flex flex-col items-center",
        animationState === 'initial' && 'scale-90 opacity-0',
        animationState === 'animate' && 'scale-100 opacity-100 transition-all duration-1000 ease-out',
        animationState === 'exit' && 'scale-110 opacity-0 transition-all duration-600'
      )}>
        {/* Glowing orb behind logo */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 rounded-full blur-3xl animate-pulse"></div>
        </div>

        {/* Logo with neon glow */}
        <div className="relative mb-8">
          <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full opacity-20 blur-xl animate-pulse"></div>
          <div className="relative">
            <Logo size="lg" className="text-5xl md:text-6xl text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text animate-float" />
            
            {/* Sparkle effects */}
            <Sparkles 
              className={cn(
                "absolute -top-2 -right-2 h-6 w-6 text-cyan-400",
                animationState === 'animate' && 'animate-pulse'
              )} 
            />
            <Zap 
              className={cn(
                "absolute -bottom-2 -left-2 h-5 w-5 text-purple-400",
                animationState === 'animate' && 'animate-pulse'
              )}
              style={{ animationDelay: '0.5s' }}
            />
          </div>
        </div>

        {/* Animated text */}
        <div className={cn(
          "mb-8 text-center space-y-2",
          animationState === 'initial' && 'opacity-0 translate-y-4',
          animationState === 'animate' && 'opacity-100 translate-y-0 transition-all delay-300 duration-1000',
          animationState === 'exit' && 'opacity-0 -translate-y-4 transition-all duration-400'
        )}>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            PRESENCE
          </h1>
          <p className="text-slate-400 text-sm md:text-base tracking-wider font-light">
            Smart Attendance System
          </p>
        </div>

        {/* Modern progress bar */}
        <div className={cn(
          "w-64 md:w-80",
          animationState === 'initial' && 'opacity-0 scale-95',
          animationState === 'animate' && 'opacity-100 scale-100 transition-all delay-500 duration-1000',
          animationState === 'exit' && 'opacity-0 scale-95 transition-all duration-400'
        )}>
          <div className="relative h-1.5 bg-slate-800/50 rounded-full overflow-hidden backdrop-blur-sm">
            {/* Background shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
            
            {/* Progress fill */}
            <div 
              className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
              style={{ 
                width: `${progress}%`,
                boxShadow: '0 0 20px rgba(34, 211, 238, 0.5)'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            </div>
          </div>
          
          {/* Progress percentage */}
          <div className="mt-3 text-center">
            <span className="text-sm font-medium bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              {Math.round(progress)}%
            </span>
          </div>
        </div>

        {/* Loading dots */}
        <div className={cn(
          "flex gap-2 mt-6",
          animationState === 'initial' && 'opacity-0',
          animationState === 'animate' && 'opacity-100 transition-opacity delay-700 duration-1000',
          animationState === 'exit' && 'opacity-0 transition-opacity duration-300'
        )}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>

      {/* Scan line effect */}
      <div className={cn(
        "absolute inset-0 pointer-events-none",
        animationState === 'animate' && 'block',
        animationState !== 'animate' && 'hidden'
      )}>
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-float" />
      </div>
    </div>
  );
};

export default SplashAnimation;
