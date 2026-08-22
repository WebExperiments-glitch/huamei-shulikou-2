import * as THREE from 'three';

export interface CustomThemeSettings {
  id: string;
  name: string;
  background: string;
  fog: string;
  fogLinkedToBackground: boolean;
  cool: string;
  warm: string;
  accent: string;
  glowIntensity: number;
}

export interface ThemeColors {
  name: string;
  id: string;
  uBaseColor1: THREE.Color;
  uBaseColor2: THREE.Color;
  uFogColor: THREE.Color;
  uCoolCore: THREE.Color;
  uCoolEdge: THREE.Color;
  uWarmCore: THREE.Color;
  uWarmEdge: THREE.Color;
  uRippleColor: THREE.Color;
  uGlowIntensity: number;
}

export const CUSTOM_THEME_ID = 'custom';
export const BUILT_IN_THEME_IDS = [
  'ink-wash',
  'nocturnal',
  'neon-tokyo',
  'cyber-forest',
  'minimal-monochrome',
  'glacier-day',
  'koi-pond',
  'coral-reef',
  'moss-glass',
  'blue-hour',
  'porcelain-teal',
  'wine-signal',
  'daybreak-lime',
];
export const DEFAULT_THEME_ID = 'minimal-monochrome';

export const themes: Record<string, ThemeColors> = {
  'ink-wash': {
    name: 'Ink Wash',
    id: 'ink-wash',
    uBaseColor1: new THREE.Color(1.0, 1.0, 1.0),
    uBaseColor2: new THREE.Color(1.0, 1.0, 1.0).lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color(1.0, 1.0, 1.0),
    uCoolCore: new THREE.Color(0.0, 0.0, 0.0),
    uCoolEdge: new THREE.Color(0.0, 0.0, 0.0).lerp(new THREE.Color(1.0, 1.0, 1.0), 0.35),
    uWarmCore: new THREE.Color(0.0, 0.0, 0.0),
    uWarmEdge: new THREE.Color(0.0, 0.0, 0.0).lerp(new THREE.Color(1.0, 1.0, 1.0), 0.35),
    uRippleColor: new THREE.Color(0.66, 0.74, 0.76),
    uGlowIntensity: 1.1,
  },
  'nocturnal': {
    name: 'Nocturnal',
    id: 'nocturnal',
    uBaseColor1: new THREE.Color(0.01, 0.02, 0.04),
    uBaseColor2: new THREE.Color(0.03, 0.05, 0.09),
    uFogColor: new THREE.Color(0.01, 0.02, 0.04),
    uCoolCore: new THREE.Color(0.0, 0.3, 1.0),
    uCoolEdge: new THREE.Color(0.6, 0.2, 1.0),
    uWarmCore: new THREE.Color(1.0, 0.2, 0.1),
    uWarmEdge: new THREE.Color(1.0, 0.6, 0.0),
    uRippleColor: new THREE.Color(0.2, 0.9, 1.0),
    uGlowIntensity: 1.0,
  },
  'neon-tokyo': {
    name: 'Neon Tokyo',
    id: 'neon-tokyo',
    uBaseColor1: new THREE.Color(0.01, 0.005, 0.02),
    uBaseColor2: new THREE.Color(0.04, 0.01, 0.06),
    uFogColor: new THREE.Color(0.01, 0.005, 0.02),
    uCoolCore: new THREE.Color(1.0, 0.1, 0.6),
    uCoolEdge: new THREE.Color(0.6, 0.1, 1.0),
    uWarmCore: new THREE.Color(0.1, 1.0, 0.8),
    uWarmEdge: new THREE.Color(0.1, 0.4, 1.0),
    uRippleColor: new THREE.Color(1.0, 1.0, 1.0),
    uGlowIntensity: 1.5,
  },
  'cyber-forest': {
    name: 'Cyber Forest',
    id: 'cyber-forest',
    uBaseColor1: new THREE.Color(0.01, 0.02, 0.01),
    uBaseColor2: new THREE.Color(0.02, 0.05, 0.02),
    uFogColor: new THREE.Color(0.01, 0.02, 0.01),
    uCoolCore: new THREE.Color(0.1, 1.0, 0.5),
    uCoolEdge: new THREE.Color(0.05, 0.5, 0.3),
    uWarmCore: new THREE.Color(0.8, 1.0, 0.1),
    uWarmEdge: new THREE.Color(0.9, 0.5, 0.1),
    uRippleColor: new THREE.Color(0.6, 1.0, 0.3),
    uGlowIntensity: 1.3,
  },
  'minimal-monochrome': {
    name: 'Minimal Monochrome',
    id: 'minimal-monochrome',
    uBaseColor1: new THREE.Color(0.02, 0.02, 0.02),
    uBaseColor2: new THREE.Color(0.06, 0.06, 0.06),
    uFogColor: new THREE.Color(0.02, 0.02, 0.02),
    uCoolCore: new THREE.Color(0.9, 0.9, 0.9),
    uCoolEdge: new THREE.Color(0.4, 0.4, 0.4),
    uWarmCore: new THREE.Color(1.0, 1.0, 1.0),
    uWarmEdge: new THREE.Color(0.7, 0.7, 0.7),
    uRippleColor: new THREE.Color(1.0, 1.0, 1.0),
    uGlowIntensity: 0.8,
  },
  'glacier-day': {
    name: 'Glacier Day',
    id: 'glacier-day',
    uBaseColor1: new THREE.Color('#D8E6EA'),
    uBaseColor2: new THREE.Color('#D8E6EA').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#E5EEF0'),
    uCoolCore: new THREE.Color('#2D8EA3'),
    uCoolEdge: new THREE.Color('#2D8EA3').lerp(new THREE.Color('#D8E6EA'), 0.35),
    uWarmCore: new THREE.Color('#D96F4D'),
    uWarmEdge: new THREE.Color('#D96F4D').lerp(new THREE.Color('#D8E6EA'), 0.35),
    uRippleColor: new THREE.Color('#2F5963'),
    uGlowIntensity: 0.82,
  },
  'koi-pond': {
    name: 'Koi Pond',
    id: 'koi-pond',
    uBaseColor1: new THREE.Color('#123A36'),
    uBaseColor2: new THREE.Color('#123A36').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#0F2C2A'),
    uCoolCore: new THREE.Color('#55D6B2'),
    uCoolEdge: new THREE.Color('#55D6B2').lerp(new THREE.Color('#123A36'), 0.35),
    uWarmCore: new THREE.Color('#F2A65A'),
    uWarmEdge: new THREE.Color('#F2A65A').lerp(new THREE.Color('#123A36'), 0.35),
    uRippleColor: new THREE.Color('#C8EEE4'),
    uGlowIntensity: 1.12,
  },
  'coral-reef': {
    name: 'Coral Reef',
    id: 'coral-reef',
    uBaseColor1: new THREE.Color('#40252A'),
    uBaseColor2: new THREE.Color('#40252A').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#2F2024'),
    uCoolCore: new THREE.Color('#5FCAD0'),
    uCoolEdge: new THREE.Color('#5FCAD0').lerp(new THREE.Color('#40252A'), 0.35),
    uWarmCore: new THREE.Color('#E8705F'),
    uWarmEdge: new THREE.Color('#E8705F').lerp(new THREE.Color('#40252A'), 0.35),
    uRippleColor: new THREE.Color('#F0B7A4'),
    uGlowIntensity: 1.08,
  },
  'moss-glass': {
    name: 'Moss Glass',
    id: 'moss-glass',
    uBaseColor1: new THREE.Color('#2E3A24'),
    uBaseColor2: new THREE.Color('#2E3A24').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#24301E'),
    uCoolCore: new THREE.Color('#88C8A3'),
    uCoolEdge: new THREE.Color('#88C8A3').lerp(new THREE.Color('#2E3A24'), 0.35),
    uWarmCore: new THREE.Color('#D6C36D'),
    uWarmEdge: new THREE.Color('#D6C36D').lerp(new THREE.Color('#2E3A24'), 0.35),
    uRippleColor: new THREE.Color('#DDE8B3'),
    uGlowIntensity: 0.98,
  },
  'blue-hour': {
    name: 'Blue Hour',
    id: 'blue-hour',
    uBaseColor1: new THREE.Color('#273C55'),
    uBaseColor2: new THREE.Color('#273C55').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#1D3148'),
    uCoolCore: new THREE.Color('#8BC5E7'),
    uCoolEdge: new THREE.Color('#8BC5E7').lerp(new THREE.Color('#273C55'), 0.35),
    uWarmCore: new THREE.Color('#F28C72'),
    uWarmEdge: new THREE.Color('#F28C72').lerp(new THREE.Color('#273C55'), 0.35),
    uRippleColor: new THREE.Color('#CFE7F4'),
    uGlowIntensity: 1.05,
  },
  'porcelain-teal': {
    name: 'Porcelain Teal',
    id: 'porcelain-teal',
    uBaseColor1: new THREE.Color('#DDE8E4'),
    uBaseColor2: new THREE.Color('#DDE8E4').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#EEF4F1'),
    uCoolCore: new THREE.Color('#24786F'),
    uCoolEdge: new THREE.Color('#24786F').lerp(new THREE.Color('#DDE8E4'), 0.35),
    uWarmCore: new THREE.Color('#B85D4D'),
    uWarmEdge: new THREE.Color('#B85D4D').lerp(new THREE.Color('#DDE8E4'), 0.35),
    uRippleColor: new THREE.Color('#4F706A'),
    uGlowIntensity: 0.78,
  },
  'wine-signal': {
    name: 'Wine Signal',
    id: 'wine-signal',
    uBaseColor1: new THREE.Color('#3A2430'),
    uBaseColor2: new THREE.Color('#3A2430').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#2F202A'),
    uCoolCore: new THREE.Color('#83C5BE'),
    uCoolEdge: new THREE.Color('#83C5BE').lerp(new THREE.Color('#3A2430'), 0.35),
    uWarmCore: new THREE.Color('#D95D73'),
    uWarmEdge: new THREE.Color('#D95D73').lerp(new THREE.Color('#3A2430'), 0.35),
    uRippleColor: new THREE.Color('#F0CBD3'),
    uGlowIntensity: 1.06,
  },
  'daybreak-lime': {
    name: 'Daybreak Lime',
    id: 'daybreak-lime',
    uBaseColor1: new THREE.Color('#D9E7C8'),
    uBaseColor2: new THREE.Color('#D9E7C8').lerp(new THREE.Color(0xffffff), 0.12),
    uFogColor: new THREE.Color('#E6EFD9'),
    uCoolCore: new THREE.Color('#2A7C72'),
    uCoolEdge: new THREE.Color('#2A7C72').lerp(new THREE.Color('#D9E7C8'), 0.35),
    uWarmCore: new THREE.Color('#C65B47'),
    uWarmEdge: new THREE.Color('#C65B47').lerp(new THREE.Color('#D9E7C8'), 0.35),
    uRippleColor: new THREE.Color('#5C6F42'),
    uGlowIntensity: 0.8,
  },
};