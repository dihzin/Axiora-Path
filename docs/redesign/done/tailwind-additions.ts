// Adicione dentro do seu tailwind.config.ts existente:
// (merge com o que você já tem)

import type { Config } from 'tailwindcss'

const config: Config = {
  // ...seu config existente...
  theme: {
    extend: {
      // ...suas extensões existentes...
      keyframes: {
        'pop-in': {
          '0%':   { transform: 'scale(0.5)', opacity: '0' },
          '70%':  { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(1)',    opacity: '0.4' },
          '100%': { transform: 'scale(1.6)',  opacity: '0' },
        },
      },
      animation: {
        'pop-in':     'pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'pulse-ring': 'pulse-ring 1.2s ease-out infinite',
      },
      colors: {
        brand: {
          green:  '#58CC02',
          teal:   '#4DD9AC',
          blue:   '#1CB0F6',
          gold:   '#FFD700',
          dark:   '#3A9A00',
        },
      },
    },
  },
}

export default config
