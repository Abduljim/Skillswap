import { useEffect, useState } from 'react';

interface Props {
  skills: string[];
  activeSkill: string;
}

export function SkillsConstellation({ skills, activeSkill }: Props) {
  const positions = [
    { x: 50, y: 22 },
    { x: 12, y: 40 },
    { x: 88, y: 50 },
    { x: 30, y: 75 },
    { x: 70, y: 88 },
    { x: 14, y: 18 },
    { x: 82, y: 14 },
    { x: 56, y: 50 },
  ];

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPulse((p) => (p + 1) % skills.length), 2200);
    return () => clearInterval(t);
  }, [skills.length]);

  return (
    <div className="relative w-full h-full">
      {/* Connecting lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {positions.map((a, i) =>
          positions.slice(i + 1).map((b, j) => {
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist > 50) return null;
            return (
              <line
                key={`${i}-${j}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(13,15,21,0.08)"
                strokeWidth="0.2"
                vectorEffect="non-scaling-stroke"
              />
            );
          })
        )}
        <line
          x1={50}
          y1={50}
          x2={positions[pulse].x}
          y2={positions[pulse].y}
          stroke="#fb4f1d"
          strokeWidth="0.3"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
      </svg>

      {/* YOU center node */}
      <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
        <div className="relative">
          <div className="absolute inset-0 -m-3 bg-ink-900/10 rounded-full animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-ink-900 text-cream-50 flex items-center justify-center font-display font-bold shadow-soft-lg">
            You
          </div>
        </div>
      </div>

      {/* Skill nodes */}
      {skills.map((skill, i) => {
        const pos = positions[i];
        const isActive = skill === activeSkill;
        return (
          <div
            key={skill}
            className="absolute transition-all"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%,-50%)',
            }}
          >
            <div
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-coral-500 text-white shadow-soft-lg scale-110'
                  : 'bg-white text-ink-900 shadow-soft'
              }`}
            >
              {skill}
            </div>
          </div>
        );
      })}

      <div className="absolute bottom-2 right-2 text-xs text-ink-500 bg-cream-50/80 backdrop-blur rounded-full px-3 py-1">
        Hover the constellation to explore
      </div>
    </div>
  );
}