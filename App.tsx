import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateGameSetupText, generatePixelArtImage, getCharacterResponses, getVoteAndConfession } from './services/geminiService';
import type { Character, Message, GameState } from './types';
import CharacterCard from './components/CharacterCard';
import ChatBubble from './components/ChatBubble';
import GameOverAnimations from './components/GameOverAnimations';

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
);

const loadingTexts = [
    'CCTV 확인 중... (실은 없음)',
    '동료들의 알리바이 위조 중...',
    '커피 머신에서 지문 채취 중...',
    '탕비실 간식 재고 파악 중...',
    '범인이 남긴 코드 주석 분석 중...',
    '보고서용 폰트 고르는 중...',
];

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
    const [loadingMessage, setLoadingMessage] = useState<string>(loadingTexts[0]);

    const chatEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (gameState === 'setting_up') {
            const interval = setInterval(() => {
                setLoadingMessage(currentMessage => {
                    const currentIndex = loadingTexts.indexOf(currentMessage);
                    const nextIndex = (currentIndex + 1) % loadingTexts.length;
                    return loadingTexts[nextIndex];
                });
            }, 1800);

            return () => clearInterval(interval);
        }
    }, [gameState]);


    const handleStartGame = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setGameState('setting_up');
        setMessages([{ sender: 'system', text: '새로운 오피스 빌런 사건을 접수하는 중입니다...' }]);
        
        try {
            // Step 1: Get essential text data first (Faster)
            const { characters: charactersWithPrompts, sabotage: newSabotage } = await generateGameSetupText();

            // Step 2: Immediately set up game state and render UI
            const playerIndex = Math.floor(Math.random() * charactersWithPrompts.length);
            
            const newCharacters: Character[] = charactersWithPrompts.map((c, index) => {
                const { portraitPrompt, visualDescription, ...restOfChar } = c;
                return {
                    ...restOfChar,
                    status: 'active',
                    isPlayer: index === playerIndex,
                    votes: 0,
                    imageUrl: null, // Image is null initially
                };
            });

            const player = newCharacters.find(c => c.isPlayer)!;
            setPlayerCharacter(player);
            setCharacters(newCharacters);
            setSabotage(newSabotage);
            const gameVillain = newCharacters.find(c => c.isVillain) || null;
            setVillain(gameVillain);

            const initialMessages: Message[] = [
                { sender: 'system', text: `당신은 이 게임의 주인공, ${player.name}입니다.`, isPrivate: true },
                { 
                    sender: 'system', 
                    text: `🚨긴급🚨\n\n"${newSabotage}"\n\n사건이 발생했습니다! 범인은 이 안에 있습니다.`, 
                    isSpecial: true,
                    imageUrl: null, // Image is null initially
                },
                { sender: 'system', text: '동료들과 대화하여 오피스 빌런을 찾아내세요.' }
            ];
            setMessages(initialMessages);
            
            // Go to discussion, user can now interact
            setGameState('discussion');
            setIsLoading(false); 

            // Step 3: Generate images in the background (Slow & Progressive)
            // Construct the sabotage image prompt on the client-side
            const characterVisuals = charactersWithPrompts.map(c => c.visualDescription).join(', ');
            const sabotageImagePrompt = `A cute, bright, low-resolution 8-bit retro pixel art scene. It depicts an office where a sabotage has occurred: "${newSabotage}". The following people are in the scene, reacting to the situation: ${characterVisuals}. There should be no text or letters in the image.`;

            generatePixelArtImage(sabotageImagePrompt).then(sabotageImageUrl => {
                if (sabotageImageUrl) {
                    setMessages(prev => prev.map(msg => 
                        msg.isSpecial ? { ...msg, imageUrl: sabotageImageUrl } : msg
                    ));
                }
            });
            
            const portraitPrompts = charactersWithPrompts.map(c => c.portraitPrompt);
            portraitPrompts.forEach((prompt, index) => {
                if (!prompt) return;
                generatePixelArtImage(prompt).then(imageUrl => {
                    if (imageUrl) {
                        setCharacters(prev => {
                            const updatedChars = [...prev];
                            if (updatedChars[index]) {
                                updatedChars[index].imageUrl = imageUrl;
                            }
                            return updatedChars;
                        });
                    }
                });
            });

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            setError(errorMessage);
            setGameState('welcome');
            setIsLoading(false);
        }
    }, []);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || gameState !== 'discussion' || !playerCharacter) return;

        const newPlayerMessage: Message = { sender: playerCharacter.name, text: userInput };
        const messagesForApi = [...messages, newPlayerMessage];
        setMessages(messagesForApi);
        setUserInput('');
        setIsLoading(true);

        try {
            const responseStream = getCharacterResponses(userInput, characters, sabotage, messagesForApi, playerCharacter.name);

            for await (const response of responseStream) {
                const newMessage: Message = { sender: response.name, text: response.response };
                // Add a small delay for a more natural "typing" feel.
                await new Promise(res => setTimeout(res, 250 + Math.random() * 300));
                setMessages(prev => [...prev, newMessage]);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            setMessages(prev => [...prev, { sender: 'system', text: `Error: ${errorMessage}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePlayerVote = async (votedName: string) => {
        if (gameState !== 'voting' || !playerCharacter || isLoading) return;

        setGameState('reveal');
        setIsLoading(true);
        setMessages(prev => [...prev, { sender: 'system', text: '투표가 집계 중입니다...' }]);

        try {
            const playerVote = { voter: playerCharacter.name, votedFor: votedName };
            const { votes: aiVotes, confession } = await getVoteAndConfession(characters, sabotage, messages, playerVote);
            
            // Validate AI votes to prevent duplicates or votes from inactive/player characters.
            const activeAiVoters = new Set(characters.filter(c => c.status === 'active' && !c.isPlayer).map(c => c.name));
            const seenVoters = new Set<string>();

            const validatedAiVotes = aiVotes.filter((vote: { voter: string; votedFor: string }) => {
                // Ensure the voter is an active AI and hasn't voted yet
                if (activeAiVoters.has(vote.voter) && !seenVoters.has(vote.voter)) {
                    seenVoters.add(vote.voter);
                    return true;
                }
                return false;
            });

            const allVotes = [playerVote, ...validatedAiVotes];

            const currentTally: { [key: string]: number } = {};
            characters.forEach(c => { currentTally[c.name] = 0; });
            
            // Simulate vote reveal with correct animation
            for (const vote of allVotes) {
                await new Promise(res => setTimeout(res, 600));
                currentTally[vote.votedFor] = (currentTally[vote.votedFor] || 0) + 1;
                setCharacters(prev => prev.map(c => ({...c, votes: currentTally[c.name] || 0 })));
                setMessages(prev => [...prev, { sender: 'system', text: `${vote.voter}님이 ${vote.votedFor}님을 지목했습니다.` }]);
            }
            
            await new Promise(res => setTimeout(res, 1500));

            // Determine result
            const voteCounts = Object.values(currentTally);
            const maxVotes = Math.max(0, ...voteCounts);
            const candidatesForElimination = Object.keys(currentTally).filter(name => currentTally[name] === maxVotes && maxVotes > 0);
            const isPlayerTheVillain = playerCharacter.isVillain;

            if (candidatesForElimination.length > 1) {
                // TIE -> Villain wins
                setMessages(prev => [...prev, { 
                    sender: 'system', 
                    text: `투표가 동점으로 끝났습니다! 빌런을 특정하지 못했으므로, 시민들의 패배입니다...`,
                    isSpecial: true 
                }]);
                await new Promise(res => setTimeout(res, 2000));
                
                setMessages(prev => [
                    ...prev,
                    { sender: 'system', text: `진짜 빌런은 ${villain?.name}이었습니다!`, isSpecial: true },
                    { sender: villain!.name, text: `[자백] ${confession}` }
                ]);
                setGameState(isPlayerTheVillain ? 'game_over_win' : 'game_over_loss');

            } else if (candidatesForElimination.length === 1) {
                // ONE person voted out
                const votedOutName = candidatesForElimination[0];
                const votedOutCharacter = characters.find(c => c.name === votedOutName)!;
                
                setCharacters(prev => prev.map(c => c.name === votedOutName ? { ...c, status: 'voted_out' } : c));
                setMessages(prev => [...prev, { sender: 'system', text: `투표 결과, ${votedOutName}님이 가장 많은 표를 받아 해고되었습니다...` }]);
                
                await new Promise(res => setTimeout(res, 2000));
                
                const wasVillainCaught = votedOutCharacter.isVillain;

                if (wasVillainCaught) {
                    // --- WIN CONDITION: VILLAIN CAUGHT ---
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
                    // --- INNOCENT VOTED OUT ---
                    if (votedOutCharacter.isPlayer) {
                        // Player is innocent but got voted out -> Game over for player (Loss)
                        const finalMessage = `안타깝네요... 당신은 빌런이 아니었지만, 동료들에게 지목당했습니다. 진짜 빌런은 ${villain?.name}이었습니다!`;
                        setMessages(prev => [
                            ...prev,
                            { sender: 'system', text: finalMessage, isSpecial: true },
                            { sender: villain!.name, text: `[자백] ${confession}` }
                        ]);
                        setGameState('game_over_loss');
                        return;
                    }

                    const remainingCount = characters.filter(c => c.status === 'active').length - 1; // -1 for the person just voted out

                    if (remainingCount <= 2) {
                        // --- LOSS CONDITION: 1v1 REACHED ---
                        const finalMessage = `안타깝네요... ${votedOutName}은(는) 빌런이 아니었습니다. 이제 ${remainingCount}명만 남아 빌런의 승리로 끝났습니다. 진짜 빌런은 ${villain?.name}이었습니다!`;
                        setMessages(prev => [
                            ...prev,
                            { sender: 'system', text: finalMessage, isSpecial: true },
                            { sender: villain!.name, text: `[자백] ${confession}` }
                        ]);
                        setGameState(isPlayerTheVillain ? 'game_over_win' : 'game_over_loss');
                    } else {
                        // --- GAME CONTINUES ---
                        setMessages(prev => [...prev, {
                            sender: 'system',
                            text: `...하지만 ${votedOutName}은(는) 빌런이 아니었습니다! 아직 빌런이 남아있습니다. 토론을 계속하세요...`,
                            isSpecial: true
                        }]);
                        setCharacters(prev => prev.map(c => ({...c, votes: 0}))); // Reset votes for next round
                        setGameState('discussion');
                    }
                }
            } else { // 0 votes or no one voted out -> Villain wins
                 setMessages(prev => [...prev, { 
                    sender: 'system', 
                    text: '아무도 지목되지 않았습니다. 빌런을 잡지 못했으므로, 시민들의 패배입니다...' ,
                    isSpecial: true
                }]);
                await new Promise(res => setTimeout(res, 2000));
                 setMessages(prev => [
                    ...prev,
                    { sender: 'system', text: `진짜 빌런은 ${villain?.name}이었습니다!`, isSpecial: true },
                    { sender: villain!.name, text: `[자백] ${confession}` }
                ]);
                setGameState(isPlayerTheVillain ? 'game_over_win' : 'game_over_loss');
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
                        <p className="text-slate-500 mt-4 text-lg h-6">
                            {loadingMessage}
                        </p>
                    </div>
                );
            
            case 'discussion':
            case 'voting':
            case 'reveal':
            case 'game_over_win':
            case 'game_over_loss':
                return (
                    <div className="flex flex-row h-full w-full gap-4 p-4">
                        {(gameState === 'game_over_win' || gameState === 'game_over_loss') && <GameOverAnimations gameState={gameState} />}
                        {/* Left Panel: Characters */}
                        <div className="w-1/3 lg:w-1/4 bg-white p-4 rounded-xl shadow-lg overflow-y-auto">
                            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b-2 border-slate-300 pb-2">팀원 목록</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {characters.map(char => (
                                    <CharacterCard 
                                        key={char.name} 
                                        character={char} 
                                        onVote={handlePlayerVote}
                                        isVotingPhase={gameState === 'voting'}
                                        isVoteDisabled={gameState !== 'voting' || isLoading}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Right Panel: Chat */}
                        <div className="w-2/3 lg:w-3/4 flex flex-col bg-white rounded-xl shadow-lg min-h-0">
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