import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GameState, Lane, EntityType } from '../types';

interface GameCanvasProps {
  gameState: GameState;
  onGameOver: (score: number) => void;
  onScoreUpdate: (score: number) => void;
}

// --- Configuration ---
const LANE_WIDTH = 4;
const PLAYER_SPEED_BASE = 0.4;
const GRAVITY = 0.04;
const JUMP_FORCE = 0.8;
const LANE_CHANGE_SPEED = 0.3;
const FOG_COLOR = 0x87CEEB; // Sky blue
const GROUND_COLOR = 0x333333;

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onGameOver, onScoreUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game Refs to maintain state without re-rendering component
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const playerRef = useRef<THREE.Group | null>(null);
  const playerBodyRef = useRef<THREE.Group | null>(null); // Inner group for animations
  
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
  const lastSpawnZRef = useRef(-180);
  
  // Objects Storage
  const obstaclesRef = useRef<THREE.Group[]>([]);
  const coinsRef = useRef<THREE.Group[]>([]);
  const sceneryRef = useRef<THREE.Group[]>([]);
  const floorChunksRef = useRef<THREE.Mesh[]>([]);

  // --- 3D Helper Functions ---

  const createMaterial = (color: number) => {
    return new THREE.MeshLambertMaterial({ color });
  };

  // Build Chase (Procedural Character)
  const createChase = (): THREE.Group => {
    const chaseGroup = new THREE.Group();
    const bodyGroup = new THREE.Group();
    chaseGroup.add(bodyGroup);

    // Materials
    const furMat = createMaterial(0x8B4513); // SaddleBrown
    const uniformMat = createMaterial(0x1e3a8a); // Blue Police
    const skinMat = createMaterial(0xF4A460); // SandyBrown
    const yellowMat = createMaterial(0xFFD700);
    const blackMat = createMaterial(0x111111);

    // Body (Uniform)
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1.6);
    const body = new THREE.Mesh(bodyGeo, uniformMat);
    body.position.y = 1.5;
    body.castShadow = true;
    bodyGroup.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.9, 0.9, 1);
    const head = new THREE.Mesh(headGeo, furMat);
    head.position.set(0, 2.4, 0.5);
    head.castShadow = true;
    bodyGroup.add(head);

    // Snout
    const snoutGeo = new THREE.BoxGeometry(0.5, 0.4, 0.4);
    const snout = new THREE.Mesh(snoutGeo, skinMat);
    snout.position.set(0, 2.2, 1.1);
    bodyGroup.add(snout);

    // Hat
    const hatGeo = new THREE.BoxGeometry(1, 0.3, 1.1);
    const hat = new THREE.Mesh(hatGeo, createMaterial(0x172554)); // Darker blue
    hat.position.set(0, 2.9, 0.5);
    bodyGroup.add(hat);
    
    // Hat Visor
    const visorGeo = new THREE.BoxGeometry(0.9, 0.1, 0.4);
    const visor = new THREE.Mesh(visorGeo, blackMat);
    visor.position.set(0, 2.8, 1.1);
    bodyGroup.add(visor);

    // Ears
    const earGeo = new THREE.ConeGeometry(0.15, 0.5, 4);
    const earL = new THREE.Mesh(earGeo, furMat);
    earL.position.set(-0.35, 3.1, 0.5);
    earL.rotation.x = -0.2;
    earL.rotation.z = 0.2;
    bodyGroup.add(earL);
    
    const earR = new THREE.Mesh(earGeo, furMat);
    earR.position.set(0.35, 3.1, 0.5);
    earR.rotation.x = -0.2;
    earR.rotation.z = -0.2;
    bodyGroup.add(earR);

    // Backpack
    const packGeo = new THREE.BoxGeometry(0.8, 0.8, 0.5);
    const pack = new THREE.Mesh(packGeo, createMaterial(0x1e40af));
    pack.position.set(0, 1.8, -1);
    bodyGroup.add(pack);

    // Legs (4 legs)
    const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 1);
    const legPositions = [
      { x: -0.3, z: 0.5, name: 'legFL' },
      { x: 0.3, z: 0.5, name: 'legFR' },
      { x: -0.3, z: -0.5, name: 'legBL' },
      { x: 0.3, z: -0.5, name: 'legBR' }
    ];

    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, furMat);
      leg.position.set(pos.x, 0.5, pos.z);
      leg.name = pos.name;
      // Offset pivot point to top of leg for swinging
      leg.geometry.translate(0, -0.5, 0); 
      leg.position.y += 0.5; 
      bodyGroup.add(leg);
    });

    // Tail
    const tailGeo = new THREE.CylinderGeometry(0.05, 0.1, 0.6);
    const tail = new THREE.Mesh(tailGeo, furMat);
    tail.position.set(0, 1.6, -0.9);
    tail.rotation.x = 2; // Stick out back
    bodyGroup.add(tail);

    return chaseGroup;
  };

  const createCoin = (): THREE.Group => {
    const group = new THREE.Group();
    const boneColor = 0xFFFACD; // LemonChiffon

    // Bone shape: Cylinder + 2 Spheres at ends
    const stickGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
    stickGeo.rotateZ(Math.PI / 2);
    const stick = new THREE.Mesh(stickGeo, new THREE.MeshPhongMaterial({ color: boneColor, shininess: 50 }));
    
    const bulbGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const leftBulb = new THREE.Mesh(bulbGeo, new THREE.MeshPhongMaterial({ color: boneColor }));
    leftBulb.position.x = -0.5;
    
    const rightBulb = new THREE.Mesh(bulbGeo, new THREE.MeshPhongMaterial({ color: boneColor }));
    rightBulb.position.x = 0.5;

    group.add(stick);
    group.add(leftBulb);
    group.add(rightBulb);
    
    // Float anim container
    group.userData = { type: EntityType.COIN, rotateSpeed: 0.05 };
    return group;
  };

  const createObstacleLow = (): THREE.Group => {
    const group = new THREE.Group();
    // Traffic Barrier
    const barGeo = new THREE.BoxGeometry(3, 0.8, 0.3);
    
    // Create striped texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ef4444'; // Red
      ctx.fillRect(0,0,64,64);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(30, 0); ctx.lineTo(0, 30); ctx.lineTo(0, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(42, 0); ctx.lineTo(62, 0); ctx.lineTo(0, 62); ctx.lineTo(0, 42);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(64, 10); ctx.lineTo(64, 30); ctx.lineTo(30, 64); ctx.lineTo(10, 64);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    const barMat = new THREE.MeshLambertMaterial({ map: texture });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 0.4;
    bar.castShadow = true;
    
    const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.6);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-1.2, 0.25, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(1.2, 0.25, 0);

    group.add(bar, legL, legR);
    group.userData = { type: EntityType.OBSTACLE_LOW, height: 1.0 }; // Jump over
    return group;
  };

  const createObstacleHigh = (): THREE.Group => {
    const group = new THREE.Group();
    // High beam or Sign
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    
    const poleL = new THREE.Mesh(poleGeo, poleMat);
    poleL.position.set(-1.2, 2, 0);
    const poleR = new THREE.Mesh(poleGeo, poleMat);
    poleR.position.set(1.2, 2, 0);
    
    const signGeo = new THREE.BoxGeometry(3, 1.2, 0.2);
    const signMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 }); // Yellow
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 3, 0);
    
    // Warning symbol
    const symbolGeo = new THREE.BoxGeometry(1.5, 0.2, 0.25);
    const symbol = new THREE.Mesh(symbolGeo, new THREE.MeshLambertMaterial({ color: 0x000000 }));
    symbol.position.set(0, 3, 0);
    symbol.rotation.z = Math.PI / 4;
    const symbol2 = symbol.clone();
    symbol2.rotation.z = -Math.PI / 4;

    group.add(poleL, poleR, sign, symbol, symbol2);
    group.userData = { type: EntityType.OBSTACLE_HIGH, height: 4.0, clearance: 1.5 }; // Slide under
    return group;
  };

  const createBuilding = (height: number): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(8, height, 8);
    const mat = new THREE.MeshLambertMaterial({ color: Math.random() > 0.5 ? 0x94a3b8 : 0x64748b });
    const mesh = new THREE.Mesh(geo, mat);
    
    // Windows logic (simple texture or smaller boxes would be expensive, just styling via geometry later if needed)
    return mesh;
  };

  // --- Initialization ---

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.Fog(FOG_COLOR, 20, 60); // Distance fog
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 6, -8); // Behind and above player (Player runs towards +Z or -Z? Let's make player run towards -Z)
    // Actually, traditionally in ThreeJS, camera looks down -Z. 
    // Let's make Player move towards -Z. 
    // Start Player at 0,0,0.
    camera.lookAt(0, 2, -10);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    scene.add(dirLight);

    // 5. Player
    const player = createChase();
    playerRef.current = player;
    scene.add(player);

    // 6. Ground Initial
    for(let i=0; i<10; i++) {
        spawnFloorChunk(-i * 20); // 20 units long chunks
    }

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
    };
  }, []);

  // --- Game Loop Logic ---

  useEffect(() => {
    gameActiveRef.current = gameState === GameState.PLAYING;
    
    if (gameState === GameState.MENU) {
      // Reset logic
      resetGame();
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
    
    // Clear objects
    if (sceneRef.current) {
      obstaclesRef.current.forEach(o => sceneRef.current?.remove(o));
      coinsRef.current.forEach(c => sceneRef.current?.remove(c));
      sceneryRef.current.forEach(s => sceneRef.current?.remove(s));
      
      // Clear floor chunks and regenerate
      floorChunksRef.current.forEach(f => sceneRef.current?.remove(f));
      floorChunksRef.current = [];
      
      // Regenerate initial floor
      for(let i=0; i<10; i++) {
        spawnFloorChunk(-i * 20);
      }
      lastSpawnZRef.current = -180;
    }
    obstaclesRef.current = [];
    coinsRef.current = [];
    sceneryRef.current = [];

    if (playerRef.current) {
      playerRef.current.position.set(0, 0, 0);
      playerRef.current.rotation.set(0, 0, 0); // Facing -Z implicitly
      // Ensure player is looking towards -Z. Default models are usually +Z or +Y. 
      // My Chase model is built facing +Z (Snout at +Z).
      // So I need to rotate Chase 180 deg to face -Z.
      playerRef.current.rotation.y = Math.PI; 
    }
  };

  const handleInput = (key: string) => {
    if (!gameActiveRef.current) return;

    const k = key.toLowerCase();
    
    if (k === 'a' || k === 'arrowleft') {
      if (playerLaneRef.current > Lane.LEFT) playerLaneRef.current--;
    }
    if (k === 'd' || k === 'arrowright') {
      if (playerLaneRef.current < Lane.RIGHT) playerLaneRef.current++;
    }
    if ((k === 'w' || k === 'arrowup' || k === ' ') && !isJumpingRef.current && !isSlidingRef.current) {
      isJumpingRef.current = true;
      playerVelocityYRef.current = JUMP_FORCE;
    }
    if ((k === 's' || k === 'arrowdown') && !isSlidingRef.current && !isJumpingRef.current) {
      isSlidingRef.current = true;
      slideTimerRef.current = 40; // Frames
    }
  };

  const spawnFloorChunk = (zPos: number) => {
    if (!sceneRef.current) return;
    
    // Road
    const roadGeo = new THREE.PlaneGeometry(14, 20); // Width 14 covers 3 lanes (4 width each + margin)
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, zPos - 10); // Center at zPos-10 (length 20)
    road.receiveShadow = true;
    
    sceneRef.current.add(road);
    floorChunksRef.current.push(road);

    // Sidewalks
    const walkGeo = new THREE.PlaneGeometry(6, 20);
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    
    const leftWalk = new THREE.Mesh(walkGeo, walkMat);
    leftWalk.rotation.x = -Math.PI / 2;
    leftWalk.position.set(-10, 0.05, zPos - 10);
    leftWalk.receiveShadow = true;
    sceneRef.current.add(leftWalk);
    floorChunksRef.current.push(leftWalk);

    const rightWalk = new THREE.Mesh(walkGeo, walkMat);
    rightWalk.rotation.x = -Math.PI / 2;
    rightWalk.position.set(10, 0.05, zPos - 10);
    rightWalk.receiveShadow = true;
    sceneRef.current.add(rightWalk);
    floorChunksRef.current.push(rightWalk);

    // Lane Markings
    const lineGeo = new THREE.PlaneGeometry(0.2, 4);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    [-2, 2].forEach(x => {
      for(let i=0; i<3; i++) {
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(x, 0.02, zPos - 4 - (i * 6));
        sceneRef.current?.add(line);
        floorChunksRef.current.push(line);
      }
    });
  };

  const spawnObstacles = (zPos: number) => {
    if (Math.random() > 0.3) { // 70% chance to spawn something in a row
      // Decide lanes
      const lanes = [Lane.LEFT, Lane.CENTER, Lane.RIGHT];
      // Shuffle
      lanes.sort(() => Math.random() - 0.5);
      
      const count = 1 + Math.floor(Math.random() * 2); // 1 or 2 items
      
      for(let i=0; i<count; i++) {
        const lane = lanes[i];
        const xPos = (lane - 1) * LANE_WIDTH;
        
        const typeRoll = Math.random();
        
        let entity: THREE.Group;
        
        if (typeRoll < 0.4) {
          // Coin
          entity = createCoin();
          entity.userData.type = EntityType.COIN;
          entity.position.set(xPos, 1.5, zPos);
          coinsRef.current.push(entity);
        } else if (typeRoll < 0.7) {
          // Low Barrier
          entity = createObstacleLow();
          entity.position.set(xPos, 0, zPos);
          obstaclesRef.current.push(entity);
        } else {
          // High Barrier
          entity = createObstacleHigh();
          entity.position.set(xPos, 0, zPos);
          obstaclesRef.current.push(entity);
        }
        
        sceneRef.current?.add(entity);
      }
    }

    // Scenery (Buildings)
    if (Math.random() > 0.2) {
      const h = 10 + Math.random() * 20;
      const bLeft = createBuilding(h);
      bLeft.position.set(-16, h/2, zPos);
      sceneRef.current?.add(bLeft);
      sceneryRef.current.push(bLeft);
    }
    if (Math.random() > 0.2) {
      const h = 10 + Math.random() * 20;
      const bRight = createBuilding(h);
      bRight.position.set(16, h/2, zPos);
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
        speedRef.current += 0.0001; // Accel

        // 1. Move Player Forward (Local Z is messy due to rotation, let's use global Z)
        player.position.z -= speedRef.current;
        
        // 2. Lateral Movement (Lerp)
        const targetX = (playerLaneRef.current - 1) * LANE_WIDTH;
        currentLaneXRef.current += (targetX - currentLaneXRef.current) * LANE_CHANGE_SPEED;
        player.position.x = currentLaneXRef.current;

        // 3. Jump Logic
        if (isJumpingRef.current) {
          player.position.y += playerVelocityYRef.current;
          playerVelocityYRef.current -= GRAVITY;
          
          if (player.position.y <= 0) {
            player.position.y = 0;
            isJumpingRef.current = false;
            playerVelocityYRef.current = 0;
          }
        }

        // 4. Slide Logic
        if (isSlidingRef.current) {
            slideTimerRef.current--;
            // Rotate body mesh horizontal
            const bodyGroup = player.children[0];
            if (bodyGroup) {
                // Approximate "sliding" rotation or scale
                bodyGroup.rotation.x = -Math.PI / 4;
                bodyGroup.position.y = -0.5;
            }
            
            if (slideTimerRef.current <= 0) {
                isSlidingRef.current = false;
                // Reset
                if (bodyGroup) {
                    bodyGroup.rotation.x = 0;
                    bodyGroup.position.y = 0;
                }
            }
        }

        // 5. Running Animation (Legs)
        if (!isJumpingRef.current && !isSlidingRef.current) {
             const time = Date.now() * 0.015;
             const bodyGroup = player.children[0]; // The group containing meshes
             if (bodyGroup) {
                 bodyGroup.rotation.z = Math.sin(time) * 0.05; // Slight body sway
                 
                 bodyGroup.children.forEach(child => {
                     if (child.name.startsWith('leg')) {
                         const offset = (child.name === 'legFL' || child.name === 'legBR') ? 0 : Math.PI;
                         child.rotation.x = Math.sin(time + offset) * 0.8;
                     }
                 });
             }
        }

        // 6. Camera Follow
        // Smooth follow
        const targetCamZ = player.position.z + 12;
        const targetCamX = player.position.x * 0.3; // Slight lean
        
        cameraRef.current.position.z = targetCamZ;
        cameraRef.current.position.x += (targetCamX - cameraRef.current.position.x) * 0.1;
        cameraRef.current.lookAt(player.position.x * 0.5, 2, player.position.z - 5);

        // 7. Cleanup & Spawning
        // Remove things behind camera
        const cullZ = player.position.z + 20; 
        
        // Floor
        floorChunksRef.current = floorChunksRef.current.filter(mesh => {
            if (mesh.position.z > cullZ) {
                sceneRef.current?.remove(mesh);
                // Simple geometry dispose not strictly needed for small primitive app but good practice
                return false;
            }
            return true;
        });

        // Spawn new floor
        // Assuming last chunk is the furthest negative Z
        // We actually spawn multiple parts per "chunk", so finding the true last Z is tricky with flat array.
        // Let's just track spawnZ in a ref
        const spawnDist = -120; // Spawn ahead
        const nextSpawnZ = Math.floor(player.position.z / 20) * 20 + spawnDist;
        
        // We use a separate ref to track generated Z
        if (lastSpawnZRef.current > nextSpawnZ) {
             const z = lastSpawnZRef.current - 20;
             spawnFloorChunk(z);
             spawnObstacles(z);
             lastSpawnZRef.current = z;
        }


        // 8. Collision Detection
        const playerBox = new THREE.Box3().setFromObject(player);
        // Shrink box slightly for forgiveness
        playerBox.min.x += 0.5; playerBox.max.x -= 0.5;
        playerBox.min.z += 0.5; playerBox.max.z -= 0.5;

        // Coins
        coinsRef.current = coinsRef.current.filter(c => {
            c.rotation.y += 0.1; // Spin
            
            const box = new THREE.Box3().setFromObject(c);
            if (box.intersectsBox(playerBox)) {
                // Collect
                scoreRef.current += 10;
                onScoreUpdate(scoreRef.current);
                sceneRef.current?.remove(c);
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
            // Tighten hitbox
            box.min.x += 0.2; box.max.x -= 0.2;
            box.min.z += 0.2; box.max.z -= 0.2;

            if (box.intersectsBox(playerBox)) {
                // Check type for avoidance
                const type = o.userData.type;
                let hit = true;
                
                if (type === EntityType.OBSTACLE_LOW && isJumpingRef.current && player.position.y > 1.2) hit = false;
                if (type === EntityType.OBSTACLE_HIGH && isSlidingRef.current) hit = false;
                
                if (hit) {
                    onGameOver(scoreRef.current);
                    gameActiveRef.current = false;
                }
            }
        });

        // Cleanup obstacles/scenery
         obstaclesRef.current = obstaclesRef.current.filter(o => {
            if (o.position.z > cullZ) {
                sceneRef.current?.remove(o);
                return false;
            }
            return true;
        });
         sceneryRef.current = sceneryRef.current.filter(o => {
            if (o.position.z > cullZ) {
                sceneRef.current?.remove(o);
                return false;
            }
            return true;
        });

      } else {
         // Idle Animation in menu
         if (player) {
             player.rotation.y += 0.01;
         }
      }

      rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
    };
    loop();
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-blue-300" />
  );
};

export default GameCanvas;