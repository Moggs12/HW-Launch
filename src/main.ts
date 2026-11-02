import './style.css';
import { CITY } from './content/level';
import { THEME } from './content/theme';
import { registerServiceWorker, webStorage } from './platform/web';
import { Game } from './presentation/game';
import { loadSave } from './rules/save';

/* Apply the theme file to the page. */
function applyTheme() {
  const root = document.documentElement.style;
  const c = THEME.colors;
  const vars: Record<string, string> = {
    '--red': c.red, '--flame': c.flame, '--sun': c.sun, '--card-blue': c.blue, '--ink': c.ink,
    '--white': c.white, '--sky': c.sky, '--muted': c.muted,
    '--display': THEME.fonts.display, '--body': THEME.fonts.body,
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  document.title = THEME.name;
}

/* Signs are drawn into textures, so wait (briefly) for the display font first. */
async function fontsReady() {
  const timeout = new Promise(r => setTimeout(r, 2500));
  await Promise.race([Promise.all([document.fonts.load('40px "Luckiest Guy"'), document.fonts.load('900 40px Nunito')]), timeout]).catch(() => {});
}

applyTheme();
registerServiceWorker();
await fontsReady();
new Game(document.getElementById('stage')!, document.getElementById('c') as HTMLCanvasElement, CITY, loadSave(webStorage), webStorage);
