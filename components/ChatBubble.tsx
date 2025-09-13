import React from 'react';
import type { Message } from '../types';

interface ChatBubbleProps {
  message: Message;
  playerCharacterName: string | null;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, playerCharacterName }) => {
  const { sender, text, isSpecial, isPrivate, imageUrl } = message;

  if (sender === 'system') {
    let style = 'bg-slate-200 text-slate-700';
    if (isSpecial) style = 'bg-yellow-200 text-yellow-800 font-semibold shadow';
    if (isPrivate) style = 'bg-indigo-200 text-indigo-800 font-bold shadow-lg border-2 border-indigo-400';
    
    return (
      <div className="my-4 text-center">
        {imageUrl && (
            <div className="flex justify-center mb-3">
                <img 
                    src={imageUrl} 
                    alt="Sabotage event" 
                    className="w-full max-w-sm mx-auto rounded-xl bg-slate-200 border-8 border-slate-300 object-cover shadow-lg"
                />
            </div>
        )}
        <p className={`inline-block px-4 py-2 rounded-lg text-sm ${style}`}>
          {text}
        </p>
      </div>
    );
  }

  const isPlayerMessage = sender === playerCharacterName;
  const bubbleAlignment = isPlayerMessage ? 'justify-end' : 'justify-start';
  const bubbleColor = isPlayerMessage ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 shadow-sm';
  const senderName = isPlayerMessage ? null : <p className="font-bold text-sm mb-1 text-slate-700">{sender}</p>;

  return (
    <div className={`flex ${bubbleAlignment} my-2`}>
      <div className={`flex flex-col max-w-xs md:max-w-md ${isPlayerMessage ? 'items-end': ''}`}>
        {!isPlayerMessage && <div className="ml-2">{senderName}</div>}
        <div className={`px-4 py-3 rounded-2xl ${bubbleColor}`}>
          <p className="text-base whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;