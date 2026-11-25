import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LiveTrackingSnapshot } from '../utils/liveTracking';

type TrackerCamMode = 'corridor' | 'coach' | 'top';

interface LiveBus3DPreviewProps {
  snapshot: LiveTrackingSnapshot;
  busName: string;
  registrationNumber: string;
}

function mapSvgTo3D(x: number, y: number): THREE.Vector3 {
  const nx = ((x - 360) / 310) * 4.2;
  const nz = ((y - 190) / 150) * 2.4;
  return new THREE.Vector3(nx, 0.12, nz);
}

function createRadarRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 122);
  grad.addColorStop(0, 'rgba(245, 225, 153, 0.55)');
  grad.addColorStop(0.55, 'rgba(212, 175, 55, 0.18)');
  grad.addColorStop(1, 'rgba(212, 175, 55, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(245, 225, 153, 0.72)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 128, 84, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function LiveBus3DPreview({
  snapshot,
  busName,
  registrationNumber,
}: LiveBus3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [camMode, setCamMode] = useState<TrackerCamMode>('corridor');
  const [webglFailed, setWebglFailed] = useState(false);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const camModeRef = useRef<TrackerCamMode>(camMode);
  camModeRef.current = camMode;

  const updateDynamicRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    updateDynamicRef.current?.();
  }, [snapshot.progressPct, snapshot.waypoints.length, camMode]);

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

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 240;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090d);
    scene.fog = new THREE.FogExp2(0x08090d, 0.042);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;

    // Warm/cool 3-point lighting
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x241b0e, 0.85));
    const key = new THREE.DirectionalLight(0xffe4bd, 2.2);
    key.position.set(5, 8, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8c86b, 1.8);
    rim.position.set(-5, 4, -5);
    scene.add(rim);

    // 1. Topographic Obsidian Plinth & Gold Perimeter Ring
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(5.3, 5.55, 0.24, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x121319,
        metalness: 0.45,
        roughness: 0.42,
        clearcoat: 0.4,
      })
    );
    plinth.position.y = -0.12;
    scene.add(plinth);

    const goldTrimMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2be53,
      metalness: 0.92,
      roughness: 0.18,
      anisotropy: 0.7,
    });
    const trimRing = new THREE.Mesh(new THREE.TorusGeometry(5.32, 0.04, 12, 64), goldTrimMat);
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.y = 0.01;
    scene.add(trimRing);

    const grid = new THREE.GridHelper(9.6, 16, 0x6b531b, 0x1e2029);
    grid.position.y = 0.012;
    scene.add(grid);

    // 2. Dynamic Route Curve + Waypoint Beacons Group
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);

    const activeRouteMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.22,
      emissive: 0x61470c,
      emissiveIntensity: 0.55,
    });
    const passedBeaconMat = new THREE.MeshStandardMaterial({
      color: 0xf5e199,
      emissive: 0xd4af37,
      emissiveIntensity: 1.4,
    });
    const upcomingBeaconMat = new THREE.MeshStandardMaterial({
      color: 0x2d2f3a,
      emissive: 0x1a1b22,
      roughness: 0.4,
    });

    // 3. Composite Miniature 3D Jay Goga Coach + GPS Radar Cone
    const coachGroup = new THREE.Group();
    scene.add(coachGroup);

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1b22,
      metalness: 0.75,
      roughness: 0.22,
      clearcoat: 1.0,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1018,
      metalness: 0.2,
      roughness: 0.08,
      clearcoat: 1.0,
    });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffe8ad,
      emissiveIntensity: 2.5,
    });

    const coachHull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 1.08), bodyMat);
    coachHull.position.y = 0.24;
    coachGroup.add(coachHull);

    const coachBand = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.045, 1.09), goldTrimMat);
    coachBand.position.y = 0.21;
    coachGroup.add(coachBand);

    const coachRoof = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.52), bodyMat);
    coachRoof.position.y = 0.44;
    coachGroup.add(coachRoof);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), glassMat);
    windshield.position.set(0, 0.29, 0.53);
    coachGroup.add(windshield);

    for (const xSide of [-0.14, 0.14]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), lampMat);
      lamp.position.set(xSide, 0.16, 0.54);
      coachGroup.add(lamp);
    }

    const wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [
      [-0.22, 0.32],
      [0.22, 0.32],
      [-0.22, -0.32],
      [0.22, -0.32],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, goldTrimMat);
      wheel.position.set(wx, 0.08, wz);
      coachGroup.add(wheel);
    }

    // GPS Radar Ground Halo + Overhead Signal Spire
    const radarTex = createRadarRingTexture();
    const radarDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.55),
      new THREE.MeshBasicMaterial({
        map: radarTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    radarDisc.rotation.x = -Math.PI / 2;
    radarDisc.position.y = 0.03;
    coachGroup.add(radarDisc);

    const gpsBeamCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.9, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xe8c86b,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    gpsBeamCone.position.y = 0.92;
    gpsBeamCone.rotation.x = Math.PI;
    coachGroup.add(gpsBeamCone);

    let routeCurve: THREE.CatmullRomCurve3 | null = null;
    const _lookTarget = new THREE.Vector3();

    const syncSceneData = () => {
      const snap = snapshotRef.current;

      // Clear previous dynamic route children cleanly
      while (routeGroup.children.length > 0) {
        const child = routeGroup.children[0] as THREE.Mesh;
        routeGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
      }

      const rawPts = snap.waypoints.map((wp, idx) => {
        const v = mapSvgTo3D(wp.point.x, wp.point.y);
        // Subtle 3D elevation arch across midpoint
        const norm = snap.waypoints.length > 1 ? idx / (snap.waypoints.length - 1) : 0;
        v.y = 0.08 + Math.sin(norm * Math.PI) * 0.22;
        return v;
      });

      if (rawPts.length >= 2) {
        routeCurve = new THREE.CatmullRomCurve3(rawPts);
        const tubeGeo = new THREE.TubeGeometry(routeCurve, 36, 0.055, 8, false);
        routeGroup.add(new THREE.Mesh(tubeGeo, activeRouteMat));
      } else {
        routeCurve = null;
      }

      // Stop beacon pillars
      const pillarGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.36, 12);
      const capGeo = new THREE.SphereGeometry(0.09, 12, 12);
      snap.waypoints.forEach((wp, idx) => {
        const v = rawPts[idx];
        if (!v) return;
        const mat = wp.passed ? passedBeaconMat : upcomingBeaconMat;
        const pillar = new THREE.Mesh(pillarGeo.clone(), mat);
        pillar.position.set(v.x, v.y + 0.16, v.z);
        routeGroup.add(pillar);

        const cap = new THREE.Mesh(capGeo.clone(), mat);
        cap.position.set(v.x, v.y + 0.38, v.z);
        routeGroup.add(cap);
      });
      pillarGeo.dispose();
      capGeo.dispose();

      // Position & orient coach along 3D route curve
      const t = Math.max(0, Math.min(1, snap.progressPct / 100));
      if (routeCurve) {
        const pos = routeCurve.getPointAt(t);
        const tan = routeCurve.getTangentAt(t);
        coachGroup.position.copy(pos);
        _lookTarget.copy(pos).add(tan);
        coachGroup.lookAt(_lookTarget);
      } else {
        coachGroup.position.set(0, 0.08, 0);
      }

      // Apply camera mode
      const aspect = (container.clientWidth || 640) / Math.max(1, container.clientHeight || 240);
      const mobileDist = aspect < 1.25 ? 1.28 : 1;
      const mode = camModeRef.current;

      if (mode === 'coach') {
        controls.target.copy(coachGroup.position).add(new THREE.Vector3(0, 0.25, 0));
        camera.position
          .copy(coachGroup.position)
          .add(new THREE.Vector3(2.2 * mobileDist, 1.55 * mobileDist, 2.4 * mobileDist));
      } else if (mode === 'top') {
        controls.target.set(0, 0, 0);
        camera.position.set(0, 8.2 * mobileDist, 2.2 * mobileDist);
      } else {
        controls.target.set(0, 0.2, 0);
        camera.position.set(4.6 * mobileDist, 3.9 * mobileDist, 5.6 * mobileDist);
      }
      controls.update();
    };

    // Coalesced On-Demand Renderer
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

    updateDynamicRef.current = () => {
      syncSceneData();
      requestRender();
    };

    controls.addEventListener('change', requestRender);
    syncSceneData();
    requestRender();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 240;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      syncSceneData();
      requestRender();
    };
    window.addEventListener('resize', onResize);

    return () => {
      updateDynamicRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.removeEventListener('change', requestRender);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      radarTex.dispose();
      controls.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="rounded-xl border border-[#D4AF37]/30 bg-[#08090D] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5 text-xs">
        <span className="font-mono-tabular text-[#E8C86B] truncate">
          3D Corridor Stage · {busName} ({registrationNumber})
        </span>
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'corridor', label: 'Corridor 3D' },
              { id: 'coach', label: 'Coach Cam' },
              { id: 'top', label: 'Radar Top' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setCamMode(mode.id)}
              className={`min-h-[34px] px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                camMode === mode.id
                  ? 'bg-[#D4AF37] text-[#09090B]'
                  : 'border border-white/15 text-[#FAF7F0]/75 hover:border-[#D4AF37]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {webglFailed ? (
        <div className="h-[220px] sm:h-[250px] flex items-center justify-center bg-[#09090B] text-xs text-[#FAF7F0]/65 px-4 text-center">
          3D WebGL stage unavailable on this device · Static GPS map active below.
        </div>
      ) : (
        <div
          ref={mountRef}
          data-testid="live-bus-3d-canvas"
          className="w-full h-[220px] sm:h-[250px] touch-pan-y"
        />
      )}
    </div>
  );
}
