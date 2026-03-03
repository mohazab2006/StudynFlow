import { useEffect, useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isToday,
  parseISO,
} from 'date-fns';
import { useTasks, useRecurringTemplates } from '../hooks/useTasks';
import type { TaskWithCourse } from '../lib/types';
import TaskList from '../components/tasks/TaskList';
import type { RecurrenceRule } from '../lib/types';
import { formatRecurrenceRule } from '../lib/recurrenceFormat';
import { rankTasksByFocus } from '../services/focusScoring';
import { getConflictWarnings } from '../services/conflictDetection';
import { useTodaysStudyBlocks } from '../hooks/useCopilot';
import { Link } from 'react-router-dom';

type WeatherInfo = {
  locationLabel: string;
  temperatureC: number;
  windKmh: number;
  weatherCode: number;
  fetchedAtIso: string;
};

function weatherTheme(code: number, currentHour?: number): {
  label: string;
  icon: 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';
  accentClass: string;
  bgClass: string;
  effect: 'rain' | 'snow' | 'sun' | 'cloud' | 'fog' | 'storm' | 'stars' | 'sunset';
} {
  // Determine if it's nighttime (roughly 6 PM to 6 AM)
  const isNight = currentHour !== undefined && (currentHour >= 18 || currentHour < 6);
  const isSunset = currentHour !== undefined && (currentHour >= 17 && currentHour < 19);
  
  // Open-Meteo weather codes: https://open-meteo.com/en/docs
  if (code === 0) {
    return { 
      label: isNight ? 'Clear' : 'Sunny', 
      icon: 'sun', 
      accentClass: isNight ? 'text-slate-300' : 'text-amber-500', 
      bgClass: isNight ? 'bg-slate-500/10' : 'bg-amber-500/10', 
      effect: isNight ? 'stars' : 'sun'
    };
  }
  if (code === 1 || code === 2) {
    return {
      label: isNight ? 'Mostly Clear' : 'Mostly Sunny',
      icon: 'sun',
      accentClass: isNight ? 'text-slate-300' : isSunset ? 'text-orange-500' : 'text-amber-500',
      bgClass: isNight ? 'bg-slate-500/10' : 'bg-amber-500/10',
      effect: isNight ? 'stars' : isSunset ? 'sunset' : 'sun',
    };
  }
  if (code === 3) {
    return { 
      label: isNight ? 'Cloudy Night' : 'Cloudy', 
      icon: 'cloud', 
      accentClass: isNight ? 'text-slate-400' : 'text-slate-500', 
      bgClass: isNight ? 'bg-slate-600/15' : 'bg-slate-500/10', 
      effect: 'cloud' 
    };
  }
  if (code === 45 || code === 48) {
    return { 
      label: 'Foggy', 
      icon: 'fog', 
      accentClass: 'text-slate-400', 
      bgClass: 'bg-slate-500/15', 
      effect: 'fog' 
    };
  }
  if (code >= 51 && code <= 57) {
    return { 
      label: 'Drizzle', 
      icon: 'rain', 
      accentClass: 'text-sky-400', 
      bgClass: 'bg-sky-500/15', 
      effect: 'rain' 
    };
  }
  if (code >= 61 && code <= 67) {
    return { 
      label: 'Rainy', 
      icon: 'rain', 
      accentClass: 'text-sky-500', 
      bgClass: 'bg-sky-500/15', 
      effect: 'rain' 
    };
  }
  if (code >= 71 && code <= 77) {
    return { 
      label: 'Snowy', 
      icon: 'snow', 
      accentClass: 'text-cyan-400', 
      bgClass: 'bg-cyan-500/15', 
      effect: 'snow' 
    };
  }
  if (code >= 80 && code <= 82) {
    return { 
      label: 'Heavy Rain', 
      icon: 'rain', 
      accentClass: 'text-blue-600', 
      bgClass: 'bg-blue-500/20', 
      effect: 'rain' 
    };
  }
  if (code >= 95) {
    return { 
      label: 'Stormy', 
      icon: 'storm', 
      accentClass: 'text-violet-400', 
      bgClass: 'bg-violet-500/20', 
      effect: 'storm' 
    };
  }
  return { 
    label: isNight ? 'Cloudy Night' : 'Cloudy', 
    icon: 'cloud', 
    accentClass: isNight ? 'text-slate-400' : 'text-slate-500', 
    bgClass: isNight ? 'bg-slate-600/15' : 'bg-slate-500/10', 
    effect: 'cloud' 
  };
}

