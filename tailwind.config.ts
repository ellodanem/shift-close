import type { Config } from 'tailwindcss'
import { HOME_TILE_BG_CLASSES } from './lib/home-shortcuts'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  safelist: [...HOME_TILE_BG_CLASSES],
  theme: {
    extend: {}
  },
  plugins: []
}
export default config
