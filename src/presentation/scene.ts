import * as THREE from 'three';

/* Renderer, sky, reflections and sunlight. One bright daytime look. */
export interface Stage3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sky: THREE.Mesh;
  sun: THREE.DirectionalLight;
}

// three.js r155+ lights are physically based; the prototype (r128) used legacy lighting.
// Directional and hemisphere intensities scale by π to give the same look.
const LEGACY = Math.PI;

export function createStage(canvas: HTMLCanvasElement): Stage3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 1400);

  // sky backdrop
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512;
  const c = cv.getContext('2d')!, gr = c.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#2d74e8'); gr.addColorStop(.45, '#6fb0ff'); gr.addColorStop(.62, '#cfe6ff'); gr.addColorStop(1, '#fff4dc');
  c.fillStyle = gr; c.fillRect(0, 0, 4, 512);
  const skyTex = new THREE.CanvasTexture(cv); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1; scene.add(sky);
  scene.fog = new THREE.Fog(0xc9e0fb, 160, 600);

  // reflections for the shiny paint: a soft blue-sky / grey-ground studio with a sun and a light strip
  const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16), cols: number[] = [];
  const lin = (hex: number) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
  const top = lin(0x1f4fa8), mid = lin(0x8a9db5), bot = lin(0x3a3a34);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / 50;
    const col = y > 0 ? mid.clone().lerp(top, Math.pow(y, .7)) : mid.clone().lerp(bot, Math.min(1, -y * 3));
    cols.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sp = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 11) }));
  sp.position.set(20, 30, 10); env.add(sp);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.8), side: THREE.DoubleSide }));
  strip.position.set(0, 40, 0); strip.rotation.x = Math.PI / 2; env.add(strip);
  scene.environment = pm.fromScene(env, .02).texture;

  scene.add(new THREE.HemisphereLight(0xd6eaff, 0x7d6b4c, .45 * LEGACY));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.6 * LEGACY);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
  scene.add(sun, sun.target);

  return { renderer, scene, camera, sky, sun };
}

/* Keep the sky and the sun's shadow box centred on the car. */
export function followWithSun(st: Stage3D, p: THREE.Vector3) {
  st.sky.position.copy(st.camera.position);
  st.sun.position.set(p.x - 6, p.y + 24, p.z + 13);
  st.sun.target.position.set(p.x, p.y, p.z - 2);
}
