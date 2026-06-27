import type { FC } from "hono/jsx";

interface ScoreGaugeProps {
  score: number;
  grade?: string;
  size?: number;
}

export const ScoreGauge: FC<ScoreGaugeProps> = ({ score, grade, size = 160 }) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // グレード別のカラーマッピング
  const getGradeColorClass = (val: number) => {
    if (val >= 90) return "text-[#16A34A]";
    if (val >= 75) return "text-[#F6821F]";
    if (val >= 60) return "text-[#FAAE40]";
    return "text-[#FF4040]";
  };

  const colorClass = getGradeColorClass(score);

  return (
    <div class="flex flex-col items-center justify-center p-2 relative group select-none">
      
      {/* ゲージSVG */}
      <svg width={size} height={size} class="transform -rotate-90 transition-all duration-300">
        
        {/* 背景トラック（薄い円） */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--glass-border)"
          stroke-width={strokeWidth}
          fill="transparent"
        />
        
        {/* スコア表示メーター（アニメーション付き） */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          stroke-width={strokeWidth}
          fill="transparent"
          stroke-dasharray={circumference}
          stroke-dashoffset={offset}
          stroke-linecap="round"
          class={`${colorClass} transition-all duration-1000 ease-out`}
          style={`stroke-dashoffset: ${offset}; transition: stroke-dashoffset 1s ease-out;`}
        />
      </svg>
      
      {/* スコア・グレード数値テキスト（中央配置） */}
      <div 
        class="absolute flex flex-col items-center justify-center text-center pointer-events-none" 
        style={`width:${size}px; height:${size}px;`}
      >
        <span class="text-4xl font-black tracking-tight text-base-content leading-none">
          {score}
        </span>
        <span class="text-xs opacity-50 font-semibold tracking-wider uppercase mt-1">
          スコア
        </span>
        {grade && (
          <span class={`text-sm font-black mt-1 px-2.5 py-0.5 rounded-full bg-base-200/50 border border-[var(--glass-border)] ${colorClass}`}>
            ランク {grade}
          </span>
        )}
      </div>
    </div>
  );
};
