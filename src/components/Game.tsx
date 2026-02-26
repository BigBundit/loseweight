import React, { useEffect, useRef, useState } from 'react';
import { Share2, RotateCcw, Play, Heart, Camera } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Game constants
const PLAYER_RADIUS = 25;
const SWEET_RADIUS = 20;
const SWEETS_EMOJIS = ['🍩', '🍰', '🍦', '🍫', '🍬', '🧁', '🥞', '🧇', '🍧', '🍨', '🍪', '🧋'];

type GameState = 'start' | 'playing' | 'gameover';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Refs for mutable game state to avoid re-renders during game loop
  const gameStateRef = useRef(gameState);
  const scoreRef = useRef(0);
  const playerRef = useRef({ x: 0, y: 0 });
  const sweetsRef = useRef<Array<{ x: number, y: number, vx: number, vy: number, emoji: string, rotation: number, rotSpeed: number }>>([]);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(0);
  const difficultyRef = useRef(1);
  const spawnTimerRef = useRef(0);
  const playerVelocityRef = useRef({ vx: 0, vy: 0 });
  const lastPlayerPosRef = useRef({ x: 0, y: 0 });
  const playerTiltRef = useRef(0);

  // Input handling refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const playerStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Initialize camera and FaceLandmarker
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;

    const setupCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          } 
        });
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    const initLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 1
        });
        if (isMounted) {
          faceLandmarkerRef.current = landmarker;
          setIsCameraReady(true);
        }
      } catch (err) {
        console.error("Error initializing FaceLandmarker:", err);
      }
    };

    setupCamera();
    initLandmarker();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Initialize game
  const initGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    playerRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    sweetsRef.current = [];
    scoreRef.current = 0;
    difficultyRef.current = 1;
    setScore(0);
    setFinalImage(null);
    setGameState('playing');
    gameStateRef.current = 'playing';
    lastTimeRef.current = performance.now();
    spawnTimerRef.current = 0;
    playerVelocityRef.current = { vx: 0, vy: 0 };
    lastPlayerPosRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    playerTiltRef.current = 0;
  };

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spawnSweet = () => {
      const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
      let x, y;
      if (edge === 0) { x = Math.random() * canvas.width; y = -50; }
      else if (edge === 1) { x = canvas.width + 50; y = Math.random() * canvas.height; }
      else if (edge === 2) { x = Math.random() * canvas.width; y = canvas.height + 50; }
      else { x = -50; y = Math.random() * canvas.height; }

      // Aim towards player with some randomness
      const angleToPlayer = Math.atan2(playerRef.current.y - y, playerRef.current.x - x);
      const angle = angleToPlayer + (Math.random() - 0.5) * 0.4;
      
      // Speed in pixels per millisecond
      const baseSpeed = 0.25 + Math.random() * 0.15;
      const speed = baseSpeed * difficultyRef.current;

      sweetsRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        emoji: SWEETS_EMOJIS[Math.floor(Math.random() * SWEETS_EMOJIS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.005 // radians per ms
      });
    };

    const gameOver = () => {
      setGameState('gameover');
      gameStateRef.current = 'gameover';
      
      // Generate share image
      if (canvas) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = canvas.width;
        offCanvas.height = canvas.height;
        const offCtx = offCanvas.getContext('2d');
        if (offCtx) {
          offCtx.drawImage(canvas, 0, 0);
          
          offCtx.fillStyle = 'rgba(255, 240, 245, 0.85)'; // Light pink overlay
          offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
          
          // Draw cute border
          offCtx.strokeStyle = '#333';
          offCtx.lineWidth = 8;
          offCtx.strokeRect(20, 20, offCanvas.width - 40, offCanvas.height - 40);
          
          offCtx.fillStyle = '#333';
          offCtx.font = '900 48px "Nunito", sans-serif';
          offCtx.textAlign = 'center';
          offCtx.fillText('Oh no!', offCanvas.width / 2, offCanvas.height / 2 - 60);
          
          offCtx.fillStyle = '#ff6b81'; // Cute coral pink
          offCtx.font = '900 80px "Nunito", sans-serif';
          
          // Text outline
          offCtx.strokeStyle = '#333';
          offCtx.lineWidth = 6;
          offCtx.strokeText(Math.floor(scoreRef.current).toString(), offCanvas.width / 2, offCanvas.height / 2 + 40);
          offCtx.fillText(Math.floor(scoreRef.current).toString(), offCanvas.width / 2, offCanvas.height / 2 + 40);
          
          offCtx.fillStyle = '#333';
          offCtx.font = '700 24px "Nunito", sans-serif';
          offCtx.fillText('Lose Weight Game', offCanvas.width / 2, offCanvas.height / 2 + 110);

          setFinalImage(offCanvas.toDataURL('image/png'));
        }
      }
    };

    const update = (dt: number) => {
      if (gameStateRef.current !== 'playing') return;

      // Calculate player velocity for tilting
      const px = playerRef.current.x;
      const py = playerRef.current.y;
      const lpx = lastPlayerPosRef.current.x;
      const lpy = lastPlayerPosRef.current.y;
      
      if (dt > 0) {
        playerVelocityRef.current.vx = (px - lpx) / dt;
        playerVelocityRef.current.vy = (py - lpy) / dt;
      }
      
      lastPlayerPosRef.current.x = px;
      lastPlayerPosRef.current.y = py;

      // Smooth tilt based on horizontal velocity
      const targetTilt = Math.max(-0.4, Math.min(0.4, playerVelocityRef.current.vx * 0.8));
      playerTiltRef.current += (targetTilt - playerTiltRef.current) * (dt * 0.01);

      // Increase score and difficulty
      scoreRef.current += dt * 0.01;
      setScore(Math.floor(scoreRef.current));
      // Difficulty increases speed of sweets
      difficultyRef.current = 1 + scoreRef.current / 400;

      // Spawn sweets with timer for consistent progressive difficulty
      spawnTimerRef.current += dt;
      // Spawn interval decreases as score increases. Starts at 1200ms, minimum 250ms.
      const currentSpawnInterval = Math.max(250, 1200 - scoreRef.current * 4);

      if (spawnTimerRef.current >= currentSpawnInterval) {
        spawnSweet();
        spawnTimerRef.current = 0;
      }

      // Face Tracking for Player Movement
      if (faceLandmarkerRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          const nose = landmarks[1]; // Nose tip

          // Amplify movement so user doesn't have to move head to the edge of the camera
          const sensitivity = 2.5; // 2.5x movement multiplier
          
          // Calculate offset from center (0.5)
          // nose.x is mirrored: moving left physically increases nose.x in camera
          const offsetX = (0.5 - nose.x) * sensitivity;
          const offsetY = (nose.y - 0.5) * sensitivity;

          const targetX = canvas.width / 2 + offsetX * canvas.width;
          const targetY = canvas.height / 2 + offsetY * canvas.height;

          // Smooth movement towards nose
          playerRef.current.x += (targetX - playerRef.current.x) * 0.25;
          playerRef.current.y += (targetY - playerRef.current.y) * 0.25;

          // Clamp to screen
          playerRef.current.x = Math.max(PLAYER_RADIUS, Math.min(canvas.width - PLAYER_RADIUS, playerRef.current.x));
          playerRef.current.y = Math.max(PLAYER_RADIUS, Math.min(canvas.height - PLAYER_RADIUS, playerRef.current.y));
        }
      }

      // Update sweets
      for (let i = sweetsRef.current.length - 1; i >= 0; i--) {
        const sweet = sweetsRef.current[i];
        
        // Frame-rate independent movement
        sweet.x += sweet.vx * dt;
        sweet.y += sweet.vy * dt;
        sweet.rotation += sweet.rotSpeed * dt;

        // Collision check
        const dx = sweet.x - playerRef.current.x;
        const dy = sweet.y - playerRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Hitbox slightly smaller than visual radius for fairness
        if (dist < PLAYER_RADIUS + SWEET_RADIUS - 12) {
          gameOver();
        }

        // Remove off-screen sweets
        if (sweet.x < -100 || sweet.x > canvas.width + 100 || sweet.y < -100 || sweet.y > canvas.height + 100) {
          sweetsRef.current.splice(i, 1);
        }
      }
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      
      // Shadow (don't rotate shadow)
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.ellipse(0, 28, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rotate body based on movement
      ctx.rotate(playerTiltRef.current);

      // Common stroke style for cartoon look
      ctx.strokeStyle = '#2d3436';
      ctx.lineWidth = 2.5;

      // Body (Chubby)
      ctx.fillStyle = '#ff9a9e'; // Cute pink shirt
      ctx.beginPath();
      ctx.ellipse(0, 12, 24, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Head
      ctx.fillStyle = '#ffeaa7'; // Warm skin tone
      ctx.beginPath();
      ctx.arc(0, -12, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hair buns (Back)
      ctx.fillStyle = '#634832'; // Cute brown hair
      
      ctx.beginPath();
      ctx.arc(-20, -18, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(20, -18, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hair (Front)
      ctx.beginPath();
      ctx.arc(0, -16, 23, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eyes (Cute big dots)
      ctx.fillStyle = '#2d3436';
      ctx.beginPath();
      ctx.arc(-9, -10, 3.5, 0, Math.PI * 2);
      ctx.arc(9, -10, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Blush
      ctx.fillStyle = '#ff7675';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(-14, -5, 5, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(14, -5, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Mouth (Cute 'w' shape)
      ctx.strokeStyle = '#2d3436';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.quadraticCurveTo(-2, -1, 0, -4);
      ctx.quadraticCurveTo(2, -1, 4, -4);
      ctx.stroke();

      // Little sweat drop (working hard!)
      if (gameStateRef.current === 'playing') {
        ctx.fillStyle = '#74b9ff';
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-18, -25);
        ctx.quadraticCurveTo(-22, -20, -18, -18);
        ctx.quadraticCurveTo(-14, -20, -18, -25);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    };

    const draw = () => {
      if (gameStateRef.current === 'gameover') return;
      
      // Draw cute grid background
      ctx.fillStyle = '#fff0f5'; // Lavender blush
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw camera background
      if (videoRef.current && videoRef.current.readyState >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.3; // Faded
        ctx.filter = 'blur(12px)'; // Blurred
        
        const video = videoRef.current;
        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;
        
        let drawWidth, drawHeight;
        if (videoRatio > canvasRatio) {
          drawHeight = canvas.height;
          drawWidth = canvas.height * videoRatio;
        } else {
          drawWidth = canvas.width;
          drawHeight = canvas.width / videoRatio;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(-1, 1); // Mirror
        ctx.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(255, 182, 193, 0.3)'; // Light pink grid
      ctx.lineWidth = 2;
      const gridSize = 40;
      
      // Animate grid slightly
      const offset = (performance.now() / 50) % gridSize;
      
      ctx.beginPath();
      for (let x = offset; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      for (let y = offset; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();

      // Draw player
      drawPlayer(ctx, playerRef.current.x, playerRef.current.y);

      // Draw sweets
      ctx.font = '45px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      sweetsRef.current.forEach(sweet => {
        ctx.save();
        ctx.translate(sweet.x, sweet.y);
        ctx.rotate(sweet.rotation);
        
        // Add a subtle white glow/outline behind emojis for better visibility
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.fillText(sweet.emoji, 0, 0);
        
        ctx.restore();
      });
    };

    const loop = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      update(dt);
      draw();

      frameRef.current = requestAnimationFrame(loop);
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (gameStateRef.current === 'start') {
        playerRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
        draw();
      }
    };
    window.addEventListener('resize', resize);
    resize();

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Input Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (gameStateRef.current === 'start') {
      initGame();
      // Instantly move to pointer on start
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        playerRef.current = { x, y };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Disabled pointer movement, now using camera
  };

  const handlePointerUp = () => {
    // No longer need to track dragging state
  };

  const handleShare = async () => {
    if (!finalImage) return;
    
    try {
      const blob = await (await fetch(finalImage)).blob();
      const file = new File([blob], 'score.png', { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Lose Weight Game',
          text: `I scored ${Math.floor(scoreRef.current)} in Lose Weight! Can you beat me?`,
          files: [file]
        });
      } else {
        alert('Long press the image to save and share!');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  return (
    <div className="relative w-full h-full font-['Nunito',sans-serif] overflow-hidden">
      <video 
        ref={videoRef} 
        style={{ position: 'absolute', opacity: 0, zIndex: -1, pointerEvents: 'none', width: '1px', height: '1px' }} 
        playsInline 
        autoPlay 
        muted 
      />
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* UI Overlay */}
      {gameState === 'playing' && (
        <div className="absolute top-8 left-0 w-full text-center pointer-events-none">
          <div className="inline-block bg-white/80 backdrop-blur-sm px-8 py-3 rounded-full border-4 border-gray-800 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)]">
            <span className="text-4xl font-black text-pink-500 tracking-wider">
              {score}
            </span>
          </div>
        </div>
      )}

      {gameState === 'start' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#fff0f5]/90 backdrop-blur-sm pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-center p-8 bg-white rounded-[3rem] border-4 border-gray-800 shadow-[8px_8px_0px_0px_rgba(31,41,55,1)] transform -rotate-2">
            <div className="flex items-center gap-3 mb-2">
              <Heart className="text-pink-500 fill-pink-500 animate-bounce" size={40} />
              <h1 className="text-5xl font-black text-gray-800 tracking-tight">Lose Weight</h1>
              <Heart className="text-pink-500 fill-pink-500 animate-bounce" size={40} style={{ animationDelay: '0.2s' }} />
            </div>
            <p className="text-gray-600 font-bold mb-8 text-xl bg-pink-100 px-4 py-1 rounded-full border-2 border-gray-800">Dodge the sweets!</p>
            
            <button 
              onClick={initGame}
              disabled={!isCameraReady}
              className={`group relative flex items-center gap-3 px-10 py-5 rounded-full font-black text-2xl border-4 border-gray-800 shadow-[6px_6px_0px_0px_rgba(31,41,55,1)] transition-all ${
                isCameraReady 
                  ? 'bg-pink-500 text-white hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(31,41,55,1)] active:translate-y-2 active:shadow-none' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isCameraReady ? (
                <>
                  <Play fill="currentColor" size={28} className="group-hover:scale-110 transition-transform" />
                  TAP TO START
                </>
              ) : (
                <>
                  <Camera size={28} className="animate-pulse" />
                  LOADING CAMERA...
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/40 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm flex flex-col items-center border-4 border-gray-800 shadow-[8px_8px_0px_0px_rgba(31,41,55,1)] transform transition-all scale-100 rotate-1">
            <h2 className="text-4xl font-black text-gray-800 mb-2">Oh no!</h2>
            <p className="text-gray-600 font-bold mb-6 text-lg bg-pink-100 px-4 py-1 rounded-full border-2 border-gray-800">Too many sweets!</p>
            
            <div className="relative mb-8">
              <div className="text-7xl font-black text-pink-500 drop-shadow-[4px_4px_0px_rgba(31,41,55,1)]">
                {score}
              </div>
            </div>

            {finalImage && (
              <img 
                src={finalImage} 
                alt="Final Score" 
                className="w-full rounded-2xl mb-6 border-4 border-gray-800 hidden" 
              />
            )}

            <div className="flex flex-col gap-4 w-full">
              <button 
                onClick={initGame}
                className="flex items-center justify-center gap-2 bg-pink-500 text-white px-6 py-4 rounded-2xl font-black text-xl border-4 border-gray-800 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(31,41,55,1)] active:translate-y-2 active:shadow-none transition-all w-full"
              >
                <RotateCcw size={24} strokeWidth={3} />
                PLAY AGAIN
              </button>
              
              <button 
                onClick={handleShare}
                className="flex items-center justify-center gap-2 bg-[#74b9ff] text-gray-900 px-6 py-4 rounded-2xl font-black text-xl border-4 border-gray-800 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(31,41,55,1)] active:translate-y-2 active:shadow-none transition-all w-full"
              >
                <Share2 size={24} strokeWidth={3} />
                SHARE SCORE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