// Weather effect components
function RainEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Light rain drops */}
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-0.5 h-8 bg-sky-400/80 rounded-full"
          style={{
            left: `${(i * 2.8) % 100}%`,
            top: `${-20 + (i * 2) % 30}%`,
            animation: `rain-fall ${0.6 + (i % 4) * 0.15}s linear infinite`,
            animationDelay: `${(i * 0.05) % 1.2}s`,
            boxShadow: '0 0 2px rgba(56, 189, 248, 0.6)',
          }}
        />
      ))}
      {/* Medium rain drops */}
      {Array.from({ length: 25 }).map((_, i) => (
        <div
          key={`med-${i}`}
          className="absolute w-1 h-10 bg-blue-500/90 rounded-full"
          style={{
            left: `${(i * 4.2) % 100}%`,
            top: `${-25 + (i * 3) % 35}%`,
            animation: `rain-fall-heavy ${0.5 + (i % 3) * 0.1}s linear infinite`,
            animationDelay: `${(i * 0.07) % 1}s`,
            boxShadow: '0 0 3px rgba(59, 130, 246, 0.7)',
          }}
        />
      ))}
      <style>{`
        @keyframes rain-fall {
          0% { transform: translateY(-120px) translateX(0); opacity: 0.9; }
          100% { transform: translateY(220px) translateX(12px); opacity: 0.4; }
        }
        @keyframes rain-fall-heavy {
          0% { transform: translateY(-120px) translateX(0); opacity: 1; }
          100% { transform: translateY(220px) translateX(18px); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function SnowEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Small snowflakes */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="absolute bg-white/90 rounded-full"
          style={{
            width: `${2 + (i % 2)}px`,
            height: `${2 + (i % 2)}px`,
            left: `${(i * 3.5) % 100}%`,
            top: `${-20 + (i * 2.5) % 35}%`,
            animation: `snow-fall ${2 + (i % 5) * 0.3}s linear infinite`,
            animationDelay: `${(i * 0.1) % 2}s`,
            boxShadow: '0 0 3px rgba(255, 255, 255, 0.9), 0 0 6px rgba(207, 250, 254, 0.6)',
          }}
        />
      ))}
      {/* Medium snowflakes */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={`med-${i}`}
          className="absolute bg-white rounded-full"
          style={{
            width: `${4 + (i % 3)}px`,
            height: `${4 + (i % 3)}px`,
            left: `${(i * 5) % 100}%`,
            top: `${-25 + (i * 4) % 40}%`,
            animation: `snow-fall-slow ${3 + (i % 4) * 0.5}s linear infinite`,
            animationDelay: `${(i * 0.15) % 2.5}s`,
            boxShadow: '0 0 4px rgba(255, 255, 255, 1), 0 0 8px rgba(207, 250, 254, 0.7)',
          }}
        />
      ))}
      {/* Large snowflakes */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={`large-${i}`}
          className="absolute bg-white rounded-full"
          style={{
            width: `${6 + (i % 2)}px`,
            height: `${6 + (i % 2)}px`,
            left: `${(i * 12.5) % 100}%`,
            top: `${-30 + (i * 8) % 50}%`,
            animation: `snow-fall-slowest ${4 + (i % 3) * 0.6}s linear infinite`,
            animationDelay: `${(i * 0.2) % 3}s`,
            boxShadow: '0 0 6px rgba(255, 255, 255, 1), 0 0 12px rgba(207, 250, 254, 0.8)',
          }}
        />
      ))}
      <style>{`
        @keyframes snow-fall {
          0% { transform: translateY(-120px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(220px) translateX(35px) rotate(360deg); opacity: 0.7; }
        }
        @keyframes snow-fall-slow {
          0% { transform: translateY(-120px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(220px) translateX(50px) rotate(720deg); opacity: 0.6; }
        }
        @keyframes snow-fall-slowest {
          0% { transform: translateY(-120px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(220px) translateX(60px) rotate(1080deg); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function SunEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Sun glow layers */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-amber-300/40 blur-3xl"
        style={{
          animation: 'sun-pulse-outer 4s ease-in-out infinite',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-amber-400/50 blur-2xl"
        style={{
          animation: 'sun-pulse 3s ease-in-out infinite',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-yellow-300/60 blur-xl"
        style={{
          animation: 'sun-pulse-inner 2.5s ease-in-out infinite',
        }}
      />
      {/* Sun rays */}
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 w-1 h-14 bg-gradient-to-b from-amber-400/80 to-transparent origin-top rounded-full"
          style={{
            transform: `translate(-50%, -50%) rotate(${i * 22.5}deg)`,
            animation: `sun-rotate 30s linear infinite`,
            boxShadow: '0 0 6px rgba(251, 191, 36, 0.7), 0 0 12px rgba(251, 191, 36, 0.4)',
          }}
        />
      ))}
      {/* Bright center */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-yellow-200 blur-sm"
        style={{
          boxShadow: '0 0 20px rgba(254, 240, 138, 0.9)',
        }}
      />
      <style>{`
        @keyframes sun-pulse-outer {
          0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.2); }
        }
        @keyframes sun-pulse {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.15); }
        }
        @keyframes sun-pulse-inner {
          0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.9; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes sun-rotate {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function CloudEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Large clouds */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-slate-400/70"
          style={{
            width: `${60 + i * 25}px`,
            height: `${40 + i * 20}px`,
            left: `${10 + i * 20}%`,
            top: `${5 + i * 18}%`,
            animation: `cloud-drift ${8 + i * 2}s ease-in-out infinite`,
            animationDelay: `${i * 1.5}s`,
            filter: 'blur(10px)',
            boxShadow: `0 0 ${25 + i * 8}px rgba(100, 116, 139, 0.5)`,
          }}
        />
      ))}
      {/* Medium clouds */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={`med-${i}`}
          className="absolute rounded-full bg-slate-300/60"
          style={{
            width: `${45 + i * 15}px`,
            height: `${30 + i * 12}px`,
            left: `${20 + i * 25}%`,
            top: `${15 + i * 22}%`,
            animation: `cloud-drift-slow ${10 + i * 2.5}s ease-in-out infinite`,
            animationDelay: `${i * 2}s`,
            filter: 'blur(8px)',
            boxShadow: `0 0 ${20 + i * 5}px rgba(148, 163, 184, 0.4)`,
          }}
        />
      ))}
      {/* Small clouds for depth */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={`small-${i}`}
          className="absolute rounded-full bg-slate-500/50"
          style={{
            width: `${30 + i * 8}px`,
            height: `${20 + i * 6}px`,
            left: `${15 + i * 18}%`,
            top: `${25 + i * 15}%`,
            animation: `cloud-drift-fast ${6 + i * 1.5}s ease-in-out infinite`,
            animationDelay: `${i * 1.2}s`,
            filter: 'blur(6px)',
          }}
        />
      ))}
      <style>{`
        @keyframes cloud-drift {
          0%, 100% { transform: translateX(0) translateY(0); opacity: 0.7; }
          50% { transform: translateX(20px) translateY(-10px); opacity: 0.85; }
        }
        @keyframes cloud-drift-slow {
          0%, 100% { transform: translateX(0) translateY(0); opacity: 0.6; }
          50% { transform: translateX(15px) translateY(-8px); opacity: 0.8; }
        }
        @keyframes cloud-drift-fast {
          0%, 100% { transform: translateX(0) translateY(0); opacity: 0.5; }
          50% { transform: translateX(12px) translateY(-6px); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

function StarEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Small twinkling stars */}
      {Array.from({ length: 35 }).map((_, i) => {
        const size = 1 + (i % 3);
        const left = (i * 6.5) % 100;
        const top = (i * 9) % 100;
        const delay = (i * 0.12) % 3;
        const duration = 1.5 + (i % 4) * 0.3;
        
        return (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${left}%`,
              top: `${top}%`,
              animation: `star-twinkle ${duration}s ease-in-out infinite`,
              animationDelay: `${delay}s`,
              boxShadow: `0 0 ${size * 2}px rgba(255, 255, 255, 0.9), 0 0 ${size * 4}px rgba(255, 255, 255, 0.5), 0 0 ${size * 6}px rgba(255, 255, 255, 0.2)`,
            }}
          />
        );
      })}
      {/* Medium bright stars */}
      {Array.from({ length: 8 }).map((_, i) => {
        const left = 15 + (i * 12);
        const top = 10 + (i * 15);
        const delay = (i * 0.25) % 2;
        
        return (
          <div
            key={`bright-${i}`}
            className="absolute rounded-full bg-white"
            style={{
              width: '2.5px',
              height: '2.5px',
              left: `${left}%`,
              top: `${top}%`,
              animation: `star-twinkle-bright 2s ease-in-out infinite`,
              animationDelay: `${delay}s`,
              boxShadow: '0 0 5px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 255, 0.7), 0 0 15px rgba(255, 255, 255, 0.4), 0 0 20px rgba(255, 255, 255, 0.2)',
            }}
          />
        );
      })}
      {/* Large brightest stars */}
      {Array.from({ length: 3 }).map((_, i) => {
        const positions = [[30, 25], [70, 45], [50, 70]];
        const [left, top] = positions[i];
        const delay = i * 0.5;
        
        return (
          <div
            key={`large-${i}`}
            className="absolute rounded-full bg-white"
            style={{
              width: '3px',
              height: '3px',
              left: `${left}%`,
              top: `${top}%`,
              animation: `star-twinkle-large 2.5s ease-in-out infinite`,
              animationDelay: `${delay}s`,
              boxShadow: '0 0 6px rgba(255, 255, 255, 1), 0 0 12px rgba(255, 255, 255, 0.8), 0 0 18px rgba(255, 255, 255, 0.5), 0 0 24px rgba(255, 255, 255, 0.3)',
            }}
          />
        );
      })}
      <style>{`
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes star-twinkle-bright {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes star-twinkle-large {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}

function FogEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Fog layers */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-slate-300/40"
          style={{
            width: `${80 + i * 30}px`,
            height: `${20 + i * 10}px`,
            left: `${-10 + i * 20}%`,
            top: `${10 + i * 15}%`,
            animation: `fog-drift ${12 + i * 3}s ease-in-out infinite`,
            animationDelay: `${i * 2}s`,
            filter: 'blur(15px)',
            boxShadow: `0 0 ${30 + i * 10}px rgba(148, 163, 184, 0.3)`,
          }}
        />
      ))}
      {/* Additional mist layers */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={`mist-${i}`}
          className="absolute rounded-full bg-slate-200/30"
          style={{
            width: `${60 + i * 20}px`,
            height: `${15 + i * 8}px`,
            left: `${5 + i * 25}%`,
            top: `${25 + i * 18}%`,
            animation: `fog-drift-slow ${15 + i * 4}s ease-in-out infinite`,
            animationDelay: `${i * 2.5}s`,
            filter: 'blur(12px)',
          }}
        />
      ))}
      <style>{`
        @keyframes fog-drift {
          0%, 100% { transform: translateX(0) translateY(0); opacity: 0.4; }
          50% { transform: translateX(25px) translateY(-5px); opacity: 0.6; }
        }
        @keyframes fog-drift-slow {
          0%, 100% { transform: translateX(0) translateY(0); opacity: 0.3; }
          50% { transform: translateX(20px) translateY(-3px); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function StormEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Lightning flashes */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-0 bg-white/0"
          style={{
            animation: `lightning ${4 + i * 2}s ease-in-out infinite`,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}
      {/* Heavy rain for storm */}
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          key={`rain-${i}`}
          className="absolute w-1 h-12 bg-blue-600/90 rounded-full"
          style={{
            left: `${(i * 2.2) % 100}%`,
            top: `${-30 + (i * 1.8) % 40}%`,
            animation: `rain-fall-storm ${0.4 + (i % 3) * 0.1}s linear infinite`,
            animationDelay: `${(i * 0.03) % 0.8}s`,
            boxShadow: '0 0 4px rgba(37, 99, 235, 0.8)',
          }}
        />
      ))}
      <style>{`
        @keyframes lightning {
          0%, 90%, 100% { opacity: 0; }
          91% { opacity: 0.8; }
          92% { opacity: 0; }
          93% { opacity: 0.6; }
          94% { opacity: 0; }
        }
        @keyframes rain-fall-storm {
          0% { transform: translateY(-120px) translateX(0); opacity: 1; }
          100% { transform: translateY(220px) translateX(20px); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

function SunsetEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Sunset gradient layers */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-orange-500/30 via-pink-400/20 to-purple-300/15"
        style={{
          animation: 'sunset-pulse 4s ease-in-out infinite',
        }}
      />
      {/* Warm glow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-32 rounded-full bg-orange-400/40 blur-3xl"
        style={{
          animation: 'sunset-glow 3s ease-in-out infinite',
        }}
      />
      {/* Sun rays */}
      {Array.from({ length: 12 }).map((_, i) => {
        const rotation = i * 30 - 15;
        return (
          <div
            key={i}
            className="absolute bottom-0 left-1/2 w-1 h-20 bg-gradient-to-t from-orange-400/60 to-transparent origin-bottom rounded-full"
            style={{
              transform: `translateX(-50%) rotate(${rotation}deg)`,
              animation: `sunset-rays-${i} 5s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
              boxShadow: '0 0 8px rgba(251, 146, 60, 0.6)',
            }}
          />
        );
      })}
      <style>{`
        @keyframes sunset-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        @keyframes sunset-glow {
          0%, 100% { opacity: 0.4; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.6; transform: translateX(-50%) scale(1.1); }
        }
        ${Array.from({ length: 12 }).map((_, i) => {
          const rotation = i * 30 - 15;
          return `
            @keyframes sunset-rays-${i} {
              0%, 100% { opacity: 0.5; transform: translateX(-50%) rotate(${rotation}deg) scaleY(1); }
              50% { opacity: 0.8; transform: translateX(-50%) rotate(${rotation}deg) scaleY(1.2); }
            }
          `;
        }).join('')}
      `}</style>
    </div>
  );
}

function WeatherGlyph({ kind, className }: { kind: ReturnType<typeof weatherTheme>['icon']; className?: string }) {
  // Tiny inline SVGs (no deps), tuned to feel modern + not “generic emoji”.
  switch (kind) {
    case 'sun':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3v2.2M12 18.8V21M4.2 12H3M21 12h-1.2M6.1 6.1 4.6 4.6M19.4 19.4l-1.5-1.5M17.9 6.1l1.5-1.5M4.6 19.4l1.5-1.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    case 'cloud':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8.8 18h8.1a3.6 3.6 0 0 0 .5-7.2A5.6 5.6 0 0 0 6.9 9.6 3.5 3.5 0 0 0 8.8 18Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'rain':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8.8 14.5h8.1a3.6 3.6 0 0 0 .5-7.2A5.6 5.6 0 0 0 6.9 6.1 3.5 3.5 0 0 0 8.8 14.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9 18.2l-.9 1.6M13 18.2l-.9 1.6M17 18.2l-.9 1.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'snow':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8.8 14.5h8.1a3.6 3.6 0 0 0 .5-7.2A5.6 5.6 0 0 0 6.9 6.1 3.5 3.5 0 0 0 8.8 14.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9.2 18.2h0M12 19.2h0M14.8 18.2h0"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'storm':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8.8 14.2h8.1a3.6 3.6 0 0 0 .5-7.2A5.6 5.6 0 0 0 6.9 5.8 3.5 3.5 0 0 0 8.8 14.2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12.6 14.4 10 18.6h2.2l-1 3.2 3.8-5.4h-2.2l.8-2Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      );
    case 'fog':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7.7 13.2h9.2a3.6 3.6 0 0 0 .5-7.2A5.6 5.6 0 0 0 6.9 4.8 3.5 3.5 0 0 0 7.7 13.2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 16h13M6.5 18.5h11M7.5 21h9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.8"
          />
        </svg>
      );
    default:
      return null;
  }
}

async function getLocation(): Promise<{ latitude: number; longitude: number; label?: string }> {
  // 1) Try browser geolocation (best accuracy)
  const geo = await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 10 * 60 * 1000 }
    );
  });

  if (geo) return geo;

  // 2) Fallback: IP-based approximate location (no permissions prompt)
  const ipRes = await fetch('https://ipapi.co/json/');
  if (!ipRes.ok) throw new Error('Failed to determine location');
  const ipJson = await ipRes.json();
  const latitude = Number(ipJson.latitude);
  const longitude = Number(ipJson.longitude);
  const labelParts = [ipJson.city, ipJson.region, ipJson.country_name].filter(Boolean);
  return { latitude, longitude, label: labelParts.join(', ') || 'Your area' };
}

async function fetchWeatherInfo(): Promise<WeatherInfo> {
  const loc = await getLocation();
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(loc.latitude)}` +
    `&longitude=${encodeURIComponent(loc.longitude)}` +
    `&current_weather=true&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch weather');
  const json = await res.json();
  const cw = json?.current_weather;
  if (!cw) throw new Error('Weather unavailable');

  // Note: reverse-geocoding is blocked by CORS in some webviews during dev.
  // We keep this robust by only using the IP label fallback or a generic label.
  const label = loc.label || 'Your location';

  return {
    locationLabel: label,
    temperatureC: Number(cw.temperature),
    windKmh: Number(cw.windspeed),
    weatherCode: Number(cw.weathercode),
    fetchedAtIso: new Date().toISOString(),
  };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-foreground">{title}</div>
      {children}
    </div>
  );
}

const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getCalendarDays(month: Date): Date[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const rangeStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
}

function tasksByDate(tasks: TaskWithCourse[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const task of tasks) {
    if (!task.due_at) continue;
    const dateKey = format(parseISO(task.due_at), 'yyyy-MM-dd');
    map.set(dateKey, (map.get(dateKey) ?? 0) + 1);
  }
  return map;
}

export default function HomePage() {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const refreshWeather = async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const info = await fetchWeatherInfo();
      setWeather(info);
    } catch (e) {
      setWeatherError(String((e as any)?.message ?? e ?? 'Failed to load weather'));
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    // Load once and refresh occasionally
    refreshWeather();
    const id = setInterval(() => refreshWeather(), 15 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: today = [], isLoading: todayLoading } = useTasks({
    dueRange: 'today',
    includeCompleted: false,
  });
  const { data: overdue = [], isLoading: overdueLoading } = useTasks({
    dueRange: 'overdue',
    includeCompleted: false,
  });
  const { data: upcoming = [], isLoading: upcomingLoading } = useTasks({
    dueRange: '7days',
    includeCompleted: false,
  });
  const { data: schoolAll = [], isLoading: schoolAllLoading } = useTasks({
    workspace: 'school',
    includeCompleted: false,
  });
  const { data: lifeAll = [], isLoading: lifeAllLoading } = useTasks({
    workspace: 'life',
    includeCompleted: false,
  });
  const { data: recurringTemplates = [], isLoading: recurringLoading } = useRecurringTemplates();

  const calendarMonth = useMemo(() => startOfMonth(now), [now]);
  const calendarMonthEnd = endOfMonth(now);
  const { data: monthTasks = [] } = useTasks({
    dueAfter: calendarMonth.toISOString(),
    dueBefore: new Date(calendarMonthEnd.getTime() + 1).toISOString(),
    includeCompleted: true,
  });
  const miniCalendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const monthTasksByDay = useMemo(() => tasksByDate(monthTasks), [monthTasks]);

  const isLoading = todayLoading || overdueLoading || upcomingLoading || schoolAllLoading || lifeAllLoading;
  const schoolCount = schoolAll.length;
  const lifeCount = lifeAll.length;

  const topUpcoming = useMemo(() => upcoming.slice(0, 8), [upcoming]);
  const topToday = useMemo(() => [...overdue, ...today].slice(0, 8), [overdue, today]);

  const focusPool = useMemo(
    () => [...overdue, ...today, ...upcoming],
    [overdue, today, upcoming]
  );
  const [focusFilter, setFocusFilter] = useState<'all' | 'school' | 'life'>('all');
  const focusFiltered = useMemo(() => {
    if (focusFilter === 'school') return focusPool.filter((t) => t.workspace === 'school');
    if (focusFilter === 'life') return focusPool.filter((t) => t.workspace === 'life');
    return focusPool;
  }, [focusPool, focusFilter]);
  const focusRanked = useMemo(
    () => rankTasksByFocus(focusFiltered, { now }),
    [focusFiltered, now]
  );
  const topFocus = useMemo(() => focusRanked.slice(0, 5), [focusRanked]);
  const conflictWarnings = useMemo(() => getConflictWarnings(focusPool), [focusPool]);
  const { data: todaysStudyBlocks = [] } = useTodaysStudyBlocks();

  return (
    <div className="max-w-7xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-3xl font-semibold">Home</div>
          <div className="text-sm text-muted-foreground mt-1">
            {format(now, 'EEEE, MMM d')}
          </div>
        </div>

        <div className="text-right">
          <div className="text-4xl font-semibold tabular-nums">{format(now, 'h:mm:ss a')}</div>
          <div className="text-sm text-muted-foreground mt-1">Local time</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card title="Snapshot">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted p-3">
                <div className="mb-1 text-xs text-muted-foreground">Today</div>
                <div className="text-2xl font-semibold tabular-nums">{today.length + overdue.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted p-3">
                <div className="mb-1 text-xs text-muted-foreground">Upcoming (7d)</div>
                <div className="text-2xl font-semibold tabular-nums">{upcoming.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted p-3">
                <div className="mb-1 text-xs text-muted-foreground">School</div>
                <div className="text-2xl font-semibold tabular-nums">{schoolCount}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted p-3">
                <div className="mb-1 text-xs text-muted-foreground">Life</div>
                <div className="text-2xl font-semibold tabular-nums">{lifeCount}</div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Weather">
          {weatherLoading ? (
            <div className="text-sm text-muted-foreground">Loading weather…</div>
          ) : weatherError ? (
            <div className="space-y-2">
              <div className="text-sm text-red-500">{weatherError}</div>
              <button
                type="button"
                onClick={refreshWeather}
                className="px-2 py-1 text-xs rounded border border-border hover:bg-muted"
              >
                Retry
              </button>
              <div className="text-xs text-muted-foreground">
                Tip: if you blocked location access, we'll fall back to approximate IP location.
              </div>
            </div>
          ) : weather ? (
            <div className="space-y-2">
              {(() => {
                const currentHour = now.getHours();
                const theme = weatherTheme(weather.weatherCode, currentHour);
                return (
                  <div className="relative overflow-hidden rounded-xl border border-border bg-muted p-4 shadow-sm">
                    {/* Weather animations (neutral tones for dark theme) */}
                    {theme.effect === 'rain' && <RainEffect />}
                    {theme.effect === 'snow' && <SnowEffect />}
                    {theme.effect === 'sun' && <SunEffect />}
                    {theme.effect === 'cloud' && <CloudEffect />}
                    {theme.effect === 'fog' && <FogEffect />}
                    {theme.effect === 'storm' && <StormEffect />}
                    {theme.effect === 'stars' && <StarEffect />}
                    {theme.effect === 'sunset' && <SunsetEffect />}
                    <div className="relative z-10">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
                              <WeatherGlyph kind={theme.icon} className="h-6 w-6 text-foreground" />
                            </div>
                            <div>
                              <div className="text-base font-semibold text-foreground">
                                {theme.label}
                              </div>
                              <div className="truncate text-xs text-muted-foreground" title={weather.locationLabel}>
                                {weather.locationLabel}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-baseline gap-3">
                            <div className="text-4xl font-semibold tabular-nums leading-none text-foreground">
                              {Math.round(weather.temperatureC)}°
                            </div>
                            <div className="text-lg font-medium text-muted-foreground">C</div>
                          </div>

                          <div className="mt-2 flex items-center gap-3 border-t border-border pt-2">
                            <div className="flex items-center gap-1.5">
                              <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span className="text-xs font-medium text-muted-foreground">
                                {Math.round(weather.windKmh)} km/h
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Updated {format(new Date(weather.fetchedAtIso), 'h:mm a')}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={refreshWeather}
                          className="relative z-20 rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
                          title="Refresh"
                        >
                          ↻
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Weather unavailable.</div>
          )}
        </Card>

        <Card title="Focus">
          <div className="flex items-center gap-2 mb-3">
            {(['all', 'school', 'life'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFocusFilter(f)}
                className={`px-2 py-1 text-xs rounded border ${
                  focusFilter === f ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'
                }`}
              >
                {f === 'all' ? 'All' : f === 'school' ? 'School' : 'Life'}
              </button>
            ))}
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : topFocus.length > 0 ? (
            <ul className="space-y-2">
              {topFocus.map((t) => (
                <li key={t.id} className="text-sm">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.focusReason}
                    {t.due_at ? ` · ${format(new Date(t.due_at), 'EEE MMM d')}` : ''}
                  </div>
                  {t.focusTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {t.focusTags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="inline-block px-1.5 py-0.5 text-[10px] rounded border border-border bg-muted/50"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">
              No tasks in this view. Change filter or add tasks.
            </div>
          )}
          {conflictWarnings.length > 0 && (
            <div className="mt-3 pt-2 border-t border-border text-xs text-muted-foreground">
              {conflictWarnings.slice(0, 2).map((w, i) => (
                <div key={i}>⚠ {w.message}</div>
              ))}
            </div>
          )}
          {todaysStudyBlocks.length > 0 && (
            <div className="mt-3 pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground">Today&apos;s study: </span>
              <Link to="/school" className="text-primary hover:underline">
                {todaysStudyBlocks[0].title}
              </Link>
              {todaysStudyBlocks.length > 1 && (
                <span className="text-muted-foreground"> +{todaysStudyBlocks.length - 1} more</span>
              )}
            </div>
          )}
        </Card>

        <Card title="Calendar">
          <div className="mb-2 text-xs font-medium text-muted-foreground text-center">
            {format(now, 'MMMM yyyy')}
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-3">
            {WEEKDAY_SHORT.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-0.5">
                {d}
              </div>
            ))}
            {miniCalendarDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const count = monthTasksByDay.get(dateKey) ?? 0;
              const inMonth = isSameMonth(day, calendarMonth);
              const today = isToday(day);
              return (
                <div
                  key={dateKey}
                  className={`flex flex-col items-center justify-center min-h-[28px] rounded text-xs ${
                    !inMonth ? 'opacity-35' : today ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground'
                  }`}
                >
                  {format(day, 'd')}
                  {inMonth && count > 0 && (
                    <span className="text-[8px] leading-none mt-0.5" title={`${count} task${count !== 1 ? 's' : ''}`}>
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <Link
            to="/calendar"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Open full calendar
          </Link>
        </Card>

        <Card title="Recurring Tasks">
          {recurringLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : recurringTemplates.length === 0 ? (
            <div className="text-sm text-muted-foreground">No recurring tasks set up</div>
          ) : (
            <div className="space-y-2">
              {recurringTemplates.slice(0, 4).map((template) => {
                let rule: RecurrenceRule | null = null;
                try {
                  if (template.recurrenceRuleJson) {
                    rule = JSON.parse(template.recurrenceRuleJson);
                  }
                } catch {
                  // Invalid rule, skip
                }

                return (
                  <div key={template.id} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{template.title}</div>
                      {rule && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatRecurrenceRule(rule, template.due_at)}
                        </div>
                      )}
                      {template.lifeCategory && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className="inline-block w-2 h-2 rounded-sm"
                            style={{ backgroundColor: template.lifeCategory.color || '#6B7280' }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {template.lifeCategory.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {recurringTemplates.length > 4 && (
                <div className="text-xs text-muted-foreground pt-1">
                  +{recurringTemplates.length - 4} more
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xl font-semibold">Today + Overdue</div>
            <div className="text-sm text-muted-foreground">
              {today.length + overdue.length} total · {topToday.length} shown
            </div>
          </div>
          {isLoading ? <div className="text-base text-muted-foreground">Loading...</div> : <TaskList tasks={topToday} />}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xl font-semibold">Next 7 days</div>
            <div className="text-sm text-muted-foreground">
              {upcoming.length} total · {topUpcoming.length} shown
            </div>
          </div>
          {isLoading ? <div className="text-base text-muted-foreground">Loading...</div> : <TaskList tasks={topUpcoming} />}
        </div>
      </div>
    </div>
  );
}



