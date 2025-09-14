import React from 'react';
import type { Character } from '../types';

interface CharacterCardProps {
  character: Character;
  onVote: (name: string) => void;
  isVotingPhase: boolean;
  isVoteDisabled: boolean;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character, onVote, isVotingPhase, isVoteDisabled }) => {
  const isVotedOut = character.status === 'voted_out';
  const cardClasses = `relative bg-white p-4 rounded-lg shadow-md border transition-all duration-300 text-center flex flex-col h-full ${
    isVotedOut ? 'bg-slate-200 opacity-50' : 'hover:shadow-lg hover:-translate-y-1'
  }`;

  return (
    <div className={cardClasses}>
      <div>
        {character.isPlayer && (
          <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">YOU</span>
        )}
        {character.votes > 0 && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">{character.votes}</span>
        )}
        {character.imageUrl ? (
          <img 
            src={character.imageUrl} 
            alt={`Avatar for ${character.name}`} 
            className="w-20 h-20 rounded-full mx-auto mb-3 border-4 border-slate-200 bg-slate-100 object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-full mx-auto mb-3 border-4 border-slate-200 bg-slate-300 flex items-center justify-center">
            <span className="text-3xl font-bold text-slate-500">{character.name.charAt(0)}</span>
          </div>
        )}
        <h3 className="font-bold text-lg text-slate-800 break-words">{character.name}</h3>
        <p className="text-sm text-slate-600 break-words">{character.position}</p>
        <p className="text-sm text-slate-500 mt-2 break-words">{character.personality}</p>
      </div>
      
      <div className="mt-auto">
        {isVotedOut && (
          <div className="mt-3">
              <span className="text-red-500 font-bold text-sm px-3 py-1 bg-red-100 rounded-full">해고됨 (FIRED)</span>
          </div>
        )}
        {isVotingPhase && !isVotedOut && (
          <button
            onClick={() => onVote(character.name)}
            disabled={isVoteDisabled || character.isPlayer}
            className="w-full mt-4 bg-red-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            지목하기 (Vote)
          </button>
        )}
      </div>
    </div>
  );
};

export default CharacterCard;