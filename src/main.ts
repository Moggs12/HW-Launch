import './style.css';
import { CITY } from './content/level';
import { THEME } from './content/theme';
import { registerServiceWorker, webPlatform } from './platform/web';
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

/* If start-up fails, say so on screen (with the reason, for grown-ups) instead of a blank page. */
function showStartupError(err: unknown) {
  const box = document.getElementById('loading')!;
  box.hidden = false;
  box.classList.add('failed');
  box.innerHTML = '<div>Oops! The city didn\'t load.<button class="btn" id="retryBtn">Try again</button><small></small></div>';
  box.querySelector('small')!.textContent = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  document.getElementById('retryBtn')!.addEventListener('click', () => location.reload());
}
let started = false;
addEventListener('error', e => { if (!started) showStartupError(e.error ?? e.message); });

async function start() {
  applyTheme();
  registerServiceWorker();
  await fontsReady();
  new Game(document.getElementById('stage')!, document.getElementById('c') as HTMLCanvasElement,
    document.getElementById('speed') as HTMLCanvasElement, CITY, loadSave(webPlatform.storage), webPlatform);
  started = true;
}
start().catch(showStartupError);
