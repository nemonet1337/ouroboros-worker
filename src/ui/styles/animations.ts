export const animations = `
/* アニメーション定義 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
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
    box-shadow: 0 0 3px rgba(246, 130, 31, 0.15);
  }
  50% {
    box-shadow: 0 0 8px rgba(246, 130, 31, 0.3);
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

/* ユーティリティクラス */
.animate-fade-in-up {
  animation: fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-slide-in-left {
  animation: slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-float {
  animation: float 5s ease-in-out infinite;
}

.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
.delay-400 { animation-delay: 400ms; }
.delay-500 { animation-delay: 500ms; }

/* スケルトンシマー効果 */
.skeleton {
  background: linear-gradient(90deg,
    var(--glass-bg) 25%,
    var(--glass-border) 50%,
    var(--glass-bg) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}
`;
