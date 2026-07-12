/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#050505',
        'bg-base': '#0a0a0a',
        'bg-surface': '#111111',
        'bg-elevated': '#191919',
        'border': '#1e1e1e',
        'border-subtle': '#141414',
        'text-primary': '#e8e8e8',
        'text-secondary': '#8a8a8a',
        'text-muted': '#4a4a4a',
        'white': '#ffffff',
      },
    },
  },
  plugins: [],
};
