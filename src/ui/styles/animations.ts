export const animations = `
/* アニメーション定義 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes pulseGlow {
  0%, 100% {
    box-shadow: 0 0 5px var(--glass-glow), 0 0 10px var(--glass-glow);
  }
  50% {
    box-shadow: 0 0 15px var(--glass-glow), 0 0 25px var(--glass-glow);
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

/* ユーティリティクラス */
.animate-fade-in-up {
  animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-slide-in-left {
  animation: slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-float {
  animation: float 4s ease-in-out infinite;
}

.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
.delay-400 { animation-delay: 400ms; }
.delay-500 { animation-delay: 500ms; }

/* DaisyUI スケルトンシマー効果の上書き */
.skeleton {
  background: linear-gradient(90deg, 
    var(--glass-bg) 25%, 
    rgba(255, 255, 255, 0.05) 50%, 
    var(--glass-bg) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}
`;
