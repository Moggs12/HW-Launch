import { CARS, carImage } from '../content/cars';
import { SPECIALS } from '../content/specials';
import { THEME } from '../content/theme';
import { MAX_LEVEL, UPGRADES, type UpgradeKey } from '../content/upgrades';
import { anyAffordable, canBuy, canUnlock, upgradeCost, upgradesDone, upgradesTotal, type RunResult } from '../rules/economy';
import type { SaveData } from '../rules/save';
import { Confetti } from './confetti';

/* The HTML overlay: HUD, result card and garage sheet. Shows state; reports taps through callbacks. */
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

const ICONS: Record<UpgradeKey, string> = {
  engine: '<path d="M6 9h3l1-2h5l1 2h2v3h2v4h-2v2H9l-3-3H4v-5h2z"/>',
  wheels: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="var(--sun)"/>',
  wings: '<path d="M2 14l9-4h2l9 4-1 2-8-2h-2l-8 2z"/>',
  boost: '<path d="M12 2c3 4 5 7 5 11a5 5 0 0 1-10 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
};

export interface GarageActions {
  refresh(): void;
  buy(key: UpgradeKey): void;
  pickCar(i: number): void;
  unlock(): void;
  testCoins(): void;
  testMax(): void;
  testReset(): void;
}

export interface HomeActions {
  start(): void;
  muted(m: boolean): void;
}

/* Test mode: testing tools show and any car can be picked, locked or not.
   On in dev builds, with ?test in the URL (any case), or by holding the car badge or the
   home-screen logo for 2 seconds (works in the home-screen app too). Remembered on this device. */
const TEST_KEY = 'launch-garage-test';
const MUTE_KEY = 'launch-garage-muted';
const HOLD_MS = 2000;
function initialTestMode() {
  if (/test/i.test(location.search + location.hash)) { try { localStorage.setItem(TEST_KEY, '1'); } catch { /* ignore */ } return true; }
  try { const v = localStorage.getItem(TEST_KEY); if (v) return v === '1'; } catch { /* ignore */ }
  return import.meta.env.DEV;
}

export type Sfx = 'tick' | 'coin' | 'pop';

export class Screens {
  testMode = initialTestMode();
  sfx: (k: Sfx) => void = () => {};
  private confetti = new Confetti($<HTMLCanvasElement>('confetti'));
  private coinTarget = 0;          // what the HUD coin counter should end up showing
  private coinShown = 0;
  private coinAnim = false;        // coins are flying from the result card to the counter
  private lastRunCoins = 0;

  muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();

