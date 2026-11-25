import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type CameraPreset = 'hero' | 'side' | 'upper' | 'front';
type SceneMood = 'night_beam' | 'royal_gold' | 'cabin_glow';

const PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; label: string }
> = {
  hero: { pos: [7.6, 2.5, 7.4], target: [-1.1, 1.38, 0], label: 'Front 3/4' },
  side: { pos: [-1.1, 1.9, 11.4], target: [-1.1, 1.35, 0], label: 'Sleeper Deck' },
  upper: { pos: [5.6, 4.2, 5.6], target: [-0.8, 1.6, 0], label: 'Roof & Gantry' },
  front: { pos: [8.4, 1.65, 2.0], target: [0, 1.3, 0], label: 'Headlights' },
};

const MOODS: Record<SceneMood, { label: string }> = {
  night_beam: { label: 'Night Beam' },
  royal_gold: { label: 'Royal Gold' },
  cabin_glow: { label: 'Cabin Glow' },
};

function createAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111116';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle deterministic asphalt aggregate speckles
  let seed = 42;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 1800; i++) {
    const x = nextRand() * 256;
    const y = nextRand() * 256;
    const shade = 14 + Math.floor(nextRand() * 26);
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 5})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 6);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBeamGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255, 236, 179, 0.52)');
  grad.addColorStop(0.5, 'rgba(232, 200, 107, 0.16)');
  grad.addColorStop(1, 'rgba(232, 200, 107, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRadialLightPoolTexture(innerRgba: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function HeroBus3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const presetRef = useRef<CameraPreset>('hero');
  const moodRef = useRef<SceneMood>('night_beam');
  const applyPresetRef = useRef<((preset: CameraPreset) => void) | null>(null);
  const applyMoodRef = useRef<((mood: SceneMood) => void) | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPreset>('hero');
  const [activeMood, setActiveMood] = useState<SceneMood>('night_beam');
  const [webglFailed, setWebglFailed] = useState(false);

  const selectPreset = (preset: CameraPreset) => {
    presetRef.current = preset;
    setActivePreset(preset);
    applyPresetRef.current?.(preset);
  };

  const selectMood = (mood: SceneMood) => {
    moodRef.current = mood;
    setActiveMood(mood);
    applyMoodRef.current?.(mood);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
        preserveDrawingBuffer: isSoftwareGl,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 620;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b);
    scene.fog = new THREE.FogExp2(0x09090b, 0.03);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 120);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 0.68;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;

    // Position camera cleanly for both desktop & narrow mobile aspect ratios
    const setCameraForPreset = (preset: CameraPreset) => {
      const p = PRESETS[preset];
      const w = container.clientWidth || 1200;
      const h = container.clientHeight || 620;
      const aspect = w / Math.max(1, h);
      const isNarrow = w < 640;
      const mobileScale = isNarrow
        ? 1.32
        : aspect < 1
          ? Math.min(1.58, 1.05 / Math.max(0.55, aspect))
          : 1;
      const wideOffset = !isNarrow && aspect >= 1.45 && preset === 'hero';
      const targetX = isNarrow ? 0 : wideOffset ? p.target[0] - 1.4 : p.target[0];
      const targetZ = isNarrow ? 0 : wideOffset ? p.target[2] - 1.2 : p.target[2];
      camera.position.set(
        p.pos[0] * mobileScale,
        p.pos[1] * (isNarrow || aspect < 1 ? 1.12 : 1),
        p.pos[2] * mobileScale
      );
      controls.target.set(targetX, p.target[1], targetZ);
    };

    setCameraForPreset('hero');
    controls.update();

    // 3-Point Studio & Highway Lighting Rig
    const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x241b0e, 0.78);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe4bd, 2.45);
    keyLight.position.set(8, 12, 7);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -8;
      keyLight.shadow.camera.right = 8;
      keyLight.shadow.camera.top = 6;
      keyLight.shadow.camera.bottom = -6;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xe8c86b, 2.25);
    rimLight.position.set(-7, 6, -6);
    scene.add(rimLight);

    const sideFill = new THREE.DirectionalLight(0xfef3c7, 1.0);
    sideFill.position.set(2, 4, 10);
    scene.add(sideFill);

    // Textured Highway Asphalt Plane
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const asphaltTex = createAsphaltTexture(maxAniso);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asphaltTex,
      roughness: 0.74,
      metalness: 0.14,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(80, 32), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = !isSoftwareGl;
    scene.add(road);

    // Subtle Gold Showcase Turntable Plinth Ring under Coach
    const plinthRingMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4af37,
      metalness: 0.9,
      roughness: 0.22,
      emissive: 0x3b2a06,
      emissiveIntensity: 0.45,
    });
    const plinthRing = new THREE.Mesh(new THREE.RingGeometry(5.65, 5.78, 72), plinthRingMat);
    plinthRing.rotation.x = -Math.PI / 2;
    plinthRing.position.set(0, 0.018, 0);
    scene.add(plinthRing);

    // Subtle Gold Highway Edge Lines & Reflective Studs (InstancedMesh)
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.65,
      emissive: 0x453007,
      emissiveIntensity: 0.45,
    });
    const edgeNear = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.08), edgeMat);
    edgeNear.rotation.x = -Math.PI / 2;
    edgeNear.position.set(0, 0.02, 2.45);
    scene.add(edgeNear);

    const edgeFar = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.08), edgeMat);
    edgeFar.rotation.x = -Math.PI / 2;
    edgeFar.position.set(0, 0.02, -2.45);
    scene.add(edgeFar);

    const dashCount = 24;
    const dashGeo = new THREE.PlaneGeometry(1.5, 0.1);
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0xe8c86b,
      emissive: 0x6b4f10,
      emissiveIntensity: 0.55,
      roughness: 0.45,
    });
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(-34 + i * 3.0, 0.025, 0);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    dashes.computeBoundingSphere();
    scene.add(dashes);

    // 3D Cat's-Eye Gold Highway Studs along Edges (InstancedMesh)
    const studCount = 32;
    const studGeo = new THREE.BoxGeometry(0.14, 0.05, 0.14);
    const studMat = new THREE.MeshStandardMaterial({
      color: 0xf5e199,
      emissive: 0xd4af37,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const studs = new THREE.InstancedMesh(studGeo, studMat, studCount);
    for (let i = 0; i < studCount; i++) {
      const side = i % 2 === 0 ? 2.45 : -2.45;
      const x = -22 + Math.floor(i / 2) * 3.0;
      dummy.position.set(x, 0.03, side);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      studs.setMatrixAt(i, dummy.matrix);
    }
    studs.instanceMatrix.needsUpdate = true;
    studs.computeBoundingSphere();
    scene.add(studs);

    // 3D Architectural Highway Corridor Arch Gantry Behind Coach
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(-7.6, 0, 0);
    const gantryMetal = new THREE.MeshPhysicalMaterial({
      color: 0x1a1b22,
      metalness: 0.78,
      roughness: 0.28,
    });
    const gantryBeaconMat = new THREE.MeshStandardMaterial({
      color: 0xf5e199,
      emissive: 0xd4af37,
      emissiveIntensity: 1.6,
    });
    for (const zSide of [-3.3, 3.3]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 4.9, 0.24), gantryMetal);
      pillar.position.set(0, 2.45, zSide);
      gantryGroup.add(pillar);
    }
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 7.0), gantryMetal);
    crossBeam.position.set(0, 4.85, 0);
    gantryGroup.add(crossBeam);
    const beamStrip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 6.2), gantryBeaconMat);
    beamStrip.position.set(0, 4.72, 0);
    gantryGroup.add(beamStrip);
    scene.add(gantryGroup);

    // Soft Contact Shadow + Warm Gold Underglow Light Pool
    const shadowTex = createRadialLightPoolTexture('rgba(0,0,0,0.88)');
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(10.8, 3.9),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.88,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.015, 0);
    scene.add(contactShadow);

    const underglowTex = createRadialLightPoolTexture('rgba(212,175,55,0.34)');
    const underglowMat = new THREE.MeshBasicMaterial({
      map: underglowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.65,
    });
    const underglow = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 4.6), underglowMat);
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.set(0, 0.022, 0);
    scene.add(underglow);

    // =========================================
    // COMPOSITE 10-PART LUXURY SLEEPER COACH
    // =========================================
    const coach = new THREE.Group();
    scene.add(coach);

    const obsidianPaint = new THREE.MeshPhysicalMaterial({
      color: 0x1a1b22,
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.5,
    });

    const brushedGoldMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2be53,
      metalness: 0.92,
      roughness: 0.16,
      anisotropy: 0.8,
      envMapIntensity: 1.4,
    });

    const darkGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1018,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      transparent: true,
      opacity: isSoftwareGl ? 0.65 : 0.78,
    });

    const cabinGlowMat = new THREE.MeshStandardMaterial({
      color: 0xf7e3a8,
      emissive: 0xd4a438,
      emissiveIntensity: 1.35,
      roughness: 0.4,
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x161618,
      roughness: 0.88,
      metalness: 0.05,
    });

    // 1. Sculpted Aerodynamic Body (ExtrudeGeometry with bevels)
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-4.6, 0.48);
    hullShape.lineTo(4.2, 0.48);
    hullShape.quadraticCurveTo(4.7, 0.5, 4.75, 1.15);
    hullShape.lineTo(4.42, 2.85);
    hullShape.quadraticCurveTo(4.28, 3.15, 3.7, 3.18);
    hullShape.lineTo(-4.4, 3.18);
    hullShape.quadraticCurveTo(-4.65, 3.16, -4.65, 2.75);
    hullShape.lineTo(-4.65, 0.62);
    hullShape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: 2.26,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.07,
      bevelSegments: 3,
    });
    hullGeo.translate(0, 0, -1.13);
    const hullMesh = new THREE.Mesh(hullGeo, obsidianPaint);
    hullMesh.castShadow = !isSoftwareGl;
    coach.add(hullMesh);

    // 2. Brushed Gold Livery Sweep Bands (Left & Right)
    const lowerBand = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.09, 2.44), brushedGoldMat);
    lowerBand.position.set(-0.05, 1.05, 0);
    coach.add(lowerBand);

    const upperBand = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.06, 2.43), brushedGoldMat);
    upperBand.position.set(-0.25, 2.96, 0);
    coach.add(upperBand);

    // 3. Panoramic Tinted Windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.48, 2.08), darkGlassMat);
    windshield.position.set(4.54, 1.98, 0);
    windshield.rotation.z = 0.16;
    coach.add(windshield);

    // 4 & 5. Upper & Lower Sleeper Deck Window Bays + Warm Illuminated Interior Berths
    for (let i = 0; i < 6; i++) {
      const xPos = -3.4 + i * 1.24;
      const upperPane = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.56, 2.45), darkGlassMat);
      upperPane.position.set(xPos, 2.54, 0);
      coach.add(upperPane);

      const upperGlow = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.34, 2.18), cabinGlowMat);
      upperGlow.position.set(xPos, 2.52, 0);
      coach.add(upperGlow);

      const lowerPane = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.56, 2.45), darkGlassMat);
      lowerPane.position.set(xPos, 1.56, 0);
      coach.add(lowerPane);

      const lowerGlow = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.34, 2.18), cabinGlowMat);
      lowerGlow.position.set(xPos, 1.54, 0);
      coach.add(lowerGlow);
    }

    // 6. Roof Climate AC Pod
    const acPod = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 1.55), obsidianPaint);
    acPod.position.set(-0.6, 3.32, 0);
    coach.add(acPod);

    const acTrim = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.05, 1.58), brushedGoldMat);
    acTrim.position.set(-0.6, 3.24, 0);
    coach.add(acTrim);

    // 7. Twin LED Headlights, DRL Strip, Gold Grille & 3D Volumetric Light Beam Cones
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffe8ad,
      emissiveIntensity: 2.8,
    });
    const beamGlowTex = createBeamGlowTexture();
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamGlowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      opacity: 0.85,
    });
    const beamConeGeo = new THREE.ConeGeometry(1.15, 6.2, 24, 1, true);
    const groundBeamTex = createRadialLightPoolTexture('rgba(255, 232, 173, 0.32)');
    const groundBeamMat = new THREE.MeshBasicMaterial({
      map: groundBeamTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.75,
    });

    const beamGroup = new THREE.Group();
    coach.add(beamGroup);

    for (const zSide of [-0.78, 0.78]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.42), headlightMat);
      lamp.position.set(4.79, 0.88, zSide);
      coach.add(lamp);

      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.48), headlightMat);
      drl.position.set(4.78, 1.04, zSide);
      coach.add(drl);

      // 3D Volumetric Light Beam Cone projecting forward
      const beamCone = new THREE.Mesh(beamConeGeo, beamMat);
      beamCone.rotation.z = Math.PI / 2 + 0.08;
      beamCone.position.set(7.85, 0.68, zSide);
      beamGroup.add(beamCone);

      // Ground Light Pool
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.2), groundBeamMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(7.6, 0.028, zSide);
      beamGroup.add(pool);
    }

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.96), brushedGoldMat);
    grille.position.set(4.78, 0.86, 0);
    coach.add(grille);

    const destSign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.35), cabinGlowMat);
    destSign.position.set(4.42, 2.95, 0);
    destSign.rotation.z = 0.16;
    coach.add(destSign);

    // 8. Rear Taillights
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xef4444,
      emissiveIntensity: 1.5,
    });
    for (const zSide of [-0.88, 0.88]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.22), tailMat);
      tail.position.set(-4.72, 1.12, zSide);
      coach.add(tail);
    }

    // 9. Side Mirrors
    for (const zSide of [-1.26, 1.26]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), brushedGoldMat);
      arm.position.set(4.58, 2.38, zSide * 0.96);
      coach.add(arm);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.16), obsidianPaint);
      mirror.position.set(4.78, 2.22, zSide);
      coach.add(mirror);
    }

    // 10. 4 Dual-Material Wheels (Rubber Tire + Gold Alloy Rim + Center Hub)
    const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 24);
    tireGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.34, 16);
    rimGeo.rotateX(Math.PI / 2);

    const wheelCoords: Array<[number, number]> = [
      [2.85, 1.06],
      [2.85, -1.06],
      [-2.75, 1.06],
      [-2.75, -1.06],
    ];
    for (const [wx, wz] of wheelCoords) {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.5, wz);
      const tire = new THREE.Mesh(tireGeo, rubberMat);
      const rim = new THREE.Mesh(rimGeo, brushedGoldMat);
      wGroup.add(tire, rim);
      coach.add(wGroup);
    }

    // Coalesced On-Demand Renderer (per Three.js skill)
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    controls.addEventListener('change', requestRender);

    applyPresetRef.current = (preset: CameraPreset) => {
      setCameraForPreset(preset);
      requestRender();
    };

    applyMoodRef.current = (mood: SceneMood) => {
      if (mood === 'night_beam') {
        scene.background = new THREE.Color(0x09090b);
        (scene.fog as THREE.FogExp2).color.setHex(0x09090b);
        keyLight.intensity = 2.45;
        rimLight.intensity = 2.25;
        cabinGlowMat.emissiveIntensity = 1.35;
        beamGroup.visible = true;
        underglowMat.opacity = 0.72;
      } else if (mood === 'royal_gold') {
        scene.background = new THREE.Color(0x130e06);
        (scene.fog as THREE.FogExp2).color.setHex(0x130e06);
        keyLight.intensity = 2.85;
        rimLight.intensity = 3.2;
        cabinGlowMat.emissiveIntensity = 1.2;
        beamGroup.visible = true;
        underglowMat.opacity = 0.9;
      } else {
        scene.background = new THREE.Color(0x070910);
        (scene.fog as THREE.FogExp2).color.setHex(0x070910);
        keyLight.intensity = 1.65;
        rimLight.intensity = 2.6;
        cabinGlowMat.emissiveIntensity = 2.2;
        beamGroup.visible = false;
        underglowMat.opacity = 0.8;
      }
      requestRender();
    };

    requestRender();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1200;
      const h = container.clientHeight || 620;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      setCameraForPreset(presetRef.current);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    return () => {
      applyPresetRef.current = null;
      applyMoodRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.removeEventListener('change', requestRender);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      asphaltTex.dispose();
      beamGlowTex.dispose();
      groundBeamTex.dispose();
      shadowTex.dispose();
      underglowTex.dispose();
      controls.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#09090B]">
      {webglFailed ? (
        <img
          src="/src/assets/images/hero_luxury_sleeper_bus_1795571775133.jpg"
          alt="Jay Goga Travels Luxury Sleeper Coach"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-80"
        />
      ) : (
        <div
          ref={mountRef}
          data-testid="hero-3d-canvas"
          className="w-full h-full touch-pan-y"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#09090B]/90 via-[#09090B]/35 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-[#09090B]/50" />

      {/* Mobile & Desktop Unified 3D View + Lighting Effects Dock */}
      <div
        data-testid="hero-3d-dock"
        className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-5 z-20 flex flex-col sm:flex-row sm:items-center gap-1.5 rounded-xl border border-[#D4AF37]/30 bg-[#09090B]/92 p-1.5"
      >
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {(Object.keys(PRESETS) as CameraPreset[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => selectPreset(key)}
              className={`min-h-[38px] sm:min-h-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                activePreset === key
                  ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                  : 'text-[#FAF7F0]/75 hover:text-[#FAF7F0]'
              }`}
            >
              {PRESETS[key].label}
            </button>
          ))}
        </div>
        <span className="hidden sm:block h-4 w-px bg-white/15 shrink-0" aria-hidden="true" />
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-white/10 pt-1 sm:border-t-0 sm:pt-0">
          {(Object.keys(MOODS) as SceneMood[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMood(m)}
              className={`min-h-[38px] sm:min-h-0 px-2.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                activeMood === m
                  ? 'border border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5E199] font-semibold'
                  : 'text-[#FAF7F0]/65 hover:text-[#FAF7F0]'
              }`}
            >
              {MOODS[m].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
