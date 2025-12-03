
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GameState, Lane, EntityType } from '../types';
import { audioManager } from '../services/audioService';

interface GameCanvasProps {
  gameState: GameState;
  onGameOver: (score: number) => void;
  onScoreUpdate: (score: number) => void;
}

// --- Configuration ---
const LANE_WIDTH = 4;
const PLAYER_SPEED_BASE = 0.25; 
const MAX_SPEED = 0.6;
// Physics Tweaks
const GRAVITY = 0.012; 
const JUMP_FORCE = 0.5;
const LANE_CHANGE_SPEED = 0.2;
const FOG_COLOR = 0x87CEEB; 
const RENDER_DISTANCE = 180;
const CHUNK_LENGTH = 20;

interface FloorChunk {
    mesh: THREE.Group;
    zStart: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onGameOver, onScoreUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const playerRef = useRef<THREE.Group | null>(null);
  
  // Logic Refs
  const frameIdRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const speedRef = useRef(PLAYER_SPEED_BASE);
  const playerLaneRef = useRef<Lane>(Lane.CENTER);
  const currentLaneXRef = useRef(0);
  const playerVelocityYRef = useRef(0);
  const playerJumpYRef = useRef(0); // Vertical offset from jump
  
  const isJumpingRef = useRef(false);
  const isSlidingRef = useRef(false);
  const slideTimerRef = useRef(0);
  const gameActiveRef = useRef(false);
  const lastSpawnZRef = useRef(-60);
  
  // Objects Storage
  const obstaclesRef = useRef<THREE.Group[]>([]);
  const coinsRef = useRef<THREE.Group[]>([]);
  const sceneryRef = useRef<THREE.Group[]>([]);
  const floorChunksRef = useRef<FloorChunk[]>([]);

  // Material Refs (initialized in useEffect)
  const materialsRef = useRef<any>(null);

  // --- 3D Builder Functions ---

  // Helper to create procedural textures
  const createProceduralTexture = (type: 'grass' | 'asphalt' | 'pavement' | 'fur' | 'fabric' | 'metal' | 'badge'): THREE.Texture => {
    const size = 1024; // High res textures
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    if (type === 'grass') {
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(0, 0, size, size);
        for(let i=0; i<40000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#22c55e' : '#86efac';
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = 2 + Math.random() * 3;
            ctx.fillRect(x, y, w, w);
        }
    } else if (type === 'asphalt') {
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, size, size);
        for(let i=0; i<50000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#444444' : '#222222';
            ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
        }
    } else if (type === 'pavement') {
        ctx.fillStyle = '#999999';
        ctx.fillRect(0, 0, size, size);
        for(let i=0; i<10000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#aaaaaa' : '#888888';
            ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
        }
        ctx.strokeStyle = '#777777';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for(let i=0; i<=size; i+=128) {
            ctx.moveTo(i, 0); ctx.lineTo(i, size);
            ctx.moveTo(0, i); ctx.lineTo(size, i);
        }
        ctx.stroke();
    } else if (type === 'fur') {
        // High quality fur noise
        ctx.fillStyle = '#6F4F28';
        ctx.fillRect(0,0,size,size);
        for(let i=0; i<100000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#7F5F38' : '#5A3A15';
            const x = Math.random()*size;
            const y = Math.random()*size;
            // Draw small hair lines
            ctx.fillRect(x,y, 2, 6);
        }
    } else if (type === 'fabric') {
        // Uniform fabric pattern
        ctx.fillStyle = '#0033CC';
        ctx.fillRect(0,0,size,size);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for(let y=0; y<size; y+=4) ctx.fillRect(0, y, size, 2);
        for(let x=0; x<size; x+=4) ctx.fillRect(x, 0, 2, size);
        
        // Add a zipper line for the chest texture
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(size/2 - 10, 0, 20, size);
        ctx.fillStyle = '#888888';
        for(let y=0; y<size; y+=40) ctx.fillRect(size/2 - 8, y, 16, 4);

    } else if (type === 'badge') {
        // Paw Patrol Badge Style
        ctx.fillStyle = '#DDDDDD'; // Silver bg just in case
        ctx.fillRect(0,0,size,size);
        
        // Shield Shape
        ctx.fillStyle = '#0033CC';
        ctx.beginPath();
        ctx.moveTo(size/2, size*0.95);
        ctx.bezierCurveTo(size*0.95, size*0.6, size*0.95, size*0.1, size/2, size*0.1);
        ctx.bezierCurveTo(size*0.05, size*0.1, size*0.05, size*0.6, size/2, size*0.95);
        ctx.fill();
        ctx.lineWidth = 20;
        ctx.strokeStyle = '#FFD700';
        ctx.stroke();

        // Paw Print
        ctx.fillStyle = '#C0C0C0';
        // Main pad
        ctx.beginPath();
        ctx.ellipse(size/2, size*0.55, size*0.15, size*0.12, 0, 0, Math.PI*2);
        ctx.fill();
        // Toes
        [-0.2, -0.07, 0.07, 0.2].forEach((offset, i) => {
            ctx.beginPath();
            const yOff = i === 0 || i === 3 ? 0.35 : 0.28;
            ctx.ellipse(size/2 + offset*size, size*yOff, size*0.05, size*0.06, 0, 0, Math.PI*2);
            ctx.fill();
        });
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // Anisotropy helps textures look good at oblique angles
    tex.anisotropy = 16;
    return tex;
  };

