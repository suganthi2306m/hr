/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        /** Gold accent (flux-style) */
        primary: '#f2d04a',
        /** Near-black for type + chrome */
        dark: '#0f0f0f',
        flux: {
          sidebar: '#161616',
          sidebarHover: '#242424',
          canvas: '#ececec',
          panel: '#f6f6f6',
          ink: '#0f0f0f',
          muted: '#9ca3af',
        },
      },
      accentColor: {
        primary: '#f2d04a',
      },
      borderRadius: {
        '4xl': '1.75rem',
        '5xl': '2rem',
      },
      boxShadow: {
        panel: '0 10px 40px rgba(0, 0, 0, 0.06)',
        'panel-lg': '0 24px 60px rgba(0, 0, 0, 0.08)',
        flux: '0 12px 40px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
};