  constructor(private garage: GarageActions, homeActs: HomeActions) {
    $('closeGarage').addEventListener('click', () => this.closeGarage());
    $('unlockBtn').addEventListener('click', () => garage.unlock());
    $('testCoins').addEventListener('click', () => garage.testCoins());
    $('testMax').addEventListener('click', () => garage.testMax());
    $('testReset').addEventListener('click', () => garage.testReset());
    this.bindTestHold($('carPill'));
    this.bindTestHold($('logo'));
    this.showTestMode();

    const words = THEME.name.split(' ');
    $('logo1').textContent = words[0];
    $('logo2').textContent = words.slice(1).join(' ');
    $('build').textContent = 'v' + __BUILD__;
    $('startBtn').addEventListener('click', () => { this.hideHome(); homeActs.start(); });
    $('soundBtn').addEventListener('click', () => {
      this.muted = !this.muted;
      try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignore */ }
      this.showMute(); homeActs.muted(this.muted);
    });
    this.showMute();
  }

  private showMute() {
    $('soundBtn').classList.toggle('off', this.muted);
    $('soundBtn').setAttribute('aria-label', this.muted ? 'Sound off' : 'Sound on');
  }

  private showTestMode() {
    $('tools').hidden = !this.testMode;
    $('testBadge').hidden = !this.testMode;
    $('homeTest').hidden = !this.testMode;
  }

  showHome(carIdx: number) {
    $<HTMLImageElement>('homeCar').src = carImage(CARS[carIdx]);
    document.body.classList.add('on-home');
    $('home').hidden = false;
  }
  private hideHome() {
    $('home').hidden = true;
    document.body.classList.remove('on-home');
  }
  get homeOpen() { return !$('home').hidden; }

  private bindTestHold(el: HTMLElement) {
    let timer = 0;
    const cancel = () => { clearTimeout(timer); el.classList.remove('holding'); };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.classList.add('holding');
      timer = window.setTimeout(() => {
        cancel();
        this.testMode = !this.testMode;
        try { localStorage.setItem(TEST_KEY, this.testMode ? '1' : '0'); } catch { /* ignore */ }
        this.showTestMode();
        this.garage.refresh();
      }, HOLD_MS);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, cancel);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  doneLoading() { $('loading').hidden = true; }

  hud(save: SaveData, carIdx: number) {
    const car = CARS[carIdx];
    this.coinTarget = save.coins;
    if (!this.coinAnim) this.setCoins(save.coins);
    $('carName').textContent = car.name;
    $('carTier').textContent = `Car ${carIdx + 1} of ${CARS.length}`;
    $<HTMLImageElement>('carImg').src = carImage(car);
    $('best').textContent = save.best[carIdx] ? fmt(save.best[carIdx]) + ' m' : '—';
    $('garageBtn').classList.toggle('glow', anyAffordable(save, carIdx) || canUnlock(save, carIdx));
  }

  private setCoins(n: number) { this.coinShown = n; $('coins').textContent = fmt(n); }
  private bump(el: HTMLElement, cls = 'bump') { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  celebrate() { this.confetti.burst(); }

  aiming() {
    if (this.coinAnim) { this.coinAnim = false; this.setCoins(this.coinTarget); }
    this.lastRunCoins = 0;
    $('result').hidden = true; $('flight').hidden = true; $('aimhint').hidden = false; $('dist').hidden = true; $('garageBtn').hidden = false;
    this.power(0);
  }
  pulling() { $('aimhint').hidden = true; }
  power(p: number) { $('power').style.setProperty('--p', String(p)); }

  flying(carIdx: number, hasBoost: boolean) {
    $('flight').hidden = false; $('dist').hidden = false; $('garageBtn').hidden = true; this.power(0);
    const sb = $<HTMLButtonElement>('specialBtn');
    sb.hidden = false; sb.disabled = false;
    $('specialName').textContent = SPECIALS[CARS[carIdx].special].name;
    $('boostBtn').hidden = !hasBoost;
  }
  specialUsed() { $<HTMLButtonElement>('specialBtn').disabled = true; }

  flight(distance: number, coinBonus: number, fuel: number) {
    $('distNum').textContent = fmt(Math.max(0, distance));
    $('runCoins').textContent = coinBonus ? '+' + fmt(coinBonus) : '';
    if (coinBonus > this.lastRunCoins) { this.lastRunCoins = coinBonus; this.bump($('runCoins')); }
    $('boostBtn').style.setProperty('--f', String(fuel));
  }

  /* Result card: the numbers count up, then the coins fly into the counter (and confetti for a new best). */
  result(r: RunResult, crashed: boolean, coinsGrabbed: number, coinsBefore: number) {
    $('resTitle').textContent = crashed ? 'CRASH!' : (r.distance > 60 ? 'WHOOSH!' : 'NICE ONE!');
    $('resBest').hidden = true;
    $('resBreak').textContent = fmt(r.distCoins) + ' for distance' +
      (coinsGrabbed ? ` + ${fmt(r.coinCoins)} from ${coinsGrabbed} coin${coinsGrabbed > 1 ? 's' : ''}` : '');
    $('result').hidden = false; $('flight').hidden = true;
    this.coinAnim = true; this.setCoins(coinsBefore);
    const t0 = performance.now(), D = 900;
    let lastTick = 0;
    const step = (t: number) => {
      if ($('result').hidden) return;
      const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      $('resDist').textContent = fmt(r.distance * e) + ' m';
      $('resCoins').textContent = '+' + fmt(r.total * e);
      if (k < 1) {
        if (t - lastTick > 75) { this.sfx('tick'); lastTick = t; }
        requestAnimationFrame(step);
        return;
      }
      if (r.isBest) { $('resBest').hidden = false; this.bump($('resBest'), 'pop-in'); this.celebrate(); }
      this.flyCoins(r.total);
    };
    requestAnimationFrame(step);
  }

  private flyCoins(total: number) {
    const stage = $('stage').getBoundingClientRect(), from = $('resCoins').getBoundingClientRect(), to = $('coins').getBoundingClientRect();
    const n = Math.min(10, 3 + Math.floor(total / 25)), start = this.coinShown;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('span'); c.className = 'cn fly';
      const x0 = from.left - stage.left + (Math.random() - .5) * 40, y0 = from.top - stage.top + from.height / 2;
      c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
      $('stage').appendChild(c);
      const dx = to.left - stage.left - x0, dy = to.top - stage.top + to.height / 2 - y0;
      const anim = c.animate([
        { transform: 'translate(0,0) scale(.4)', opacity: 0 },
        { transform: `translate(${dx * .15}px,${-50 - Math.random() * 40}px) scale(1.3)`, opacity: 1, offset: .3 },
        { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: 1 },
      ], { duration: reduce ? 1 : 650, delay: reduce ? 0 : i * 70, easing: 'cubic-bezier(.45,0,.6,1)', fill: 'backwards' });
      anim.onfinish = () => {
        c.remove(); landed++;
        if (!this.coinAnim) return;
        this.setCoins(Math.round(start + (this.coinTarget - start) * landed / n));
        this.bump($('coins').parentElement!); this.sfx('coin');
        if (landed === n) this.coinAnim = false;
      };
    }
  }

  /* little pop on the upgrade just bought */
  flashUpgrade(key: UpgradeKey) {
    const row = document.getElementById('buy-' + key)?.closest('.upg') as HTMLElement | null;
    if (row) this.bump(row, 'pop-in');
    this.bump($('gCoins').parentElement!);
  }

  get garageOpen() { return !$('garage').hidden; }
  openGarage(save: SaveData, carIdx: number) { this.renderGarage(save, carIdx); $('garage').hidden = false; $('closeGarage').focus(); }
  closeGarage() { $('garage').hidden = true; }

  renderGarage(save: SaveData, carIdx: number) {
    const lv = save.levels[carIdx], car = CARS[carIdx], sp = SPECIALS[car.special];
    $('gCoins').textContent = fmt(save.coins);
    $('gName').textContent = car.name;
    $('gSpecial').textContent = sp.name;
    $('gSpecialText').textContent = sp.text;
    $<HTMLImageElement>('gImg').src = carImage(car);

    const list = $('upgList'); list.innerHTML = '';
    for (const u of UPGRADES) {
      const l = lv[u.key], cost = upgradeCost(carIdx, l), max = cost === null;
      const row = document.createElement('div'); row.className = 'upg';
      row.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[u.key]}</svg>
        <div class="upg-txt"><b>${u.name}</b><span>${u.text}</span>
        <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="buy" id="buy-${u.key}" ${canBuy(save, carIdx, u.key) ? '' : 'disabled'}>${max ? 'MAX' : '<span class="cn"></span>' + fmt(cost)}</button>`;
      row.querySelector('button')!.addEventListener('click', () => this.garage.buy(u.key));
      list.appendChild(row);
    }
    const un = $('unlockBtn');
    un.hidden = !canUnlock(save, carIdx);
    if (!un.hidden) un.textContent = `Unlock ${CARS[save.unlocked].name}!`;
    const done = upgradesDone(save, carIdx);
    $('gProg').style.setProperty('--p', String(done / upgradesTotal));
    $('gProgTxt').textContent = done === upgradesTotal ? 'All upgrades done!' : `${upgradesTotal - done} upgrades to go before the next car`;

    const cl = $('carList'); cl.innerHTML = '';
    CARS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'mini'; b.id = 'mini-' + i;
      const locked = i >= save.unlocked, peek = locked && this.testMode;
      b.disabled = locked && !peek; b.setAttribute('aria-pressed', String(i === carIdx));
      if (peek) b.classList.add('peek');
      b.innerHTML = `<img alt="" src="${carImage(c)}"><span>${locked && !peek ? 'Locked' : c.name}</span>${locked && !peek ? '<em aria-hidden="true">?</em>' : ''}${peek ? '<b class="tag">TEST</b>' : ''}`;
      b.addEventListener('click', () => this.garage.pickCar(i));
      cl.appendChild(b);
    });
  }
}
