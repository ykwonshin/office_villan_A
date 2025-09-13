import React, { useState, useRef, useEffect, useCallback } from 'react';
import { setupGame, getCharacterResponses, getVoteAndConfession } from './services/geminiService';
import type { Character, Message, GameState } from './types';
import CharacterCard from './components/CharacterCard';
import ChatBubble from './components/ChatBubble';

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
);

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>('welcome');
    const [characters, setCharacters] = useState<Character[]>([]);
    const [playerCharacter, setPlayerCharacter] = useState<Character | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [sabotage, setSabotage] = useState<string>('');
    const [villain, setVillain] = useState<Character | null>(null);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleStartGame = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setGameState('setting_up');
        setMessages([{ sender: 'system', text: '새로운 오피스 빌런 사건을 접수하는 중입니다...' }]);
        
        try {
            const { characters: newCharactersData, sabotage: newSabotage, sabotageIconSeed } = await setupGame();

            const playerIndex = Math.floor(Math.random() * newCharactersData.length);
            const player = {
                ...newCharactersData[playerIndex],
                status: 'active' as const,
                isPlayer: true,
                votes: 0,
                imageUrl: `https://api.dicebear.com/8.x/pixel-art/svg?seed=${encodeURIComponent(newCharactersData[playerIndex].imageUrl)}`
            };
            setPlayerCharacter(player);

            const newCharacters: Character[] = newCharactersData.map((c, index) => ({
                ...c,
                status: 'active',
                isPlayer: index === playerIndex,
                votes: 0,
                imageUrl: `https://api.dicebear.com/8.x/pixel-art/svg?seed=${encodeURIComponent(c.imageUrl)}`
            }));
            
            setCharacters(newCharacters);
            setSabotage(newSabotage);
            const gameVillain = newCharacters.find(c => c.isVillain) || null;
            setVillain(gameVillain);

            const fullSabotageImageUrl = `https://api.dicebear.com/8.x/icons/svg?seed=${encodeURIComponent(sabotageIconSeed)}`;

            const initialMessages: Message[] = [
                { sender: 'system', text: `당신은 이 게임의 주인공, ${player.name}입니다. 하지만 당신이 빌런일지, 아닐지는 아직 아무도 모릅니다...`, isPrivate: true },
                { 
                    sender: 'system', 
                    text: `🚨긴급🚨\n\n"${newSabotage}"\n\n사건이 발생했습니다! 범인은 이 안에 있습니다.`, 
                    isSpecial: true,
                    imageUrl: fullSabotageImageUrl,
                },
                { sender: 'system', text: '동료들과 대화하여 오피스 빌런을 찾아내세요.' }
            ];
            setMessages(initialMessages);
            setGameState('discussion');
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            setError(errorMessage);
            setGameState('welcome');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || gameState !== 'discussion' || !playerCharacter) return;
        
        const newPlayerMessage: Message = { sender: playerCharacter.name, text: userInput };
        setMessages(prev => [...prev, newPlayerMessage]);
        setUserInput('');
        setIsLoading(true);
        
        try {
            const responses = await getCharacterResponses(userInput, characters, sabotage, [...messages, newPlayerMessage], playerCharacter.name);
            const newCharacterMessages: Message[] = responses.map(r => ({ sender: r.name, text: r.response }));
            setMessages(prev => [...prev, ...newCharacterMessages]);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            setMessages(prev => [...prev, { sender: 'system', text: `Error: ${errorMessage}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePlayerVote = async (votedName: string) => {
        if (gameState !== 'voting' || !playerCharacter) return;

        setGameState('reveal');
        setIsLoading(true);
        setMessages(prev => [...prev, { sender: 'system', text: '투표가 집계 중입니다...' }]);

        try {
            const playerVote = { voter: playerCharacter.name, votedFor: votedName };
            const { votes: aiVotes, confession } = await getVoteAndConfession(characters, sabotage, messages, playerVote);
            
            const allVotes = [playerVote, ...aiVotes];
            const voteTally: { [key: string]: number } = {};
            characters.forEach(c => { voteTally[c.name] = 0; });
            
            // Simulate vote reveal
            for (const vote of allVotes) {
                await new Promise(res => setTimeout(res, 600));
                voteTally[vote.votedFor] = (voteTally[vote.votedFor] || 0) + 1;
                setCharacters(prev => prev.map(c => ({...c, votes: voteTally[c.name] })));
                setMessages(prev => [...prev, { sender: 'system', text: `${vote.voter}님이 ${vote.votedFor}님을 지목했습니다.` }]);
            }
            
            await new Promise(res => setTimeout(res, 1500));

            // Determine result
            let maxVotes = 0;
            let votedOutName = '';
            for (const name in voteTally) {
                if (voteTally[name] > maxVotes) {
                    maxVotes = voteTally[name];
                    votedOutName = name;
                }
            }
            
            const votedOutCharacter = characters.find(c => c.name === votedOutName);

            if (votedOutCharacter) {
                setCharacters(prev => prev.map(c => c.name === votedOutName ? { ...c, status: 'voted_out' } : c));
                setMessages(prev => [...prev, { sender: 'system', text: `투표 결과, ${votedOutName}님이 가장 많은 표를 받아 해고되었습니다...` }]);
                
                await new Promise(res => setTimeout(res, 2000));
                
                const wasVillainCaught = votedOutCharacter.isVillain;
                const isPlayerTheVillain = playerCharacter?.isVillain;

                if (wasVillainCaught) {
                    // The villain was caught. It's a win for innocents, loss for the villain.
                    const finalMessage = votedOutCharacter.isPlayer 
                        ? `...그리고 밝혀진 진실은, 당신이 바로 오피스 빌런이었습니다! 덜미를 잡혔네요.`
                        : `축하합니다! ${votedOutName}은(는) 진짜 오피스 빌런이었습니다!`;
                    
                    setMessages(prev => [
                        ...prev,
                        { sender: 'system', text: finalMessage, isSpecial: true },
                        { sender: votedOutName, text: `[자백] ${confession}` }
                    ]);
                    setGameState(isPlayerTheVillain ? 'game_over_loss' : 'game_over_win');
                } else {
                    // An innocent was caught. It's a loss for innocents, win for the villain.
                    const finalMessage = isPlayerTheVillain
                        ? `당신은 모두를 완벽하게 속였습니다! 진짜 빌런은 바로 당신, ${playerCharacter.name}이었습니다! 😈`
                        : `안타깝네요... ${votedOutName}은(는) 빌런이 아니었습니다. 진짜 빌런은 ${villain?.name}이었습니다!`;
                        
                    setMessages(prev => [
                        ...prev,
                        { sender: 'system', text: finalMessage, isSpecial: true }
                    ]);
                    setGameState(isPlayerTheVillain ? 'game_over_win' : 'game_over_loss');
                }
            } else {
                 setMessages(prev => [...prev, { sender: 'system', text: '투표 결과가 동점이라 아무도 해고되지 않았습니다. 토론을 계속합니다.' }]);
                 setGameState('discussion');
            }

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            setMessages(prev => [...prev, { sender: 'system', text: `Error: ${errorMessage}` }]);
            setGameState('discussion'); // Go back to discussion on error
        } finally {
            setIsLoading(false);
        }
    };


    const handlePlayAgain = () => {
        setGameState('welcome');
        setCharacters([]);
        setMessages([]);
        setVillain(null);
        setError(null);
        setPlayerCharacter(null);
        setSabotage('');
    };

    const renderGameState = () => {
        switch (gameState) {
            case 'welcome':
                return (
                    <div className="text-center p-8">
                        <h1 className="text-4xl font-extrabold text-slate-800 mb-2">오피스 빌런</h1>
                        <p className="text-slate-600 mb-8">사내에 숨어있는 빌런을 찾아내세요!</p>
                        <button onClick={handleStartGame} disabled={isLoading} className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-blue-700 transition-transform hover:scale-105 disabled:bg-slate-400">
                            {isLoading ? '로딩중...' : '게임 시작'}
                        </button>
                        {error && <p className="text-red-500 mt-4">{error}</p>}
                    </div>
                );
            
            case 'setting_up':
                 return (
                    <div className="text-center p-8">
                        <h2 className="text-2xl font-bold text-slate-700 mb-4">사건 현장으로 이동 중...</h2>
                        <LoadingSpinner />
                    </div>
                );
            
            case 'discussion':
            case 'voting':
            case 'reveal':
            case 'game_over_win':
            case 'game_over_loss':
                return (
                    <div className="flex flex-col md:flex-row h-full gap-4 p-4">
                        {/* Left Panel: Characters */}
                        <div className="w-full md:w-1/3 lg:w-1/4 bg-slate-200/70 p-4 rounded-xl overflow-y-auto">
                            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-300 pb-2">팀원 목록</h2>
                            <div className="space-y-3">
                                {characters.map(char => (
                                    <CharacterCard 
                                        key={char.name} 
                                        character={char} 
                                        onVote={handlePlayerVote}
                                        isVotingPhase={gameState === 'voting'}
                                        isVoteDisabled={gameState !== 'voting'}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Right Panel: Chat */}
                        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-white rounded-xl shadow-lg">
                            <div className="flex-1 p-4 overflow-y-auto">
                                {messages.map((msg, index) => <ChatBubble key={index} message={msg} playerCharacterName={playerCharacter?.name || null} />)}
                                {isLoading && gameState !== 'reveal' && <LoadingSpinner />}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="p-4 border-t border-slate-200">
                                {gameState === 'discussion' && (
                                     <form onSubmit={handleSendMessage} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={userInput}
                                            onChange={(e) => setUserInput(e.target.value)}
                                            placeholder={`${playerCharacter?.name || ''} (으)로 메시지 입력...`}
                                            className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            disabled={isLoading}
                                        />
                                        <button type="submit" className="bg-blue-600 text-white font-semibold py-3 px-5 rounded-lg hover:bg-blue-700 disabled:bg-slate-400" disabled={isLoading}>
                                            전송
                                        </button>
                                        <button type="button" onClick={() => setGameState('voting')} disabled={isLoading} className="bg-green-500 text-white font-semibold py-3 px-5 rounded-lg hover:bg-green-600 disabled:bg-slate-400">
                                            투표하기
                                        </button>
                                    </form>
                                )}
                                {gameState === 'voting' && <p className="text-center font-semibold text-red-600 animate-pulse">왼쪽 팀원 목록에서 빌런을 지목하세요!</p>}
                                {gameState === 'reveal' && <p className="text-center font-semibold text-slate-600">투표가 진행 중입니다. 결과를 기다려주세요.</p>}
                                {(gameState === 'game_over_win' || gameState === 'game_over_loss') && (
                                    <div className="text-center">
                                        <button onClick={handlePlayAgain} className="bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-700 transition-transform hover:scale-105">
                                            다시 플레이하기
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );

            default: return <div>Error: Unknown game state.</div>
        }
    };
    
    return (
        <main className="container mx-auto max-w-7xl h-[calc(100vh-2rem)] my-4">
            <div className="h-full bg-slate-50 rounded-2xl shadow-2xl shadow-slate-300/50 flex justify-center items-center">
                {renderGameState()}
            </div>
        </main>
    );
};

export default App;