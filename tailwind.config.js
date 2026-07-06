/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        anthracite: '#0F1012',
        graphite: '#141517',
        charcoal: '#1A1C1E',
        ash: '#8A8F98',
        neutral: {
          850: '#1A1C1E',
        },
        cyber: {
          DEFAULT: '#FFC700',
          dim: '#B88E00',
        },
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 199, 0, 0.4)' },
          '50%': { boxShadow: '0 0 0 6px rgba(255, 199, 0, 0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scanline: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
        slideIn: 'slideIn 0.25s ease-out',
        scanline: 'scanline 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