  const getMaterials = () => {
      if (materialsRef.current) return materialsRef.current;
      
      const grassTex = createProceduralTexture('grass');
      grassTex.repeat.set(4, 4);
      const roadTex = createProceduralTexture('asphalt');
      roadTex.repeat.set(1, 8);
      const paveTex = createProceduralTexture('pavement');
      paveTex.repeat.set(1, 8);
      const furTex = createProceduralTexture('fur');
      const fabricTex = createProceduralTexture('fabric');
      const badgeTex = createProceduralTexture('badge');

      materialsRef.current = {
        furDark: new THREE.MeshStandardMaterial({ map: furTex, roughness: 0.8, bumpMap: furTex, bumpScale: 0.02 }), 
        furLight: new THREE.MeshStandardMaterial({ color: 0xEECFA1, map: furTex, roughness: 0.8, bumpMap: furTex, bumpScale: 0.01 }), 
        uniformBlue: new THREE.MeshStandardMaterial({ map: fabricTex, roughness: 0.6 }), 
        badge: new THREE.MeshStandardMaterial({ map: badgeTex, roughness: 0.3, metalness: 0.5 }),
        uniformTrim: new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.6, roughness: 0.3 }), 
        black: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
        white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }),
        eyeBlue: new THREE.MeshStandardMaterial({ color: 0x4B0082, roughness: 0.1 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.2, metalness: 0.9 }),
        road: new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.8 }),
        sidewalk: new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.9 }),
        grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1.0 }),
        treeTrunk: new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 1.0 }),
        treeLeaves: new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 1.0 }),
        glow: new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.4 }),
        red: new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 }),
      };
      return materialsRef.current;
  };

  // --- High Poly Chase Construction ---
  const createChase = (): THREE.Group => {
    const mats = getMaterials();
    const chaseGroup = new THREE.Group();
    const bodyGroup = new THREE.Group(); 
    chaseGroup.add(bodyGroup);

    // Resolution constants
    const HI_RES = 32;
    const MID_RES = 16;

    // --- Body (Capsule) ---
    const torsoGeo = new THREE.CapsuleGeometry(0.4, 0.7, 4, HI_RES);
    const torso = new THREE.Mesh(torsoGeo, mats.uniformBlue);
    torso.position.y = 1.0;
    torso.castShadow = true;
    bodyGroup.add(torso);

    const vestGeo = new THREE.CapsuleGeometry(0.42, 0.3, 4, HI_RES);
    const vest = new THREE.Mesh(vestGeo, mats.uniformBlue);
    vest.position.set(0, 1.2, 0);
    bodyGroup.add(vest);
    
    const collarGeo = new THREE.TorusGeometry(0.38, 0.08, 16, HI_RES);
    const collar = new THREE.Mesh(collarGeo, mats.black);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 1.55, 0);
    bodyGroup.add(collar);
    
    const tagGeo = new THREE.CylinderGeometry(0.18, 0.15, 0.05, MID_RES);
    const tag = new THREE.Mesh(tagGeo, mats.badge);
    tag.rotation.x = Math.PI / 2;
    tag.rotation.y = Math.PI; 
    tag.rotation.z = Math.PI;
    tag.position.set(0, 1.35, 0.45);
    bodyGroup.add(tag);

    // --- Head ---
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.85, 0.1);
    bodyGroup.add(headGroup);

    const headGeo = new THREE.SphereGeometry(0.48, HI_RES, HI_RES);
    const head = new THREE.Mesh(headGeo, mats.furDark);
    headGroup.add(head);

    const snoutGeo = new THREE.CapsuleGeometry(0.22, 0.25, 4, MID_RES);
    const snout = new THREE.Mesh(snoutGeo, mats.furLight);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.15, 0.45);
    headGroup.add(snout);

    const noseGeo = new THREE.SphereGeometry(0.1, MID_RES, MID_RES);
    const nose = new THREE.Mesh(noseGeo, mats.black);
    nose.scale.set(1.2, 0.8, 1);
    nose.position.set(0, 0, 0.25);
    snout.add(nose);

    const eyeWhiteGeo = new THREE.SphereGeometry(0.14, MID_RES, MID_RES);
    const pupilGeo = new THREE.SphereGeometry(0.08, MID_RES, MID_RES);
    
    const leftEyeGroup = new THREE.Group();
    leftEyeGroup.position.set(-0.2, 0.1, 0.38);
    leftEyeGroup.rotation.y = -0.2;
    headGroup.add(leftEyeGroup);

    const eyeL = new THREE.Mesh(eyeWhiteGeo, mats.white);
    eyeL.scale.set(1, 1, 0.4); 
    leftEyeGroup.add(eyeL);
    
    const irisL = new THREE.Mesh(pupilGeo, mats.furDark);
    irisL.position.z = 0.1;
    irisL.scale.z = 0.5;
    leftEyeGroup.add(irisL);
    
    const pupilL = new THREE.Mesh(pupilGeo, mats.black);
    pupilL.position.z = 0.12;
    pupilL.scale.set(0.5, 0.5, 0.5);
    leftEyeGroup.add(pupilL);

    const rightEyeGroup = new THREE.Group();
    rightEyeGroup.position.set(0.2, 0.1, 0.38);
    rightEyeGroup.rotation.y = 0.2;
    headGroup.add(rightEyeGroup);

    const eyeR = new THREE.Mesh(eyeWhiteGeo, mats.white);
    eyeR.scale.set(1, 1, 0.4);
    rightEyeGroup.add(eyeR);
    
    const irisR = new THREE.Mesh(pupilGeo, mats.furDark);
    irisR.position.z = 0.1;
    irisR.scale.z = 0.5;
    rightEyeGroup.add(irisR);

    const pupilR = new THREE.Mesh(pupilGeo, mats.black);
    pupilR.position.z = 0.12;
    pupilR.scale.set(0.5, 0.5, 0.5);
    rightEyeGroup.add(pupilR);

    const earGeo = new THREE.ConeGeometry(0.18, 0.5, MID_RES);
    
    const earL = new THREE.Mesh(earGeo, mats.furDark);
    earL.position.set(-0.35, 0.4, 0);
    earL.rotation.z = 0.4;
    earL.rotation.x = -0.2;
    headGroup.add(earL);
    const earInnerL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, MID_RES), mats.furLight);
    earInnerL.position.set(0, -0.05, 0.1);
    earL.add(earInnerL);
    
    const earR = new THREE.Mesh(earGeo, mats.furDark);
    earR.position.set(0.35, 0.4, 0);
    earR.rotation.z = -0.4;
    earR.rotation.x = -0.2;
    headGroup.add(earR);
    const earInnerR = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, MID_RES), mats.furLight);
    earInnerR.position.set(0, -0.05, 0.1);
    earR.add(earInnerR);

    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 0.45, 0);
    hatGroup.rotation.x = -0.1;
    headGroup.add(hatGroup);

    const hatBandGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.15, HI_RES);
    const hatBand = new THREE.Mesh(hatBandGeo, mats.black);
    hatGroup.add(hatBand);

    const hatTopGeo = new THREE.CylinderGeometry(0.45, 0.42, 0.25, HI_RES);
    const hatTop = new THREE.Mesh(hatTopGeo, mats.uniformBlue);
    hatTop.position.y = 0.2;
    hatGroup.add(hatTop);

    const visorGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.05, HI_RES, 1, false, 0, Math.PI);
    const visor = new THREE.Mesh(visorGeo, mats.black);
    visor.scale.set(1, 1, 1.5);
    visor.rotation.x = 0.3;
    visor.position.set(0, 0, 0.2);
    hatGroup.add(visor);
    
    const hatBadge = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), mats.badge);
    hatBadge.position.set(0, 0.2, 0.43);
    hatBadge.scale.z = 0.5;
    hatGroup.add(hatBadge);

    const packGroup = new THREE.Group();
    packGroup.position.set(0, 1.2, -0.35);
    bodyGroup.add(packGroup);

    const packMain = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 16), mats.uniformBlue);
    packMain.rotation.z = Math.PI / 2;
    packGroup.add(packMain);

    const pocketGeo = new THREE.CapsuleGeometry(0.15, 0.3, 4, 16);
    const pocketL = new THREE.Mesh(pocketGeo, mats.uniformBlue);
    pocketL.rotation.x = Math.PI / 2;
    pocketL.position.set(-0.35, 0, 0.1);
    packGroup.add(pocketL);
    
    const pocketR = new THREE.Mesh(pocketGeo, mats.uniformBlue);
    pocketR.rotation.x = Math.PI / 2;
    pocketR.position.set(0.35, 0, 0.1);
    packGroup.add(pocketR);

    const gadgetGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.4, MID_RES);
    const gadgetL = new THREE.Mesh(gadgetGeo, mats.metal);
    gadgetL.rotation.x = Math.PI / 3;
    gadgetL.position.set(-0.25, 0.3, 0.2);
    packGroup.add(gadgetL);
    
    const gadgetR = new THREE.Mesh(gadgetGeo, mats.metal);
    gadgetR.rotation.x = Math.PI / 3;
    gadgetR.position.set(0.25, 0.3, 0.2);
    packGroup.add(gadgetR);

    const legGeo = new THREE.CapsuleGeometry(0.11, 0.5, 4, 16);
    const positions = [
      { x: -0.22, z: 0.25, name: 'legFL' },
      { x: 0.22, z: 0.25, name: 'legFR' },
      { x: -0.22, z: -0.25, name: 'legBL' },
      { x: 0.22, z: -0.25, name: 'legBR' }
    ];

    positions.forEach(pos => {
      const legGroup = new THREE.Group();
      legGroup.position.set(pos.x, 0.6, pos.z);
      legGroup.name = pos.name;

      const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.18, MID_RES, MID_RES), mats.furDark);
      thigh.position.y = 0.15;
      legGroup.add(thigh);

      const leg = new THREE.Mesh(legGeo, mats.furLight);
      leg.position.y = -0.15;
      legGroup.add(leg);

      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.14, MID_RES, MID_RES), mats.furLight);
      paw.scale.set(1.1, 0.8, 1.3);
      paw.position.set(0, -0.5, 0.08);
      legGroup.add(paw);

      bodyGroup.add(legGroup);
    });

    const tailGeo = new THREE.CapsuleGeometry(0.08, 0.6, 4, 16);
    const tail = new THREE.Mesh(tailGeo, mats.furDark);
    tail.rotation.x = 2.0;
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.8, -0.4);
    tailGroup.add(tail);
    tailGroup.name = 'tail';
    bodyGroup.add(tailGroup);

    return chaseGroup;
  };

  const createBone = (): THREE.Group => {
    const mats = getMaterials();
    const group = new THREE.Group();
    const boneMat = new THREE.MeshStandardMaterial({ 
        color: 0xFFD700, 
        roughness: 0.3, 
        metalness: 0.8,
        emissive: 0xaa8800,
        emissiveIntensity: 0.2
    });

    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 32), boneMat);
    stick.rotation.z = Math.PI / 2;
    
    const bulbGeo = new THREE.SphereGeometry(0.25, 32, 32);
    const leftBulb = new THREE.Mesh(bulbGeo, boneMat);
    leftBulb.position.x = -0.4;
    const rightBulb = new THREE.Mesh(bulbGeo, boneMat);
    rightBulb.position.x = 0.4;

    group.add(stick, leftBulb, rightBulb);

    const glowGeo = new THREE.RingGeometry(0.6, 0.8, 32);
    const glow = new THREE.Mesh(glowGeo, mats.glow);
    glow.name = 'glow';
    group.add(glow);

    group.userData = { type: EntityType.COIN };
    return group;
  };

  const createCar = (color: number): THREE.Group => {
    const mats = getMaterials();
    const group = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(2.4, 1.0, 4.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);

    const cabinGeo = new THREE.BoxGeometry(2.0, 0.7, 2.5);
    const cabin = new THREE.Mesh(cabinGeo, mats.glass); 
    cabin.position.set(0, 1.5, -0.2);
    group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.31, 16);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
    
    [
      {x: -1.2, z: 1.5}, {x: 1.2, z: 1.5},
      {x: -1.2, z: -1.5}, {x: 1.2, z: -1.5}
    ].forEach(pos => {
      const wGroup = new THREE.Group();
      wGroup.position.set(pos.x, 0.4, pos.z);
      wGroup.rotation.z = Math.PI / 2;
      
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      const h = new THREE.Mesh(hubGeo, hubMat);
      wGroup.add(w, h);
      group.add(wGroup);
    });

    const lightGeo = new THREE.CapsuleGeometry(0.15, 0.2, 4, 8);
    const headLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({color: 0xffffcc}));
    headLight.rotation.x = Math.PI / 2;
    headLight.position.set(-0.8, 0.9, 2.26);
    group.add(headLight.clone());
    headLight.position.x = 0.8;
    group.add(headLight);

    if (color === 0x0033CC) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.3), mats.metal);
      bar.position.set(0, 1.9, 0);
      group.add(bar);
      const sirenL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.2, 16), new THREE.MeshBasicMaterial({color: 0xff0000}));
      sirenL.position.set(-0.4, 2.0, 0);
      group.add(sirenL);
      const sirenR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.2, 16), new THREE.MeshBasicMaterial({color: 0x0000ff}));
      sirenR.position.set(0.4, 2.0, 0);
      group.add(sirenR);
    }

    group.userData = { type: EntityType.OBSTACLE_LOW, height: 2.0 };
    return group;
  };

  const createBus = (): THREE.Group => {
    const mats = getMaterials();
    const group = new THREE.Group();
    const color = 0xFFCC00;
    const busMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });

    const bodyGeo = new THREE.BoxGeometry(2.8, 2.8, 7);
    const body = new THREE.Mesh(bodyGeo, busMat);
    body.position.y = 2.0;
    body.castShadow = true;
    group.add(body);

    const winGeo = new THREE.BoxGeometry(2.85, 0.8, 6);
    const win = new THREE.Mesh(winGeo, mats.black);
    win.position.set(0, 2.5, 0);
    group.add(win);

    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    
    [{z: 2.5}, {z: -2.5}].forEach(pos => {
      const wL = new THREE.Mesh(wheelGeo, wheelMat);
      wL.rotation.z = Math.PI / 2;
      wL.position.set(-1.4, 0.5, pos.z);
      group.add(wL);
      const wR = wL.clone();
      wR.position.set(1.4, 0.5, pos.z);
      group.add(wR);
    });

    group.userData = { type: EntityType.OBSTACLE_HIGH, height: 4.5 };
    return group;
  };

  const createBridge = (): THREE.Group => {
    const mats = getMaterials();
    const group = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(0.4, 0.4, 5, 16);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
    
    const p1 = new THREE.Mesh(pillarGeo, pillarMat);
    p1.position.set(-2, 2.5, 0);
    const p2 = new THREE.Mesh(pillarGeo, pillarMat);
    p2.position.set(2, 2.5, 0);
    
    const deckGeo = new THREE.BoxGeometry(6, 0.5, 2);
    const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({color: 0x777777, roughness: 0.8}));
    deck.position.set(0, 4.5, 0);
    
    const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 6, 8);
    const railMat = new THREE.MeshStandardMaterial({color: 0x990000, roughness: 0.5});
    
    const r1 = new THREE.Mesh(railGeo, railMat);
    r1.rotation.z = Math.PI / 2;
    r1.position.set(0, 5.2, 0.9);
    const r2 = new THREE.Mesh(railGeo, railMat);
    r2.rotation.z = Math.PI / 2;
    r2.position.set(0, 5.2, -0.9);

    group.add(p1, p2, deck, r1, r2);
    group.userData = { type: EntityType.OBSTACLE_HIGH, height: 5.0 };
    return group;
  };

  const createTree = (): THREE.Group => {
    const mats = getMaterials();
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.5, 12);
    const trunk = new THREE.Mesh(trunkGeo, mats.treeTrunk);
    trunk.position.y = 0.75;
    
    const leavesGeo = new THREE.ConeGeometry(1.5, 3.5, 16);
    const leaves = new THREE.Mesh(leavesGeo, mats.treeLeaves);
    leaves.position.y = 2.5;
    
    group.add(trunk, leaves);
    return group;
  };

  const createBuilding = (height: number): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(12, height, 12);
    
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const hues = ['#e2e8f0', '#cbd5e1', '#f1f5f9', '#bfdbfe'];
        ctx.fillStyle = hues[Math.floor(Math.random() * hues.length)];
        ctx.fillRect(0,0,512,1024);
        
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for(let y=0; y<1024; y+=16) ctx.fillRect(0,y,512,2);
        
        ctx.fillStyle = '#1e293b';
        for(let y=80; y<960; y+=80) {
            for(let x=40; x<440; x+=100) {
                ctx.fillRect(x, y, 60, 80);
                if (Math.random() > 0.4) {
                    ctx.fillStyle = '#fef08a';
                    ctx.fillRect(x+8, y+8, 44, 64);
                    ctx.fillStyle = '#1e293b';
                }
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
    return new THREE.Mesh(geo, mat);
  };

  // --- Initialization ---

  useEffect(() => {
    if (!containerRef.current) return;

    // Force materials creation
    getMaterials();

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.Fog(FOG_COLOR, 40, RENDER_DISTANCE); 
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, RENDER_DISTANCE + 20);
    camera.position.set(0, 5, -8);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(30, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Player
    const player = createChase();
    playerRef.current = player;
    scene.add(player);

    // Initial Ground
    for(let i=0; i<8; i++) {
        spawnFloorChunk(-i * CHUNK_LENGTH);
    }
    lastSpawnZRef.current = -140;

    // Handlers
    const onWindowResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', onWindowResize);

    const onKeyDown = (e: KeyboardEvent) => {
      handleInput(e.key);
    };
    window.addEventListener('keydown', onKeyDown);

    // Start Loop
    startLoop();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frameIdRef.current);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      audioManager.stopMusic();
    };
  }, []);

  // --- Game Loop Logic ---

  useEffect(() => {
    gameActiveRef.current = gameState === GameState.PLAYING;
    
    if (gameState === GameState.MENU) {
      resetGame();
      audioManager.stopMusic();
    } else if (gameState === GameState.PLAYING) {
      audioManager.startMusic();
    }
  }, [gameState]);

  const resetGame = () => {
    scoreRef.current = 0;
    speedRef.current = PLAYER_SPEED_BASE;
    playerLaneRef.current = Lane.CENTER;
    currentLaneXRef.current = 0;
    playerVelocityYRef.current = 0;
    playerJumpYRef.current = 0;
    isJumpingRef.current = false;
    isSlidingRef.current = false;
    
    if (sceneRef.current) {
      obstaclesRef.current.forEach(o => sceneRef.current?.remove(o));
      coinsRef.current.forEach(c => sceneRef.current?.remove(c));
      sceneryRef.current.forEach(s => sceneRef.current?.remove(s));
      floorChunksRef.current.forEach(f => sceneRef.current?.remove(f.mesh));
      
      obstaclesRef.current = [];
      coinsRef.current = [];
      sceneryRef.current = [];
      floorChunksRef.current = [];
      
      for(let i=0; i<8; i++) {
        spawnFloorChunk(-i * CHUNK_LENGTH);
      }
      lastSpawnZRef.current = -140;
    }

    if (playerRef.current) {
      playerRef.current.position.set(0, 0, 0);
      playerRef.current.rotation.set(0, Math.PI, 0);
    }
  };

  const handleInput = (key: string) => {
    if (!gameActiveRef.current) return;
    const k = key.toLowerCase();
    
    if (k === 'a' || k === 'arrowleft') {
      if (playerLaneRef.current > Lane.LEFT) {
          playerLaneRef.current--;
          audioManager.playSlide();
      }
    }
    if (k === 'd' || k === 'arrowright') {
      if (playerLaneRef.current < Lane.RIGHT) {
          playerLaneRef.current++;
          audioManager.playSlide();
      }
    }
    if ((k === 'w' || k === 'arrowup' || k === ' ') && !isJumpingRef.current && !isSlidingRef.current) {
      isJumpingRef.current = true;
      playerVelocityYRef.current = JUMP_FORCE;
      audioManager.playJump();
    }
    if ((k === 's' || k === 'arrowdown') && !isSlidingRef.current && !isJumpingRef.current) {
      isSlidingRef.current = true;
      slideTimerRef.current = 50;
      audioManager.playSlide();
    }
  };

  const spawnFloorChunk = (zPos: number) => {
    if (!sceneRef.current) return;
    const mats = getMaterials();
    
    const chunkGroup = new THREE.Group();

    // Scenery Base
    const grassGeo = new THREE.BoxGeometry(40, 0.1, CHUNK_LENGTH);
    const grassL = new THREE.Mesh(grassGeo, mats.grass);
    grassL.position.set(-33, -0.1, zPos - CHUNK_LENGTH/2);
    chunkGroup.add(grassL);
    const grassR = new THREE.Mesh(grassGeo, mats.grass);
    grassR.position.set(33, -0.1, zPos - CHUNK_LENGTH/2);
    chunkGroup.add(grassR);

    // Buildings & Trees on side
    [-15, 15].forEach(sideX => {
        if (Math.random() > 0.6) {
            const tree = createTree();
            tree.position.set(sideX + (Math.random()*4 - 2), 0, zPos - Math.random() * CHUNK_LENGTH);
            tree.scale.setScalar(0.8 + Math.random() * 0.4);
            chunkGroup.add(tree);
        }
    });

    // Road
    const roadGeo = new THREE.PlaneGeometry(14, CHUNK_LENGTH);
    const road = new THREE.Mesh(roadGeo, mats.road);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, zPos - CHUNK_LENGTH/2);
    road.receiveShadow = true;
    chunkGroup.add(road);
    
    const walkGeo = new THREE.BoxGeometry(6, 0.4, CHUNK_LENGTH);
    const leftWalk = new THREE.Mesh(walkGeo, mats.sidewalk);
    leftWalk.position.set(-10, 0.2, zPos - CHUNK_LENGTH/2);
    leftWalk.receiveShadow = true;
    chunkGroup.add(leftWalk);
    const rightWalk = new THREE.Mesh(walkGeo, mats.sidewalk);
    rightWalk.position.set(10, 0.2, zPos - CHUNK_LENGTH/2);
    rightWalk.receiveShadow = true;
    chunkGroup.add(rightWalk);

    // Lane lines
    const lineGeo = new THREE.PlaneGeometry(0.25, 3);
    [-2, 2].forEach(x => {
        for(let i=0; i<4; i++) {
            const line = new THREE.Mesh(lineGeo, mats.white);
            line.rotation.x = -Math.PI / 2;
            line.position.set(x, 0.02, zPos - 2.5 - (i * 5));
            chunkGroup.add(line);
        }
    });

    sceneRef.current.add(chunkGroup);
    floorChunksRef.current.push({ mesh: chunkGroup, zStart: zPos });
  };

  const spawnObstacles = (zPos: number) => {
    if (Math.random() > 0.3) {
      const lanes = [Lane.LEFT, Lane.CENTER, Lane.RIGHT];
      lanes.sort(() => Math.random() - 0.5);
      
      const count = 1 + Math.floor(Math.random() * 2);
      
      for(let i=0; i<count; i++) {
        const lane = lanes[i];
        const xPos = (lane - 1) * LANE_WIDTH;
        
        const typeRoll = Math.random();
        let entity: THREE.Group;
        
        if (typeRoll < 0.25) {
          entity = createBone();
          entity.position.set(xPos, 1.2, zPos - Math.random() * 10 - 5);
          coinsRef.current.push(entity);
        } else if (typeRoll < 0.6) {
          const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xffffff, 0x111111];
          const carColor = colors[Math.floor(Math.random() * colors.length)];
          entity = createCar(carColor);
          entity.position.set(xPos, 0, zPos - Math.random() * 10 - 5);
          entity.rotation.y = 0; 
          obstaclesRef.current.push(entity);
        } else {
            if (Math.random() > 0.5) {
                entity = createBus();
                entity.position.set(xPos, 0, zPos - Math.random() * 10 - 5);
            } else {
                entity = createBridge();
                entity.position.set(xPos, 0, zPos - Math.random() * 10 - 5);
            }
          obstaclesRef.current.push(entity);
        }
        
        sceneRef.current?.add(entity);
      }
    }

    // Scenery building only on ground level sides
    if (Math.random() > 0.1) {
      const h = 20 + Math.random() * 30;
      const bLeft = createBuilding(h);
      bLeft.position.set(-22, h/2, zPos - 10);
      sceneRef.current?.add(bLeft);
      sceneryRef.current.push(bLeft);
    }
  };

  const startLoop = () => {
    const loop = () => {
      frameIdRef.current = requestAnimationFrame(loop);
      
      const player = playerRef.current;
      if (!player || !cameraRef.current) return;

      if (gameActiveRef.current) {
        if(speedRef.current < MAX_SPEED) speedRef.current += 0.00005;

        // Move Player Z
        player.position.z -= speedRef.current;
        
        // Lane Logic
        const targetX = (playerLaneRef.current - 1) * LANE_WIDTH;
        currentLaneXRef.current += (targetX - currentLaneXRef.current) * LANE_CHANGE_SPEED;
        player.position.x = currentLaneXRef.current;
        player.rotation.z = (targetX - currentLaneXRef.current) * 0.1;
        player.rotation.x = 0;

        // Jump Physics
        if (isJumpingRef.current) {
          playerJumpYRef.current += playerVelocityYRef.current;
          playerVelocityYRef.current -= GRAVITY;
          
          if (playerJumpYRef.current <= 0) {
            playerJumpYRef.current = 0;
            isJumpingRef.current = false;
            playerVelocityYRef.current = 0;
          }
        }
        
        // Final Y Position (Always relative to 0 ground)
        player.position.y = playerJumpYRef.current;

        // Sliding Animation
        const bodyGroup = player.children[0];
        if (isSlidingRef.current) {
            slideTimerRef.current--;
            if (bodyGroup) {
                bodyGroup.scale.set(1.2, 0.5, 1.2);
                bodyGroup.position.y = 0.4;
            }
            if (slideTimerRef.current <= 0) {
                isSlidingRef.current = false;
                if (bodyGroup) {
                    bodyGroup.scale.set(1, 1, 1);
                    bodyGroup.position.y = 0;
                }
            }
        }

        // Run Animation
        if (!isJumpingRef.current && !isSlidingRef.current) {
             const time = Date.now() * 0.015;
             if (bodyGroup) {
                 bodyGroup.position.y = Math.abs(Math.sin(time * 1.5)) * 0.15; // Bounce
                 
                 bodyGroup.children.forEach(child => {
                     if (child.name.startsWith('leg')) {
                        const isRight = child.name.includes('R');
                        const isFront = child.name.includes('F');
                        const offset = (isRight ? Math.PI : 0) + (isFront ? 0 : Math.PI/2);
                        child.rotation.x = Math.sin(time + offset) * 0.9;
                     }
                     if (child.name === 'tail') {
                        child.rotation.y = Math.sin(time * 3) * 0.6;
                     }
                 });
             }
        } else if (isJumpingRef.current) {
             if (bodyGroup) {
                 bodyGroup.children.forEach(child => {
                     if (child.name.startsWith('leg')) {
                        child.rotation.x = -0.5; 
                     }
                 });
             }
        }

        // Camera Follow
        const targetCamZ = player.position.z + 12;
        const targetCamY = 5 + player.position.y + (playerJumpYRef.current * 0.4);
        const targetCamX = player.position.x * 0.6;
        
        cameraRef.current.position.x += (targetCamX - cameraRef.current.position.x) * 0.1;
        cameraRef.current.position.y += (targetCamY - cameraRef.current.position.y) * 0.1;
        cameraRef.current.position.z += (targetCamZ - cameraRef.current.position.z) * 0.2;
        cameraRef.current.lookAt(player.position.x * 0.3, player.position.y + 1.5, player.position.z - 10);

        // Cleanup
        const cullZ = player.position.z + 20; 
        
        floorChunksRef.current = floorChunksRef.current.filter(chunk => {
            if (chunk.mesh.children[0].position.z > cullZ) { // Rough check
                sceneRef.current?.remove(chunk.mesh);
                return false;
            }
            return true;
        });

        // Spawning Logic
        const nextSpawnZ = Math.floor(player.position.z / CHUNK_LENGTH) * CHUNK_LENGTH - 120;
        if (lastSpawnZRef.current > nextSpawnZ) {
             const z = lastSpawnZRef.current - CHUNK_LENGTH;
             spawnFloorChunk(z);
             spawnObstacles(z);
             lastSpawnZRef.current = z;
        }

        // Collision Logic
        const playerBox = new THREE.Box3().setFromObject(player);
        // Shrink hitbox slightly
        playerBox.min.x += 0.3; playerBox.max.x -= 0.3;
        playerBox.min.z += 0.4; playerBox.max.z -= 0.4;
        playerBox.min.y += 0.2; playerBox.max.y -= 0.2;

        coinsRef.current = coinsRef.current.filter(c => {
            c.rotation.y += 0.05;
            const glow = c.getObjectByName('glow');
            if (glow) {
               glow.scale.setScalar(1 + Math.sin(Date.now() * 0.01) * 0.2);
               glow.lookAt(cameraRef.current!.position);
            }
            
            const box = new THREE.Box3().setFromObject(c);
            if (box.intersectsBox(playerBox)) {
                scoreRef.current += 10;
                onScoreUpdate(scoreRef.current);
                sceneRef.current?.remove(c);
                audioManager.playCoin();
                return false;
            }
            if (c.position.z > cullZ) {
                sceneRef.current?.remove(c);
                return false;
            }
            return true;
        });

        obstaclesRef.current.forEach(o => {
            const box = new THREE.Box3().setFromObject(o);
            box.min.x += 0.2; box.max.x -= 0.2;
            box.min.z += 0.2; box.max.z -= 0.2;
            
            if (box.intersectsBox(playerBox)) {
                const type = o.userData.type;
                let hit = true;
                
                // Height check relative to object position
                // Calculate local player height relative to object base
                const relativePlayerY = player.position.y - o.position.y;

                if (type === EntityType.OBSTACLE_LOW) {
                    if (relativePlayerY > 1.2) hit = false;
                }
                if (type === EntityType.OBSTACLE_HIGH) {
                    if (isSlidingRef.current && relativePlayerY < 1.0) hit = false;
                }
                
                if (hit) {
                    audioManager.playCrash();
                    audioManager.playWhine(); // Plays dog whine
                    onGameOver(scoreRef.current);
                    gameActiveRef.current = false;
                }
            }
        });
        
        obstaclesRef.current = obstaclesRef.current.filter(o => o.position.z <= cullZ ? true : (sceneRef.current?.remove(o), false));
        sceneryRef.current = sceneryRef.current.filter(o => o.position.z <= cullZ ? true : (sceneRef.current?.remove(o), false));

      } else {
         // Menu rotation
         if (player) {
             const time = Date.now() * 0.002;
             player.rotation.y = Math.PI + Math.sin(time) * 0.2;
             player.children[0].children.forEach(child => {
                 if (child.name === 'tail') child.rotation.y = Math.sin(time * 5) * 0.5;
             });
         }
      }

      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
    };
    loop();
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-sky-300" />
  );
};

export default GameCanvas;
