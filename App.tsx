import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, Mission } from './types';
import { generateMission } from './services/genaiService';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [mission, setMission] = useState<Mission | null>(null);
  const [isLoadingMission, setIsLoadingMission] = useState(false);

  // Load mission on mount
  useEffect(() => {
    const loadMission = async () => {
      setIsLoadingMission(true);
      const newMission = await generateMission();
      setMission(newMission);
      setIsLoadingMission(false);
    };
    loadMission();
  }, []);

  const handleStartGame = () => {
    setGameState(GameState.PLAYING);
    setScore(0);
  };

  const handleGameOver = (finalScore: number) => {
    setGameState(GameState.GAME_OVER);
    setScore(finalScore);
  };

  const handleRestart = async () => {
    // Optionally load a new mission on restart
    setGameState(GameState.MENU);
    setIsLoadingMission(true);
    const newMission = await generateMission();
    setMission(newMission);
    setIsLoadingMission(false);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-900 select-none">
      <GameCanvas 
        gameState={gameState} 
        onGameOver={handleGameOver}
        onScoreUpdate={setScore}
      />
      <UIOverlay 
        gameState={gameState}
        score={score}
        mission={mission}
        isLoadingMission={isLoadingMission}
        onStart={handleStartGame}
        onRestart={handleRestart}
      />
    </div>
  );
};

export default App;
