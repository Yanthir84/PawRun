import React from 'react';
import { GameState, Mission } from '../types';
import { PawPrint, Play, RotateCcw, Trophy, Award } from 'lucide-react';

interface UIOverlayProps {
  gameState: GameState;
  score: number;
  mission: Mission | null;
  isLoadingMission: boolean;
  onStart: () => void;
  onRestart: () => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ 
  gameState, 
  score, 
  mission, 
  isLoadingMission, 
  onStart, 
  onRestart 
}) => {
  if (gameState === GameState.PLAYING) {
    return (
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
        <div className="bg-blue-900/80 text-white px-6 py-2 rounded-full border-2 border-yellow-400 font-bold text-xl flex items-center gap-2 shadow-lg backdrop-blur-sm">
          <Award className="text-yellow-400 w-6 h-6" />
          <span>{score}</span>
        </div>
        <div className="bg-gray-900/50 text-white text-sm px-4 py-2 rounded-lg backdrop-blur-sm max-w-xs text-right hidden sm:block">
          <p className="font-bold text-yellow-400">Steuerung:</p>
          <p>WASD oder Pfeiltasten</p>
          <p>W: Springen | S: Rutschen</p>
        </div>
      </div>
    );
  }

  if (gameState === GameState.GAME_OVER) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50">
        <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border-4 border-blue-600">
          <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border-4 border-white">
             <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Einsatz beendet!</h2>
          <p className="text-slate-500 mb-6">Gute Arbeit, Chase!</p>
          
          <div className="bg-blue-50 rounded-xl p-4 mb-8 border border-blue-100">
            <p className="text-sm text-blue-600 font-bold uppercase tracking-wider mb-1">Endpunktzahl</p>
            <p className="text-5xl font-black text-blue-900">{score}</p>
          </div>

          <button 
            onClick={onRestart}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-bold py-4 px-8 rounded-2xl text-xl transition-all transform hover:scale-105 shadow-xl flex items-center justify-center gap-3"
          >
            <RotateCcw className="w-6 h-6" />
            Nochmal versuchen
          </button>
        </div>
      </div>
    );
  }

  // Menu State
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-blue-400/90 to-blue-900/90 backdrop-blur-sm z-50">
      <div className="text-center text-white mb-12 animate-bounce-slow">
        <div className="inline-block p-4 bg-white rounded-full shadow-xl mb-4">
           <PawPrint className="w-16 h-16 text-blue-600" />
        </div>
        <h1 className="text-6xl font-black tracking-tight drop-shadow-xl border-text">
          STADT <span className="text-yellow-400">SPRINT</span>
        </h1>
        <p className="mt-4 text-xl font-medium text-blue-100">Bereit für den Einsatz, Chase?</p>
      </div>

      <div className="bg-white/95 backdrop-blur-md p-8 rounded-3xl shadow-2xl max-w-lg w-full mx-4 border-4 border-yellow-400">
        {mission ? (
          <div className="mb-8">
            <h3 className="text-blue-600 font-bold uppercase tracking-wider text-sm mb-2">Aktuelle Mission</h3>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <h4 className="text-xl font-bold text-slate-800 mb-2">{mission.title}</h4>
              <p className="text-slate-600 leading-relaxed">{mission.description}</p>
            </div>
          </div>
        ) : (
          <div className="mb-8 text-center py-4">
             {isLoadingMission ? (
                <p className="text-slate-500 animate-pulse">Ryder ruft an...</p>
             ) : (
                <p className="text-slate-400 italic">Keine Mission geladen.</p>
             )}
          </div>
        )}

        <button 
          onClick={onStart}
          disabled={isLoadingMission}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl text-2xl transition-all transform hover:scale-105 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-3 border-b-4 border-blue-800 active:border-b-0 active:translate-y-1"
        >
          {isLoadingMission ? (
            'Laden...'
          ) : (
            <>
              <Play className="w-8 h-8 fill-current" />
              MISSION STARTEN
            </>
          )}
        </button>
      </div>
      
      <div className="mt-8 text-white/70 text-sm">
        Drücke <span className="font-bold text-white border border-white/30 rounded px-1">W</span> zum Springen, <span className="font-bold text-white border border-white/30 rounded px-1">S</span> zum Rutschen
      </div>
    </div>
  );
};

export default UIOverlay;
