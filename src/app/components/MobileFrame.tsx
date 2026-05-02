import type { ReactNode } from 'react';

export default function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full h-screen flex items-center justify-center overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 10%, #1a3344 0%, #0a0d0f 75%)',
      }}
    >
      {/* Phone body */}
      <div
        className="relative w-full sm:w-[393px] h-full sm:h-[852px] overflow-hidden bg-black sm:rounded-[50px] sm:shadow-[0_40px_120px_rgba(0,0,0,0.9),0_0_0_2px_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.04)]"
      >
        {/* Dynamic Island — only on desktop frame */}
        <div
          className="hidden sm:flex absolute top-3 left-1/2 -translate-x-1/2 bg-black rounded-full z-[200] items-center justify-end px-3 pointer-events-none border border-[#1c1c1c]"
          style={{ width: 126, height: 37 }}
        >
          {/* Front camera dot */}
          <div className="w-[13px] h-[13px] rounded-full bg-[#111] border border-[#2c2c2c] shadow-inner" />
        </div>

        {/* Side buttons — purely cosmetic on desktop */}
        <div className="hidden sm:block absolute right-[-3px] top-[140px] w-[3px] h-14 bg-[#2a2a2a] rounded-r-full z-[150]" />
        <div className="hidden sm:block absolute left-[-3px] top-[120px] w-[3px] h-9 bg-[#2a2a2a] rounded-l-full z-[150]" />
        <div className="hidden sm:block absolute left-[-3px] top-[170px] w-[3px] h-16 bg-[#2a2a2a] rounded-l-full z-[150]" />
        <div className="hidden sm:block absolute left-[-3px] top-[200px] w-[3px] h-16 bg-[#2a2a2a] rounded-l-full z-[150]" />

        {/* Home indicator */}
        <div className="hidden sm:flex absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/20 rounded-full z-[200] pointer-events-none" />

        {/* Subtle screen glare on desktop */}
        <div
          className="hidden sm:block absolute inset-0 rounded-[50px] pointer-events-none z-[199]"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 50%)',
          }}
        />

        {/* App content */}
        <div className="w-full h-full overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
