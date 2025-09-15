import React, { useEffect, useState } from 'react';
import type { GameState } from '../types';

interface GameOverAnimationsProps {
  gameState: GameState;
}

const ConfettiAnimation: React.FC = () => {
    const [pieces, setPieces] = useState<React.ReactElement[]>([]);

    useEffect(() => {
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
        const confettiPieces = Array.from({ length: 100 }).map((_, i) => {
            const style: React.CSSProperties = {
                left: `${Math.random() * 100}%`,
                backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
            };
            return <div key={i} className="confetti-piece" style={style}></div>;
        });
        setPieces(confettiPieces);
    }, []);

    return (
        <>
            <style>{`
                .confetti-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    pointer-events: none;
                    z-index: 100;
                }
                .confetti-piece {
                    position: absolute;
                    width: 10px;
                    height: 20px;
                    top: -20px;
                    opacity: 0;
                    animation: fall 5s linear forwards;
                }
                @keyframes fall {
                    0% { transform: translateY(0vh) rotateZ(0deg); opacity: 1; }
                    100% { transform: translateY(105vh) rotateZ(720deg); opacity: 0; }
                }
            `}</style>
            <div className="confetti-container">{pieces}</div>
        </>
    );
};


const DefeatAnimation: React.FC = () => {
    return (
        <>
            <style>{`
                .defeat-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    pointer-events: none;
                    z-index: 100;
                }
                .defeat-stamp {
                    font-size: 6rem; /* Adjusted for better fit */
                    font-weight: 900;
                    font-family: 'Impact', 'Arial Black', sans-serif;
                    color: rgba(220, 38, 38, 0.8);
                    border: 8px solid rgba(220, 38, 38, 0.8);
                    padding: 1rem 2rem;
                    border-radius: 10px;
                    text-transform: uppercase;
                    transform: rotate(-15deg);
                    opacity: 0;
                    animation: stamp 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                    animation-delay: 0.5s;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                }

                @keyframes stamp {
                    0% { transform: scale(3) rotate(-15deg); opacity: 0; }
                    40% { transform: scale(0.9) rotate(-15deg); opacity: 0.9; }
                    50% { transform: scale(1.1) rotate(-16deg); }
                    60% { transform: scale(0.95) rotate(-14deg); }
                    70% { transform: scale(1.05) rotate(-15deg); }
                    100% { transform: scale(1) rotate(-15deg); opacity: 0.9; }
                }
            `}</style>
            <div className="defeat-container">
                <div className="defeat-stamp">
                    <span>패배</span>
                </div>
            </div>
        </>
    )
};


const GameOverAnimations: React.FC<GameOverAnimationsProps> = ({ gameState }) => {
  if (gameState === 'game_over_win') {
    return <ConfettiAnimation />;
  }
  
  if (gameState === 'game_over_loss') {
    return <DefeatAnimation />;
  }

  return null;
};

export default GameOverAnimations;
