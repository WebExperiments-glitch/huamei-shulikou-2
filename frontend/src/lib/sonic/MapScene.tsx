import { useFrame, extend, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { MapShaderMaterial, FloatingBlockShaderMaterial } from './CustomShaderMaterial';
import { engine } from './AudioEngine';
import { DEFAULT_THEME_ID, themes, type ThemeColors } from './themes';
import {
  DEFAULT_FLOATING_BLOCK_INTENSITY,
  DEFAULT_FLOATING_BLOCKS_ENABLED,
  DEFAULT_FLOATING_BLOCK_MIN_SIZE,
  DEFAULT_FLOATING_BLOCK_MAX_SIZE,
  DEFAULT_FLOATING_BLOCK_SPEED,
  DEFAULT_FLOATING_BLOCK_COUNT,
  DEFAULT_GROUND_MOTION_SPEED,
  DEFAULT_TERRAIN_DENSITY,
  applyGroundEqBandValue,
  deriveTerrainGridSettings,
  readGroundEqSettingsStorage,
  type StoredGroundEqSettings,
} from './groundEqSettings';
import { clampAnimationBlend, deriveKickFollowLowBands } from './terrainResponse';

extend({ MapShaderMaterial, FloatingBlockShaderMaterial });

type MapShaderMaterialInstance = THREE.ShaderMaterial & {
  uTime: number;
  uSubBass: number;
  uBass: number;
  uLowMid: number;
  uMid: number;
  uHighMid: number;
  uPresence: number;
  uBrilliance: number;
  uAir: number;
  uWarmth: number;
  uBrightness: number;
  uSharpness: number;
  uSmoothness: number;
  uDensity: number;
  uSpectralCentroid: number;
  uEnergy: number;
  uAmplitude: number;
  uTreble: number;
  uRipples: unknown;
  uBaseColor1: THREE.Color;
  uBaseColor2: THREE.Color;
  uFogColor: THREE.Color;
  uCoolCore: THREE.Color;
  uCoolEdge: THREE.Color;
  uWarmCore: THREE.Color;
  uWarmEdge: THREE.Color;
  uRippleColor: THREE.Color;
  uGlowIntensity: number;
};

export function MapScene({
  themeColors = themes[DEFAULT_THEME_ID],
  groundEqSettings = readGroundEqSettingsStorage(),
  rotationSpeed = 0.15,
}: {
  themeColors?: ThemeColors;
  groundEqSettings?: StoredGroundEqSettings;
  rotationSpeed?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<MapShaderMaterialInstance>(null);
  const floatingBlockMeshRef = useRef<THREE.InstancedMesh>(null);
  const floatingBlockMatRef = useRef<any>(null);
  const visualPlatterRef = useRef<THREE.Group>(null);
  const platterRotationRef = useRef(0);
  const localPointRef = useRef(new THREE.Vector3());
  const { clock } = useThree();
  const smoothedGroundAudioRef = useRef({
    subBass: 0, bass: 0, lowMid: 0, mid: 0,
    highMid: 0, presence: 0, brilliance: 0, air: 0,
  });
  const floatingBlockPulseRef = useRef<number>(0);
  
  const floatingBlockCount = groundEqSettings.floatingBlockCount ?? DEFAULT_FLOATING_BLOCK_COUNT;

  const terrainDensity = groundEqSettings.terrainDensity ?? DEFAULT_TERRAIN_DENSITY;
  const gridSettings = useMemo(() => deriveTerrainGridSettings(terrainDensity), [terrainDensity]);
  const { gridSize, spacing, boxWidth, instanceCount } = gridSettings;
  const floatingBlocksEnabled = groundEqSettings.floatingBlocksEnabled ?? DEFAULT_FLOATING_BLOCKS_ENABLED;
  const floatingBlockIntensity = Math.max(0, Math.min(100, groundEqSettings.floatingBlockIntensity ?? DEFAULT_FLOATING_BLOCK_INTENSITY));
  const floatingBlockMinSize = Math.max(0, Math.min(100, groundEqSettings.floatingBlockMinSize ?? DEFAULT_FLOATING_BLOCK_MIN_SIZE));
  const floatingBlockMaxSize = Math.max(floatingBlockMinSize, Math.min(100, groundEqSettings.floatingBlockMaxSize ?? DEFAULT_FLOATING_BLOCK_MAX_SIZE));
  const floatingBlockSpeed = Math.max(0, Math.min(100, groundEqSettings.floatingBlockSpeed ?? DEFAULT_FLOATING_BLOCK_SPEED));

  const controlsRef = useRef<any>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const tempMatrix = new THREE.Matrix4();
    const offset = (gridSize * spacing) / 2;

    let i = 0;
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const px = x * spacing - offset;
        const pz = z * spacing - offset;
        tempMatrix.makeTranslation(px, 0.5, pz);
        meshRef.current.setMatrixAt(i, tempMatrix);
        i++;
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [gridSize, spacing]);

  // Ripples logic
  const ripplesRef = useRef(new Array(10).fill(null).map(() => ({
    pos: new THREE.Vector2(),
    time: -100,
    strength: 0,
    isActive: 0
  })));
  const rippleIndex = useRef(0);

  const addRipple = (x: number, y: number, strength: number, isWhite: boolean = false) => {
    const idx = rippleIndex.current;
    ripplesRef.current[idx] = {
      pos: new THREE.Vector2(x, y),
      time: clock.getElapsedTime(),
      strength,
      isActive: 1,
      rippleType: isWhite ? 1 : 0
    } as any;
    rippleIndex.current = (idx + 1) % 10;
  };

  const fogRef = useRef<THREE.Fog>(null);
  
  // Meteors logic
  const MAX_METEORS = 20;
  const meteorMeshRef = useRef<THREE.InstancedMesh>(null);
  const meteorMatRef = useRef<THREE.MeshBasicMaterial>(null);
  
  // Particles for meteor trails
  const MAX_PARTICLES = 200;
  const particleMeshRef = useRef<THREE.InstancedMesh>(null);
  const particleMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const particlesRef = useRef(new Array(MAX_PARTICLES).fill(null).map(() => ({
    active: false,
    x: 0, y: -1000, z: 0,
    vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1, scale: 1
  })));
  const particleIndex = useRef(0);
  const spawnParticle = (x: number, y: number, z: number, speedMultiplier: number) => {
     const idx = particleIndex.current;
     const p = particlesRef.current[idx]!;
     p.active = true;
     p.x = x + (Math.random() - 0.5) * 1.5;
     p.y = y + (Math.random() - 0.5) * 1.5;
     p.z = z + (Math.random() - 0.5) * 1.5;
     p.vx = (Math.random() - 0.5) * 2.0;
     p.vy = Math.random() * 2.0 + speedMultiplier * 10.0;
     p.vz = (Math.random() - 0.5) * 2.0;
     p.life = 0;
     p.maxLife = 0.5 + Math.random() * 0.5;
     p.scale = Math.random() * 0.6 + 0.2;
     particleIndex.current = (idx + 1) % MAX_PARTICLES;
  };
  
  const dummyMatrix = useMemo(() => new THREE.Matrix4(), []);
  const dummyPosition = useMemo(() => new THREE.Vector3(), []);
  const dummyRotation = useMemo(() => new THREE.Quaternion(), []);
  const dummyScale = useMemo(() => new THREE.Vector3(), []);
  const floatingBlockRotation = useMemo(() => new THREE.Quaternion(), []);
  const floatingBlockEuler = useMemo(() => new THREE.Euler(), []);
  const floatingBlocks = useMemo(() => {
    const count = floatingBlockCount;
    return Array.from({ length: count }, (_, index) => {
      const ring = index / count;
      const angle = ring * Math.PI * 2 * 5.0 + Math.sin(index * 12.9898) * 0.7;
      const radius = 14 + ((index * 37) % 62);
      const height = 6 + ((index * 17) % 19);
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: height,
        baseScale: 0.75 + ((index * 11) % 9) * 0.05,
        phase: index * 0.73,
        rotationSpeed: 0.18 + ((index * 7) % 10) * 0.035,
      };
    });
  }, [floatingBlockCount]);
  
  const meteorsRef = useRef(new Array(MAX_METEORS).fill(null).map(() => ({
    active: false,
    x: 0, y: -1000, z: 0,
    speed: 0, strength: 0,
  })));
  const meteorIndex = useRef(0);
  const lastMeteorSpawnTime = useRef(-Infinity);

  const addMeteor = (strength: number) => {
     const now = clock.getElapsedTime();
     const cooldownSeconds = engine.meteorTrigger.cooldown / 60;
     if (now - lastMeteorSpawnTime.current < cooldownSeconds) return;
     lastMeteorSpawnTime.current = now;

     const idx = meteorIndex.current;
     const angle = Math.random() * Math.PI * 2;
     const dist = Math.random() * 25;
     
     const m = meteorsRef.current[idx]!;
     m.active = true;
     m.x = Math.cos(angle) * dist;
     m.z = Math.sin(angle) * dist;
     m.y = 30 + Math.random() * 10;
     m.speed = 1.0 + Math.random() * 0.5 + (strength * 1.5);
     m.strength = strength;
     
     meteorIndex.current = (idx + 1) % MAX_METEORS;
  };
  
  // Wire up audio engine beat detection
  useEffect(() => {
    engine.onFreqTrigger = (strength, mode, action) => {
       if (action === 'Meteor') {
          addMeteor(strength);
       } else if (action === 'Snare') {
          const angle = Math.random() * Math.PI * 2;
          const dist = 10 + Math.random() * 35;
          const rx = Math.cos(angle) * dist;
          const rz = Math.sin(angle) * dist;
          addRipple(rx, rz, Math.min(strength * 3.0, 3.0), true);
       } else {
          const angle = Math.random() * Math.PI * 2;
          if (mode === 'Kick') {
             const dist = Math.random() * 20;
             const rx = Math.cos(angle) * dist;
             const rz = Math.sin(angle) * dist;
             addRipple(rx, rz, Math.min(strength * 2.0, 3.0), false);
          } else {
             const dist = 10 + Math.random() * 25;
             const rx = Math.cos(angle) * dist;
             const rz = Math.sin(angle) * dist;
             addRipple(rx, rz, Math.min(strength * 3.0, 3.0), false);
          }
       }
    };
  }, []);

  useFrame((state, delta) => {
    if (visualPlatterRef.current) {
      platterRotationRef.current += rotationSpeed * delta;
      visualPlatterRef.current.rotation.y = platterRotationRef.current;
    }

    if (!materialRef.current) return;
    const mat = materialRef.current;
    const data = engine.getAudioData();
    const t = themeColors!;
    const eqBands = groundEqSettings.bands;
    const enabledBands = groundEqSettings.enabledBands ?? new Array(8).fill(true);
    const motionSpeed = Math.max(0, Math.min(100, groundEqSettings.motionSpeed ?? DEFAULT_GROUND_MOTION_SPEED));
    const amplitude = Math.max(0, Math.min(100, groundEqSettings.amplitude ?? 50));
    const responseRate = THREE.MathUtils.lerp(2.2, 60, motionSpeed / 100);
    const responseBlend = clampAnimationBlend(1 - Math.exp(-responseRate * delta));
    const kickLowBands = deriveKickFollowLowBands({
      kickEnvelope: data.kickEnvelope,
      subBassEnergy: data.subBass,
      bassEnergy: data.bass,
      bands: eqBands,
      enabledBands,
    });
    const targetEqSubBass = kickLowBands.subBass;
    const targetEqBass = kickLowBands.bass;
    const targetEqLowMid = enabledBands[2] ? applyGroundEqBandValue(data.lowMid, eqBands, 'lowMid') : 0;
    const targetEqMid = enabledBands[3] ? applyGroundEqBandValue(data.mid, eqBands, 'mid') : 0;
    const targetEqHighMid = enabledBands[4] ? applyGroundEqBandValue(data.highMid, eqBands, 'highMid') : 0;
    const targetEqPresence = enabledBands[5] ? applyGroundEqBandValue(data.presence, eqBands, 'presence') : 0;
    const targetEqBrilliance = enabledBands[6] ? applyGroundEqBandValue(data.brilliance, eqBands, 'brilliance') : 0;
    const targetEqAir = enabledBands[7] ? applyGroundEqBandValue(data.air, eqBands, 'air') : 0;
    const smoothed = smoothedGroundAudioRef.current;
    smoothed.subBass = THREE.MathUtils.lerp(smoothed.subBass, targetEqSubBass, responseBlend);
    smoothed.bass = THREE.MathUtils.lerp(smoothed.bass, targetEqBass, responseBlend);
    smoothed.lowMid = THREE.MathUtils.lerp(smoothed.lowMid, targetEqLowMid, responseBlend);
    smoothed.mid = THREE.MathUtils.lerp(smoothed.mid, targetEqMid, responseBlend);
    smoothed.highMid = THREE.MathUtils.lerp(smoothed.highMid, targetEqHighMid, responseBlend);
    smoothed.presence = THREE.MathUtils.lerp(smoothed.presence, targetEqPresence, responseBlend);
    smoothed.brilliance = THREE.MathUtils.lerp(smoothed.brilliance, targetEqBrilliance, responseBlend);
    smoothed.air = THREE.MathUtils.lerp(smoothed.air, targetEqAir, responseBlend);
    const eqSubBass = smoothed.subBass;
    const eqBass = smoothed.bass;
    const eqLowMid = smoothed.lowMid;
    const eqMid = smoothed.mid;
    const eqHighMid = smoothed.highMid;
    const eqPresence = smoothed.presence;
    const eqBrilliance = smoothed.brilliance;
    const eqAir = smoothed.air;
    const eqAverage = eqBands.reduce((sum, value) => sum + value, 0) / Math.max(1, eqBands.length);
    const eqEnergy = Math.max(0, Math.min(1, data.energy * (0.25 + (eqAverage / 50) * 0.75)));

    const lerpSpeed = clampAnimationBlend(3.0 * delta);
    mat.uBaseColor1.lerp(t.uBaseColor1, lerpSpeed);
    mat.uBaseColor2.lerp(t.uBaseColor2, lerpSpeed);
    mat.uFogColor.lerp(t.uFogColor, lerpSpeed);
    mat.uCoolCore.lerp(t.uCoolCore, lerpSpeed);
    mat.uCoolEdge.lerp(t.uCoolEdge, lerpSpeed);
    mat.uWarmCore.lerp(t.uWarmCore, lerpSpeed);
    mat.uWarmEdge.lerp(t.uWarmEdge, lerpSpeed);
    mat.uRippleColor.lerp(t.uRippleColor, lerpSpeed);
    mat.uGlowIntensity = THREE.MathUtils.lerp(mat.uGlowIntensity, t.uGlowIntensity, lerpSpeed);

    if (fogRef.current) {
        fogRef.current.color.lerp(t.uBaseColor1, lerpSpeed);
    }

    mat.uTime = state.clock.getElapsedTime();
    
    let amplitudeMultiplier = 1.0;
    if (amplitude <= 50) {
        amplitudeMultiplier = amplitude / 50.0;
    } else {
        const t = (amplitude - 50) / 50.0;
        amplitudeMultiplier = 1.0 + Math.pow(t, 2) * 14.0;
    }

    mat.uMid = eqMid;
    mat.uTreble = data.treble;
    mat.uEnergy = eqEnergy;
    mat.uAmplitude = amplitudeMultiplier;
    
    mat.uSubBass = eqSubBass;
    mat.uBass = eqBass;
    
    mat.uLowMid = eqLowMid;
    mat.uHighMid = eqHighMid;
    mat.uPresence = eqPresence;
    mat.uBrilliance = eqBrilliance;
    mat.uAir = eqAir;

    mat.uWarmth = Math.max(0, Math.min(1, (eqSubBass + eqBass + eqLowMid + eqMid) / Math.max(0.001, eqSubBass + eqBass + eqLowMid + eqMid + eqPresence + eqBrilliance + eqAir)));
    mat.uBrightness = Math.max(0, Math.min(1, (eqPresence + eqBrilliance + eqAir) / Math.max(0.001, eqSubBass + eqBass + eqLowMid + eqMid + eqPresence + eqBrilliance + eqAir)));
    mat.uSharpness = data.sharpness;
    mat.uSmoothness = data.smoothness;
    mat.uDensity = data.density;
    mat.uSpectralCentroid = data.spectralCentroid;
    
    mat.uRipples = ripplesRef.current;

    // Update floating blocks
    if (floatingBlockMeshRef.current) {
      const enabledScale = floatingBlocksEnabled ? 1 : 0;
      const intensity = floatingBlockIntensity / 100;
      const rawPulse = Math.max(0, Math.min(1, data.kickEnvelope));
      const speedRate = THREE.MathUtils.lerp(3.0, 36.0, floatingBlockSpeed / 100);
      const pulseBlend = clampAnimationBlend(1 - Math.exp(-speedRate * delta));
      floatingBlockPulseRef.current = THREE.MathUtils.lerp(floatingBlockPulseRef.current, rawPulse, pulseBlend);
      const pulse = floatingBlockPulseRef.current;
      const minVisualScale = THREE.MathUtils.lerp(0.12, 0.75, floatingBlockMinSize / 100);
      const maxVisualScale = Math.max(minVisualScale + 0.05, THREE.MathUtils.lerp(0.45, 3.2, floatingBlockMaxSize / 100));
      const sizeMix = Math.max(0, Math.min(1, pulse * (0.5 + intensity * 1.7)));
      const pulseScale = THREE.MathUtils.lerp(minVisualScale, maxVisualScale, sizeMix);

      if (floatingBlockMatRef.current) {
        const blockMat = floatingBlockMatRef.current;
        blockMat.uTime = state.clock.getElapsedTime();
        blockMat.uPulse = sizeMix;
        
        blockMat.uBaseColor1.lerp(t.uBaseColor1, lerpSpeed);
        blockMat.uBaseColor2.lerp(t.uBaseColor2, lerpSpeed);
        blockMat.uFogColor.lerp(t.uFogColor, lerpSpeed);
        blockMat.uCoolCore.lerp(t.uCoolCore, lerpSpeed);
        blockMat.uCoolEdge.lerp(t.uCoolEdge, lerpSpeed);
        blockMat.uWarmCore.lerp(t.uWarmCore, lerpSpeed);
        blockMat.uWarmEdge.lerp(t.uWarmEdge, lerpSpeed);
        blockMat.uRippleColor.lerp(t.uRippleColor, lerpSpeed);
        blockMat.uGlowIntensity = THREE.MathUtils.lerp(blockMat.uGlowIntensity, t.uGlowIntensity, lerpSpeed);
        
        blockMat.uWarmth = mat.uWarmth;
        blockMat.uBrightness = mat.uBrightness;
        blockMat.uSharpness = mat.uSharpness;
        blockMat.uPresence = mat.uPresence;
        blockMat.uBrilliance = mat.uBrilliance;
        blockMat.uAir = mat.uAir;
        
        blockMat.transparent = true;
      }

      for (let i = 0; i < floatingBlocks.length; i++) {
        const block = floatingBlocks[i]!;
        const bob = Math.sin(mat.uTime * (0.55 + block.rotationSpeed) + block.phase) * 0.45;
        dummyPosition.set(block.x, block.y + bob + pulse * intensity * 1.4, block.z);
        floatingBlockEuler.set(
          mat.uTime * block.rotationSpeed + block.phase,
          mat.uTime * block.rotationSpeed * 0.7 + block.phase,
          mat.uTime * block.rotationSpeed * 0.45,
        );
        floatingBlockRotation.setFromEuler(floatingBlockEuler);
        const scale = block.baseScale * pulseScale * enabledScale;
        dummyScale.set(scale, scale, scale);
        dummyMatrix.compose(dummyPosition, floatingBlockRotation, dummyScale);
        floatingBlockMeshRef.current.setMatrixAt(i, dummyMatrix);
      }
      floatingBlockMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Update meteors
    if (meteorMeshRef.current) {
        if (meteorMatRef.current) {
            const mColor = new THREE.Color().copy(t.uWarmCore).lerp(new THREE.Color(0xffffff), 0.7);
            meteorMatRef.current.color.lerp(mColor, lerpSpeed);
        }

        for (let i = 0; i < MAX_METEORS; i++) {
            const m = meteorsRef.current[i]!;
            if (!m.active) {
                dummyPosition.set(0, -1000, 0);
                dummyScale.set(0, 0, 0);
                dummyMatrix.compose(dummyPosition, dummyRotation, dummyScale);
                meteorMeshRef.current.setMatrixAt(i, dummyMatrix);
            } else {
                m.y -= m.speed * 60 * delta;
                if (m.y <= 0) {
                    m.active = false;
                    addRipple(m.x, m.z, Math.min(m.strength * 1.0, 1.2), true);
                    for (let pIndex = 0; pIndex < 10; pIndex++) spawnParticle(m.x, 0.5, m.z, m.speed * 1.5);
                }
                dummyPosition.set(m.x, Math.max(0, m.y), m.z);
                dummyScale.set(1.5, 1.5, 1.5);
                dummyMatrix.compose(dummyPosition, dummyRotation, dummyScale);
                meteorMeshRef.current.setMatrixAt(i, dummyMatrix);
                
                if (m.y > 0 && Math.random() > 0.3) {
                   spawnParticle(m.x, m.y, m.z, m.speed * 0.2);
                }
            }
        }
        meteorMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    
    // Update particles
    if (particleMeshRef.current) {
        if (particleMatRef.current) {
          particleMatRef.current.color.copy(meteorMatRef.current ? meteorMatRef.current.color : new THREE.Color(0xffffff));
        }
        
        for (let i = 0; i < MAX_PARTICLES; i++) {
           const p = particlesRef.current[i]!;
           if (!p.active) {
                dummyPosition.set(0, -1000, 0);
                dummyScale.set(0, 0, 0);
                dummyMatrix.compose(dummyPosition, dummyRotation, dummyScale);
                particleMeshRef.current.setMatrixAt(i, dummyMatrix);
           } else {
                p.life += delta;
                if (p.life >= p.maxLife) {
                    p.active = false;
                    dummyScale.set(0, 0, 0);
                } else {
                    p.x += p.vx * delta * 10;
                    p.y += p.vy * delta * 10;
                    p.z += p.vz * delta * 10;
                    const s = p.scale * (1.0 - (p.life / p.maxLife));
                    dummyPosition.set(p.x, p.y, p.z);
                    dummyScale.set(s, s, s);
                }
                dummyMatrix.compose(dummyPosition, dummyRotation, dummyScale);
                particleMeshRef.current.setMatrixAt(i, dummyMatrix);
           }
        }
        if (particleMeshRef.current) {
          particleMeshRef.current.instanceMatrix.needsUpdate = true;
        }
    }
  });

  // Interaction
  let pressTime = 0;

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    pressTime = performance.now();
  };

  function toPlatterLocalPoint(point: THREE.Vector3) {
    if (!visualPlatterRef.current) return localPointRef.current.copy(point);
    return visualPlatterRef.current.worldToLocal(localPointRef.current.copy(point));
  }

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const duration = performance.now() - pressTime;
    const strength = Math.min(0.2 + (duration / 1000) * 2.8, 3.0);
    const localPoint = toPlatterLocalPoint(e.point);
    addRipple(localPoint.x, localPoint.z, strength);
  };

  const t = themeColors!;

  return (
    <>
      <fog ref={fogRef} attach="fog" args={[`#${t.uBaseColor1.getHexString()}`, 30, 95]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
      
      <OrbitControls 
        ref={controlsRef}
        makeDefault 
        enablePan={false}
        enableRotate
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_ROTATE,
        }}
        minDistance={5}
        maxDistance={120}
        maxPolarAngle={Math.PI / 2 - 0.1}
      />

      <group ref={visualPlatterRef}>
        <instancedMesh
          key={gridSize}
          ref={meshRef}
          args={[undefined, undefined, instanceCount]}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <boxGeometry args={[boxWidth, 1, boxWidth]} />
          {/* @ts-ignore */}
          <mapShaderMaterial ref={materialRef} transparent={true} />
        </instancedMesh>

        {floatingBlocksEnabled && (
          <instancedMesh
            ref={floatingBlockMeshRef}
            args={[undefined as any, undefined as any, floatingBlocks.length]}
          >
            <boxGeometry args={[1, 1, 1]} />
            {/* @ts-ignore */}
            <floatingBlockShaderMaterial ref={floatingBlockMatRef} transparent={true} />
          </instancedMesh>
        )}
        
        <instancedMesh ref={meteorMeshRef} args={[undefined as any, undefined as any, MAX_METEORS]} frustumCulled={false}>
           <boxGeometry args={[0.4, 1.2, 0.4]} />
           <meshBasicMaterial ref={meteorMatRef} color="#ffffff" toneMapped={false} /> 
        </instancedMesh>

        <instancedMesh ref={particleMeshRef} args={[undefined as any, undefined as any, MAX_PARTICLES]} frustumCulled={false}>
           <boxGeometry args={[0.8, 0.8, 0.8]} />
           <meshBasicMaterial ref={particleMatRef} color="#ffffff" toneMapped={false} transparent={true} opacity={0.6} /> 
        </instancedMesh>
      </group>
    </>
  );
}