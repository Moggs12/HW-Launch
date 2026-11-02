/* Name, logo, colours and fonts: the one place to rebrand the game.
   Read by the page (CSS variables), the 3D signs and the PWA manifest. */
export const THEME = {
  name: 'Launch Garage',
  shortName: 'Launch',
  colors: {
    red: '#e8231c',
    flame: '#ff7a1a',
    sun: '#ffd21f',
    blue: '#1440c4',
    ink: '#0b1a4d',
    white: '#ffffff',
    sky: '#6fb0ff',
    muted: '#4a5a8c',
  },
  fonts: {
    display: '"Luckiest Guy","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif',
    body: '"Nunito",ui-rounded,"Segoe UI",system-ui,sans-serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Nunito:wght@700;800;900&display=swap',
  },
} as const;

export type Theme = typeof THEME;
