import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Cpu, Globe } from 'lucide-react';

export default function SplashScreen() {
  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const statuses = [
    "Establishing Secure Connection",
    "Initializing Neural Mesh",
    "Decrypting Local Vault",
    "Verifying Digital Identity",
    "Synchronizing Workspace"
  ];

  // Simulate progressive loading that completes near the 2.5s mark
  // but doesn't jump to 100% instantly — eases in as auth resolves
  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIdx(prev => (prev + 1) % statuses.length);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // Gradual progress: climbs to ~80% over 2.5s, never pretends to be exact
  useEffect(() => {
    const startTime = Date.now();
    const duration = 2500;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(80, Math.round((elapsed / duration) * 80));
      setProgress(pct);
      if (elapsed < duration) {
        requestAnimationFrame(tick);
      }
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="h-full w-full bg-wa-main flex flex-col items-center justify-between py-16 relative overflow-hidden">
      {/* Premium Ambient Background */}
      <div className="absolute inset-0 z-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-10%] w-[120%] h-[60%] bg-gradient-radial from-[#4D91FB]/30 to-transparent blur-[100px]"
        />
        <motion.div 
          animate={{ 
            scale: [1.3, 1, 1.3],
            opacity: [0.05, 0.15, 0.05],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[-20%] right-[-10%] w-[120%] h-[60%] bg-gradient-radial from-[#4D91FB]/20 to-transparent blur-[100px]"
        />
      </div>

      <div /> {/* Spacer */}

      <div className="flex flex-col items-center gap-12 z-10">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          {/* Main Logo Hexagon-style container */}
          <div className="w-32 h-32 relative flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-2 border-dashed border-[#4D91FB]/30 rounded-[40px]"
            />
            <div className="w-24 h-24 bg-gradient-to-br from-[#4D91FB] to-[#01755b] rounded-[32px] flex items-center justify-center shadow-[0_0_80px_rgba(0,168,132,0.5)] relative z-20 overflow-hidden group">
               <motion.div
                 animate={{ y: [-2, 2, -2] }}
                 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
               >
                 <svg viewBox="0 0 48 48" width="60" height="60" fill="none">
                   <path d="M24 8C15.163 8 8 15.163 8 24c0 2.96.792 5.733 2.177 8.118L8 40l8.136-2.13A15.934 15.934 0 0024 40c8.837 0 16-7.163 16-16S32.837 8 24 8z" fill="white" />
                   <path d="M32.5 27.784c-.457-.228-2.702-1.33-3.12-1.483-.417-.152-.72-.228-.024.457-1.022.228-.993 1.71-1.22 2.39-.228.456-.457.516-.914.290-2.479-1.24-4.11-2.212-5.748-5.015-.434-.748.434-.694 1.239-2.308.152-.304.076-.57-.038-.798-.114-.228-1.022-2.462-1.4-3.37-.368-.884-.742-.762-1.022-.776-.264-.013-.57-.016-.874-.016-.304 0-.798.114-1.216.57-.417.457-1.596 1.558-1.596 3.8s1.634 4.408 1.862 4.712c.228.304 3.212 4.903 7.784 6.882 2.895 1.25 4.03 1.356 5.48 1.142.882-.132 2.702-1.105 3.083-2.174.38-1.069.38-1.985.266-2.174-.11-.19-.417-.304-.873-.532z" fill="#4D91FB" />
                 </svg>
               </motion.div>
               {/* Gloss Shine */}
               <motion.div
                 animate={{ x: ['-150%', '150%'] }}
                 transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
                 className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
               />
            </div>
            
            {/* Orbital Rings */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border border-[#4D91FB]/10 rounded-full scale-150"
            />
          </div>
        </motion.div>

        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center">
            <motion.div
              initial={{ letterSpacing: '0.2em', opacity: 0 }}
              animate={{ letterSpacing: '0.6em', opacity: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="flex items-center gap-3"
            >
              <h1 className="text-wa-primary text-4xl font-black mb-1">QUIDEC</h1>
            </motion.div>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '120%' }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="h-[1px] bg-gradient-to-r from-transparent via-[#4D91FB] to-transparent mt-2"
            />
          </div>
          
          {/* Dynamic Status Text */}
          <div className="h-6 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={statusIdx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-wa-text-muted text-[10px] font-bold uppercase tracking-[0.3em] text-center"
              >
                {statuses[statusIdx]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Precision Progress Bar */}
          <div className="w-64 flex flex-col gap-2">
            <div className="h-1 bg-wa-secondary/20 rounded-full overflow-hidden relative backdrop-blur-sm border border-wa-border/5">
              <div
                style={{ width: `${progress}%` }}
                className="h-full bg-gradient-to-r from-[#4D91FB]/50 to-[#4D91FB] shadow-[0_0_10px_#4D91FB] transition-width duration-100 ease-linear"
              />
            </div>
            <div className="flex justify-between px-1">
              <span className="text-wa-text-muted text-[8px] font-bold">SECURE_INIT_SEQ</span>
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="text-[#4D91FB] text-[8px] font-bold"
              >
                LIVE
              </motion.span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Security Badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="flex flex-col items-center gap-4 z-10"
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Lock size={12} className="text-[#4D91FB]/70" />
            <span className="text-[9px] font-bold text-wa-text-muted/60 uppercase tracking-[0.2em]">Quantum-Safe</span>
          </div>
          <div className="w-[1px] h-3 bg-wa-border/10" />
          <div className="flex items-center gap-2">
            <Globe size={12} className="text-[#4D91FB]/70" />
            <span className="text-[9px] font-bold text-wa-text-muted/60 uppercase tracking-[0.2em]">Global Mesh</span>
          </div>
        </div>
        
        <div className="flex flex-col items-center gap-1">
          <p className="text-wa-text-muted text-[9px] font-black tracking-[0.4em] uppercase opacity-50">Advanced Agentic Architecture</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-1 h-1 rounded-full bg-[#4D91FB]" />
            <span className="text-wa-text-muted/20 text-[8px] font-bold tracking-widest uppercase">Deepmind Labs System</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}