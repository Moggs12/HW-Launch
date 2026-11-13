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
  // Neutral keeps the bold toy colours saturated (ACES washes reds and yellows towards pastel)
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
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

  // reflections for the shiny paint, baked once. The baked map lives on the GPU only, so a lost
  // WebGL context (iOS under memory pressure) wipes it: bake it again when the context comes back.
  let envRT = bakeEnvironment(renderer);
  scene.environment = envRT.texture;
  canvas.addEventListener('webglcontextrestored', () => {
    envRT.dispose();
    envRT = bakeEnvironment(renderer);
    scene.environment = envRT.texture;
  });

  scene.add(new THREE.HemisphereLight(0xd6eaff, 0x7d6b4c, .45 * LEGACY));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.6 * LEGACY);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  // 18 m box follows the car (followWithSun): ~57 shadow texels per metre, sharp enough on a phone at 1024
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  return { renderer, scene, camera, sky, sun };
}

/* A soft blue-sky / grey-ground studio with a sun and a light strip, prefiltered for the paint's
   reflections. The studio scene and the generator are freed straight after baking. */
function bakeEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
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
  // studio softboxes either side and a warm rim behind: crisp showroom highlights along the car bodies
  for (const [x, z, col] of [[-42, 0, [3, 3, 3.2]], [42, 0, [3, 3, 3.2]], [0, -42, [3.4, 2.4, 1.4]]] as const) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(z ? 50 : 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), side: THREE.DoubleSide }));
    box.position.set(x, 8, z); box.lookAt(0, 4, 0); env.add(box);
  }
  const rt = pm.fromScene(env, .02);
  pm.dispose();
  env.traverse(o => {
    if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
  });
  return rt;
}

/* Keep the sky and the sun's shadow box centred on the car. */
export function followWithSun(st: Stage3D, p: THREE.Vector3) {
  st.sky.position.copy(st.camera.position);
  st.sun.position.set(p.x - 6, p.y + 24, p.z + 13);
  st.sun.target.position.set(p.x, p.y, p.z - 2);
}
