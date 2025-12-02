
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
const GRAVITY = 0.025;
const JUMP_FORCE = 0.6;
const LANE_CHANGE_SPEED = 0.2;
const FOG_COLOR = 0x87CEEB; 
const RENDER_DISTANCE = 180;

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
  const isJumpingRef = useRef(false);
  const isSlidingRef = useRef(false);
  const slideTimerRef = useRef(0);
  const gameActiveRef = useRef(false);
  const lastSpawnZRef = useRef(-60);
  
  // Objects Storage
  const obstaclesRef = useRef<THREE.Group[]>([]);
  const coinsRef = useRef<THREE.Group[]>([]);
  const sceneryRef = useRef<THREE.Group[]>([]);
  const floorChunksRef = useRef<THREE.Group[]>([]);

  // --- 3D Builder Functions ---

  const materials = {
    furDark: new THREE.MeshLambertMaterial({ color: 0x6F4F28 }), // Brown
    furLight: new THREE.MeshLambertMaterial({ color: 0xEECFA1 }), // Tan
    uniformBlue: new THREE.MeshLambertMaterial({ color: 0x0033CC }), // Deep Blue
    uniformTrim: new THREE.MeshLambertMaterial({ color: 0xFFD700 }), // Gold
    black: new THREE.MeshLambertMaterial({ color: 0x111111 }),
    white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    glass: new THREE.MeshPhongMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, shininess: 100 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.2, metalness: 0.8 }),
    road: new THREE.MeshLambertMaterial({ color: 0x333333 }),
    sidewalk: new THREE.MeshLambertMaterial({ color: 0x999999 }),
    grass: new THREE.MeshLambertMaterial({ color: 0x4ade80 }),
    treeTrunk: new THREE.MeshLambertMaterial({ color: 0x5D4037 }),
    treeLeaves: new THREE.MeshLambertMaterial({ color: 0x228B22 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.4 }),
    red: new THREE.MeshLambertMaterial({ color: 0xcc0000 }),
  };

  const createChase = (): THREE.Group => {
    const chaseGroup = new THREE.Group();
    const bodyGroup = new THREE.Group(); 
    chaseGroup.add(bodyGroup);

    // --- Body ---
    const torsoGeo = new THREE.BoxGeometry(0.8, 0.8, 1.3);
    const torso = new THREE.Mesh(torsoGeo, materials.uniformBlue);
    torso.position.y = 1.0;
    torso.castShadow = true;
    bodyGroup.add(torso);

    // Vest Detail
    const vestGeo = new THREE.BoxGeometry(0.85, 0.5, 0.5);
    const vest = new THREE.Mesh(vestGeo, materials.uniformTrim);
    vest.position.set(0, 1.0, 0.5);
    bodyGroup.add(vest);

    // Collar
    const collarGeo = new THREE.BoxGeometry(0.6, 0.1, 0.6);
    const collar = new THREE.Mesh(collarGeo, materials.black);
    collar.position.set(0, 1.45, 0.5);
    bodyGroup.add(collar);
    
    // Tag / Badge
    const tagGeo = new THREE.DodecahedronGeometry(0.15);
    const tag = new THREE.Mesh(tagGeo, materials.uniformBlue);
    tag.scale.z = 0.5;
    tag.position.set(0, 1.35, 0.76);
    bodyGroup.add(tag);

    // --- Head ---
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.7, 0.6);
    bodyGroup.add(headGroup);

    const headGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const head = new THREE.Mesh(headGeo, materials.furDark);
    headGroup.add(head);

    // Snout
    const snoutGeo = new THREE.BoxGeometry(0.4, 0.35, 0.4);
    const snout = new THREE.Mesh(snoutGeo, materials.furLight);
    snout.position.set(0, -0.15, 0.45);
    headGroup.add(snout);

    const noseGeo = new THREE.BoxGeometry(0.15, 0.1, 0.1);
    const nose = new THREE.Mesh(noseGeo, materials.black);
    nose.position.set(0, -0.05, 0.65);
    headGroup.add(nose);

    // Eyes
    const eyeWhiteGeo = new THREE.PlaneGeometry(0.2, 0.2);
    const pupilGeo = new THREE.PlaneGeometry(0.1, 0.1);
    
    const eyeL = new THREE.Mesh(eyeWhiteGeo, materials.white);
    eyeL.position.set(-0.18, 0.1, 0.36);
    eyeL.rotation.y = -0.1;
    headGroup.add(eyeL);
    const pupilL = new THREE.Mesh(pupilGeo, materials.furDark);
    pupilL.position.z = 0.01;
    eyeL.add(pupilL);

    const eyeR = new THREE.Mesh(eyeWhiteGeo, materials.white);
    eyeR.position.set(0.18, 0.1, 0.36);
    eyeR.rotation.y = 0.1;
    headGroup.add(eyeR);
    const pupilR = new THREE.Mesh(pupilGeo, materials.furDark);
    pupilR.position.z = 0.01;
    eyeR.add(pupilR);

    // Ears
    const earGeo = new THREE.ConeGeometry(0.15, 0.4, 4);
    const earL = new THREE.Mesh(earGeo, materials.furDark);
    earL.position.set(-0.25, 0.5, 0);
    earL.rotation.z = 0.3;
    earL.rotation.y = -0.3;
    headGroup.add(earL);
    
    const earR = new THREE.Mesh(earGeo, materials.furDark);
    earR.position.set(0.25, 0.5, 0);
    earR.rotation.z = -0.3;
    earR.rotation.y = 0.3;
    headGroup.add(earR);

    // Police Cap
    const hatBaseGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.2, 12);
    const hatBase = new THREE.Mesh(hatBaseGeo, materials.uniformBlue);
    hatBase.position.set(0, 0.4, 0);
    headGroup.add(hatBase);

    const visorGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.05, 12, 1, false, 0, Math.PI);
    const visor = new THREE.Mesh(visorGeo, materials.black);
    visor.rotation.x = 0.2;
    visor.position.set(0, 0.35, 0.2);
    headGroup.add(visor);

    // --- Backpack (Pup Pack) ---
    const packGeo = new THREE.BoxGeometry(0.7, 0.6, 0.5);
    const pack = new THREE.Mesh(packGeo, materials.uniformBlue);
    pack.position.set(0, 1.2, -0.7);
    bodyGroup.add(pack);

    // Gadgets on pack
    const gadgetGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.3);
    const gadgetL = new THREE.Mesh(gadgetGeo, materials.metal);
    gadgetL.rotation.x = Math.PI / 2;
    gadgetL.position.set(-0.25, 0.3, 0.1);
    pack.add(gadgetL);
    
    const gadgetR = new THREE.Mesh(gadgetGeo, materials.metal);
    gadgetR.rotation.x = Math.PI / 2;
    gadgetR.position.set(0.25, 0.3, 0.1);
    pack.add(gadgetR);

    // --- Legs ---
    const legGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.6);
    const positions = [
      { x: -0.25, z: 0.45, name: 'legFL' },
      { x: 0.25, z: 0.45, name: 'legFR' },
      { x: -0.25, z: -0.45, name: 'legBL' },
      { x: 0.25, z: -0.45, name: 'legBR' }
    ];

    positions.forEach(pos => {
      const legGroup = new THREE.Group();
      legGroup.position.set(pos.x, 0.6, pos.z);
      legGroup.name = pos.name;

      const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.2), materials.furDark);
      thigh.position.y = 0.1;
      legGroup.add(thigh);

      const leg = new THREE.Mesh(legGeo, materials.furLight);
      leg.position.y = -0.2;
      legGroup.add(leg);

      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.25), materials.furLight);
      paw.position.set(0, -0.5, 0.05);
      legGroup.add(paw);

      bodyGroup.add(legGroup);
    });

    // Tail
    const tailGeo = new THREE.CylinderGeometry(0.06, 0.02, 0.5);
    const tail = new THREE.Mesh(tailGeo, materials.furDark);
    tail.rotation.x = 2.0;
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.9, -0.6);
    tailGroup.add(tail);
    tailGroup.name = 'tail';
    bodyGroup.add(tailGroup);

    return chaseGroup;
  };

  const createBone = (): THREE.Group => {
    const group = new THREE.Group();
    const boneMat = new THREE.MeshPhongMaterial({ color: 0xFFD700, shininess: 100, specular: 0xffffff }); // Gold

    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), boneMat);
    stick.rotation.z = Math.PI / 2;
    
    const bulbGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const leftBulb = new THREE.Mesh(bulbGeo, boneMat);
    leftBulb.position.x = -0.4;
    const rightBulb = new THREE.Mesh(bulbGeo, boneMat);
    rightBulb.position.x = 0.4;

    group.add(stick, leftBulb, rightBulb);

    // Glow Halo
    const glowGeo = new THREE.RingGeometry(0.6, 0.8, 16);
    const glow = new THREE.Mesh(glowGeo, materials.glow);
    glow.name = 'glow';
    group.add(glow);

    group.userData = { type: EntityType.COIN };
    return group;
  };

  const createCar = (color: number): THREE.Group => {
    const group = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.BoxGeometry(2.4, 1.0, 4.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(2.0, 0.7, 2.5);
    const cabin = new THREE.Mesh(cabinGeo, materials.white); // Represents windows roughly
    cabin.position.set(0, 1.5, -0.2);
    group.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    
    [
      {x: -1.2, z: 1.5}, {x: 1.2, z: 1.5},
      {x: -1.2, z: -1.5}, {x: 1.2, z: -1.5}
    ].forEach(pos => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(pos.x, 0.4, pos.z);
      group.add(w);
    });

    // Lights
    const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
    const headLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({color: 0xffffcc}));
    headLight.position.set(-0.8, 0.9, 2.26);
    group.add(headLight.clone());
    headLight.position.x = 0.8;
    group.add(headLight);

    const tailLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({color: 0xff0000}));
    tailLight.position.set(-0.8, 0.9, -2.26);
    group.add(tailLight.clone());
    tailLight.position.x = 0.8;
    group.add(tailLight);

    // Police Siren if blue
    if (color === 0x0033CC) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.3), materials.metal);
      bar.position.set(0, 1.9, 0);
      group.add(bar);
      const sirenL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), new THREE.MeshBasicMaterial({color: 0xff0000}));
      sirenL.position.set(-0.4, 2.0, 0);
      group.add(sirenL);
      const sirenR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), new THREE.MeshBasicMaterial({color: 0x0000ff}));
      sirenR.position.set(0.4, 2.0, 0);
      group.add(sirenR);
    }

    group.userData = { type: EntityType.OBSTACLE_LOW, height: 2.0 };
    return group;
  };

  const createBus = (): THREE.Group => {
    const group = new THREE.Group();
    // School Bus Yellow
    const color = 0xFFCC00;
    const busMat = new THREE.MeshLambertMaterial({ color });

    const bodyGeo = new THREE.BoxGeometry(2.8, 2.8, 7);
    const body = new THREE.Mesh(bodyGeo, busMat);
    body.position.y = 2.0;
    body.castShadow = true;
    group.add(body);

    // Windows strip
    const winGeo = new THREE.BoxGeometry(2.85, 0.8, 6);
    const win = new THREE.Mesh(winGeo, materials.black);
    win.position.set(0, 2.5, 0);
    group.add(win);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    
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
    const group = new THREE.Group();
    // Pedestrian Bridge
    const pillarGeo = new THREE.CylinderGeometry(0.4, 0.4, 5);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    
    const p1 = new THREE.Mesh(pillarGeo, pillarMat);
    p1.position.set(-2, 2.5, 0);
    const p2 = new THREE.Mesh(pillarGeo, pillarMat);
    p2.position.set(2, 2.5, 0);
    
    const deckGeo = new THREE.BoxGeometry(6, 0.5, 2);
    const deck = new THREE.Mesh(deckGeo, new THREE.MeshLambertMaterial({color: 0x777777}));
    deck.position.set(0, 4.5, 0);
    
    // Railing
    const railGeo = new THREE.BoxGeometry(6, 0.8, 0.1);
    const railMat = new THREE.MeshLambertMaterial({color: 0x990000}); // Red railing
    const r1 = new THREE.Mesh(railGeo, railMat);
    r1.position.set(0, 5.2, 0.9);
    const r2 = new THREE.Mesh(railGeo, railMat);
    r2.position.set(0, 5.2, -0.9);

    group.add(p1, p2, deck, r1, r2);
    group.userData = { type: EntityType.OBSTACLE_HIGH, height: 5.0 };
    return group;
  };

  const createTree = (): THREE.Group => {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.5, 6);
    const trunk = new THREE.Mesh(trunkGeo, materials.treeTrunk);
    trunk.position.y = 0.75;
    
    const leavesGeo = new THREE.ConeGeometry(1.5, 3.5, 8);
    const leaves = new THREE.Mesh(leavesGeo, materials.treeLeaves);
    leaves.position.y = 2.5;
    
    group.add(trunk, leaves);
    return group;
  };

  const createHydrant = (): THREE.Group => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.8), materials.red);
    body.position.y = 0.4;
    
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25), materials.red);
    cap.position.y = 0.8;
    
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6), materials.metal);
    side.rotation.z = Math.PI / 2;
    side.position.y = 0.6;
    
    group.add(body, cap, side);
    return group;
  };

  const createLamp = (): THREE.Group => {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6), materials.metal);
    pole.position.y = 3;
    
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), materials.metal);
    arm.position.set(0.5, 5.8, 0);
    
    const bulbBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), materials.metal);
    bulbBox.position.set(1.2, 5.7, 0);
    
    const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({color: 0xffffaa}));
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(1.2, 5.6, 0);
    
    group.add(pole, arm, bulbBox, bulb);
    return group;
  };

  const createBuilding = (height: number): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(12, height, 12);
    
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Base color
        const hues = ['#e2e8f0', '#cbd5e1', '#f1f5f9', '#bfdbfe'];
        ctx.fillStyle = hues[Math.floor(Math.random() * hues.length)];
        ctx.fillRect(0,0,128,256);
        
        // Windows
        ctx.fillStyle = '#1e293b'; // Frame
        for(let y=20; y<240; y+=30) {
            for(let x=10; x<110; x+=25) {
                ctx.fillRect(x, y, 15, 20);
                if (Math.random() > 0.4) {
                    ctx.fillStyle = '#fef08a'; // Lit
                    ctx.fillRect(x+2, y+2, 11, 16);
                    ctx.fillStyle = '#1e293b';
                } else {
                    ctx.fillStyle = '#334155'; // Dark
                    ctx.fillRect(x+2, y+2, 11, 16);
                    ctx.fillStyle = '#1e293b';
                }
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    const mat = new THREE.MeshLambertMaterial({ map: texture });
    return new THREE.Mesh(geo, mat);
  };

  // --- Initialization ---

  useEffect(() => {
    if (!containerRef.current) return;

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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(30, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    // Optimize shadow cam
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -20;
    scene.add(dirLight);

    // Player
    const player = createChase();
    playerRef.current = player;
    scene.add(player);

    // Initial Ground
    for(let i=0; i<8; i++) {
        spawnFloorChunk(-i * 20);
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
    isJumpingRef.current = false;
    isSlidingRef.current = false;
    
    if (sceneRef.current) {
      obstaclesRef.current.forEach(o => sceneRef.current?.remove(o));
      coinsRef.current.forEach(c => sceneRef.current?.remove(c));
      sceneryRef.current.forEach(s => sceneRef.current?.remove(s));
      floorChunksRef.current.forEach(f => sceneRef.current?.remove(f));
      
      obstaclesRef.current = [];
      coinsRef.current = [];
      sceneryRef.current = [];
      floorChunksRef.current = [];
      
      for(let i=0; i<8; i++) {
        spawnFloorChunk(-i * 20);
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
    
    const chunkGroup = new THREE.Group();

    // Road
    const roadGeo = new THREE.PlaneGeometry(14, 20);
    const road = new THREE.Mesh(roadGeo, materials.road);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, zPos - 10);
    road.receiveShadow = true;
    chunkGroup.add(road);

    // Sidewalks
    const walkGeo = new THREE.BoxGeometry(6, 0.4, 20);
    
    const leftWalk = new THREE.Mesh(walkGeo, materials.sidewalk);
    leftWalk.position.set(-10, 0.2, zPos - 10);
    leftWalk.receiveShadow = true;
    chunkGroup.add(leftWalk);

    const rightWalk = new THREE.Mesh(walkGeo, materials.sidewalk);
    rightWalk.position.set(10, 0.2, zPos - 10);
    rightWalk.receiveShadow = true;
    chunkGroup.add(rightWalk);
    
    // Grass
    const grassGeo = new THREE.BoxGeometry(40, 0.1, 20);
    const grassL = new THREE.Mesh(grassGeo, materials.grass);
    grassL.position.set(-33, 0, zPos - 10);
    chunkGroup.add(grassL);
    
    const grassR = new THREE.Mesh(grassGeo, materials.grass);
    grassR.position.set(33, 0, zPos - 10);
    chunkGroup.add(grassR);

    // Lane Markings
    const lineGeo = new THREE.PlaneGeometry(0.25, 3);
    [-2, 2].forEach(x => {
      for(let i=0; i<4; i++) {
        const line = new THREE.Mesh(lineGeo, materials.white);
        line.rotation.x = -Math.PI / 2;
        line.position.set(x, 0.02, zPos - 2.5 - (i * 5));
        chunkGroup.add(line);
      }
    });

    // Decorations on sidewalk (Trees, Hydrants, Lamps)
    [-10, 10].forEach(sideX => {
        // Trees
        if (Math.random() > 0.5) {
            const tree = createTree();
            tree.position.set(sideX + (Math.random()*2 - 1), 0, zPos - Math.random() * 20);
            tree.scale.setScalar(0.8 + Math.random() * 0.4);
            chunkGroup.add(tree);
        }
        // Hydrants or Lamps
        if (Math.random() > 0.8) {
            const prop = Math.random() > 0.5 ? createHydrant() : createLamp();
            const offset = sideX < 0 ? 2 : -2; // Close to curb
            prop.position.set(sideX + offset, 0.2, zPos - Math.random() * 20);
            if (prop.children[0].geometry.type === 'CylinderGeometry') {
                 // Rotate lamp towards road
                 prop.rotation.y = sideX < 0 ? Math.PI/2 : -Math.PI/2;
            }
            chunkGroup.add(prop);
        }
    });

    sceneRef.current.add(chunkGroup);
    floorChunksRef.current.push(chunkGroup);
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
          // Coin
          entity = createBone();
          entity.position.set(xPos, 1.2, zPos);
          coinsRef.current.push(entity);
        } else if (typeRoll < 0.6) {
          // Low Obstacle (Car)
          const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xffffff, 0x111111];
          const carColor = colors[Math.floor(Math.random() * colors.length)];
          entity = createCar(carColor);
          entity.position.set(xPos, 0, zPos);
          // Face player or away? Let's face player to look dangerous
          entity.rotation.y = 0; 
          obstaclesRef.current.push(entity);
        } else {
          // High Obstacle (Bus or Bridge)
          if (Math.random() > 0.5) {
              entity = createBus();
              entity.position.set(xPos, 0, zPos);
          } else {
              entity = createBridge();
              entity.position.set(xPos, 0, zPos);
          }
          obstaclesRef.current.push(entity);
        }
        
        sceneRef.current?.add(entity);
      }
    }

    // Scenery (Buildings)
    if (Math.random() > 0.1) {
      const h = 20 + Math.random() * 30;
      const bLeft = createBuilding(h);
      bLeft.position.set(-22, h/2, zPos - 10);
      sceneRef.current?.add(bLeft);
      sceneryRef.current.push(bLeft);
    }
    if (Math.random() > 0.1) {
      const h = 20 + Math.random() * 30;
      const bRight = createBuilding(h);
      bRight.position.set(22, h/2, zPos - 10);
      sceneRef.current?.add(bRight);
      sceneryRef.current.push(bRight);
    }
  };

  const startLoop = () => {
    const loop = () => {
      frameIdRef.current = requestAnimationFrame(loop);
      
      const player = playerRef.current;
      if (!player || !cameraRef.current) return;

      if (gameActiveRef.current) {
        if(speedRef.current < MAX_SPEED) speedRef.current += 0.00005;

        // Move Player Global Z
        player.position.z -= speedRef.current;
        
        // Lateral Movement
        const targetX = (playerLaneRef.current - 1) * LANE_WIDTH;
        currentLaneXRef.current += (targetX - currentLaneXRef.current) * LANE_CHANGE_SPEED;
        player.position.x = currentLaneXRef.current;
        player.rotation.z = (targetX - currentLaneXRef.current) * 0.1; // Bank turn

        // Jump Logic
        if (isJumpingRef.current) {
          player.position.y += playerVelocityYRef.current;
          playerVelocityYRef.current -= GRAVITY;
          
          if (player.position.y <= 0) {
            player.position.y = 0;
            isJumpingRef.current = false;
            playerVelocityYRef.current = 0;
          }
        }

        // Slide Logic
        const bodyGroup = player.children[0];
        if (isSlidingRef.current) {
            slideTimerRef.current--;
            if (bodyGroup) {
                // Flatten and lower chase
                bodyGroup.scale.set(1.2, 0.4, 1.2);
                bodyGroup.position.y = 0.3; 
            }
            if (slideTimerRef.current <= 0) {
                isSlidingRef.current = false;
                if (bodyGroup) {
                    bodyGroup.scale.set(1, 1, 1);
                    bodyGroup.position.y = 0;
                }
            }
        }

        // Animation
        if (!isJumpingRef.current && !isSlidingRef.current) {
             const time = Date.now() * 0.015;
             if (bodyGroup) {
                 // Run Cycle Bobbing
                 bodyGroup.position.y = Math.abs(Math.sin(time * 1.5)) * 0.15;
                 
                 bodyGroup.children.forEach(child => {
                     if (child.name.startsWith('leg')) {
                        const isRight = child.name.includes('R');
                        const isFront = child.name.includes('F');
                        // Antiphase legs
                        const offset = (isRight ? Math.PI : 0) + (isFront ? 0 : Math.PI/2);
                        child.rotation.x = Math.sin(time + offset) * 0.9;
                     }
                     if (child.name === 'tail') {
                        child.rotation.y = Math.sin(time * 3) * 0.6;
                     }
                 });
             }
        }

        // Camera Follow
        const targetCamZ = player.position.z + 12;
        const targetCamY = 5 + (player.position.y * 0.4);
        const targetCamX = player.position.x * 0.6;
        
        cameraRef.current.position.x += (targetCamX - cameraRef.current.position.x) * 0.1;
        cameraRef.current.position.y += (targetCamY - cameraRef.current.position.y) * 0.1;
        cameraRef.current.position.z += (targetCamZ - cameraRef.current.position.z) * 0.2;
        cameraRef.current.lookAt(player.position.x * 0.3, 1.5, player.position.z - 10);

        // --- Generation Management ---
        const cullZ = player.position.z + 20; 
        
        // Floor Recycle
        floorChunksRef.current = floorChunksRef.current.filter(mesh => {
            if (mesh.children[0].position.z > cullZ) { // Approximate check
                sceneRef.current?.remove(mesh);
                return false;
            }
            return true;
        });

        // Spawn New Chunks
        const nextSpawnZ = Math.floor(player.position.z / 20) * 20 - 120;
        if (lastSpawnZRef.current > nextSpawnZ) {
             const z = lastSpawnZRef.current - 20;
             spawnFloorChunk(z);
             spawnObstacles(z);
             lastSpawnZRef.current = z;
        }

        // --- Collision & Interaction ---
        const playerBox = new THREE.Box3().setFromObject(player);
        // Shrink hitbox slightly to be forgiving
        playerBox.min.x += 0.3; playerBox.max.x -= 0.3;
        playerBox.min.z += 0.4; playerBox.max.z -= 0.4;
        playerBox.min.y += 0.2; // Don't hit floor

        // Coins
        coinsRef.current = coinsRef.current.filter(c => {
            c.rotation.y += 0.05;
            // Pulse glow
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

        // Obstacles
        obstaclesRef.current.forEach(o => {
            const box = new THREE.Box3().setFromObject(o);
            // Tighter bounds for obstacles
            box.min.x += 0.2; box.max.x -= 0.2;
            
            if (box.intersectsBox(playerBox)) {
                const type = o.userData.type;
                let hit = true;
                
                // Logic:
                // Low obstacle (Car): Must jump (y > 1.5 roughly)
                // High obstacle (Bridge/Bus): Must slide (player y is low)
                
                if (type === EntityType.OBSTACLE_LOW) {
                    if (isJumpingRef.current && player.position.y > 1.2) hit = false;
                }
                
                if (type === EntityType.OBSTACLE_HIGH) {
                    if (isSlidingRef.current) hit = false;
                }
                
                if (hit) {
                    audioManager.playCrash();
                    onGameOver(scoreRef.current);
                    gameActiveRef.current = false;
                }
            }
        });
        
        // Cleanup Objects
        obstaclesRef.current = obstaclesRef.current.filter(o => o.position.z <= cullZ ? true : (sceneRef.current?.remove(o), false));
        sceneryRef.current = sceneryRef.current.filter(o => o.position.z <= cullZ ? true : (sceneRef.current?.remove(o), false));

      } else {
         // Menu Idle Animation
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
