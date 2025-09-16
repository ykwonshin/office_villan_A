import { GoogleGenAI, Type } from "@google/genai";
import type { Character, Message } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const gameSetupSchema = {
    type: Type.OBJECT,
    properties: {
        sabotage: {
            type: Type.STRING,
            description: "A creative, funny, and specific office sabotage scenario in Korean. This text must be suitable for displaying as an alert.",
        },
        characters: {
            type: Type.ARRAY,
            description: "An array of 4-5 office worker characters.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "A unique Korean name for the character." },
                    position: { type: Type.STRING, description: "The character's job position." },
                    personality: {
                        type: Type.STRING,
                        description: "A very short, one-phrase personality description in Korean (e.g., '늘 의욕이 넘치는', '매사에 시니컬한')."
                    },
                    isVillain: { type: Type.BOOLEAN, description: "Designates if this character is the hidden villain. Only one can be true." },
                    visualDescription: {
                        type: Type.STRING,
                        description: "A short visual description in English for the portrait (e.g., 'a woman with orange hair in a bun and glasses, looking shocked'). This will be used to generate a pixel art portrait."
                    },
                },
                required: ["name", "position", "personality", "isVillain", "visualDescription"],
            },
        },
    },
    required: ["sabotage", "characters"],
};

const voteAndConfessionSchema = {
    type: Type.OBJECT,
    properties: {
        votes: {
            type: Type.ARRAY,
            description: "An array of vote objects, one for each AI character.",
            items: {
                type: Type.OBJECT,
                properties: {
                    voter: { type: Type.STRING, description: "The name of the AI character who is voting." },
                    votedFor: { type: Type.STRING, description: "The name of the character they are voting for." }
                },
                required: ["voter", "votedFor"]
            }
        },
        confession: {
            type: Type.STRING,
            description: "The secret confession of the true villain, explaining their motive for the sabotage. This should be in Korean."
        }
    },
    required: ["votes", "confession"]
};

export const generateGameSetupText = async (): Promise<{
    characters: (Omit<Character, 'status' | 'isPlayer' | 'votes' | 'imageUrl' | 'isVillain'> & { isVillain: boolean; portraitPrompt: string; visualDescription: string; })[];
    sabotage: string;
}> => {
    try {
        const setupPrompt = `
            You are the game master for '오피스 빌런' (Office Villain). Your goal is to create a scenario optimized for speed.
            1.  **Create a Sabotage Scenario**:
                *   Invent a creative, funny, yet **plausible** office sabotage scenario in Korean. The key is realism - it should be something that could actually happen in a modern office.
                *   **CRITICAL: AVOID BORING or OVERLY FANTASY THEMES.** Do **NOT** use scenarios involving: the pantry, the break room, coffee, snacks, or physical damage.
                *   **INSTEAD, FOCUS ON RELATABLE OFFICE PRANKS & MISHAPS:** Use ideas like:
                    *   "누군가 사내 게시판에 '퇴사하면 모든 게 편해져요'라는 익명의 글을 올렸습니다." (Someone anonymously posted 'Resigning makes everything easier' on the company bulletin board.)
                    *   "누군가 모든 사무실 의자의 높이를 최저로 낮춰놓았습니다." (Someone lowered all the office chairs to their minimum height.)
                    *   "누군가 회의실 예약 시스템에 'CEO님과의 비밀 티타임' 같은 가짜 예약을 잔뜩 잡아놓았습니다." (Someone filled the meeting room booking system with fake appointments like 'Secret Tea Time with the CEO'.)
                    *   "누군가 회사 공용 프린터의 기본 폰트를 '궁서체'로 바꿔놓았습니다." (Someone changed the default font on the company printer to 'Gungseo'.)
                *   The description must be from a neutral, third-person perspective (e.g., "누군가...").
            2.  **Create Characters**: Create 4-5 distinct Korean office workers. For each character:
                *   Assign a unique name, job position, and a very short, one-phrase personality in Korean.
                *   Secretly designate ONLY ONE character as the villain ('isVillain: true').
                *   Provide a short visual description in English for their portrait (e.g., "a man with black hair and a mustache, looking nervous").
            3.  **Return as JSON**: Format the entire output as a single JSON object conforming to the provided schema. You only need to provide the sabotage description and the character list.
        `;

        const setupGenResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: setupPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: gameSetupSchema,
            },
        });
        const gameData = JSON.parse(setupGenResponse.text);

        const charactersWithPrompts = gameData.characters.map((char: any) => {
            const fullPrompt = `A simple, low-resolution, 64x64 retro pixel art portrait of a Korean office worker, ${char.visualDescription}. Bust shot, plain background.`;
            return {
                ...char,
                portraitPrompt: fullPrompt,
            };
        });

        return {
            sabotage: gameData.sabotage,
            characters: charactersWithPrompts,
        };

    } catch (error) {
        console.error("Error setting up game (text-generation phase):", error);
        throw new Error("Failed to initialize the game with the AI. Please check your API key and network connection.");
    }
};

export const generatePixelArtImage = async (prompt: string): Promise<string | null> => {
    if (!prompt) return null;
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '1:1',
            },
        });
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        return `data:image/png;base64,${base64ImageBytes}`;
    } catch (imageError) {
        console.warn("Could not generate a pixel art image, likely due to API quota. Continuing without it.", imageError);
        return null;
    }
};

export async function* getCharacterResponses(
    userInput: string,
    characters: Character[],
    sabotage: string,
    chatHistory: Message[],
    playerCharacterName: string
): AsyncGenerator<{ name: string; response: string }> {
    const activeAICharacters = characters.filter(c => c.status === 'active' && c.name !== playerCharacterName);
    const characterDescriptions = characters.filter(c => c.status === 'active').map(c => 
        `- ${c.name} (${c.position}): ${c.personality}. ${c.isVillain ? "This character is the villain. They must act deceptively and try to shift blame." : "This character is innocent and genuinely trying to find the villain."}`
    ).join('\n');

    const history = chatHistory.slice(-6).map(m => `${m.sender}: ${m.text}`).join('\n');

    const prompt = `
        You are roleplaying as multiple characters in the game 'Office Villain'. Your primary goal is to generate dialogue that contains subtle clues and red herrings, allowing the player to deduce the villain's identity.

        **Scenario:** "${sabotage}"

        **Characters:**
        ${characterDescriptions}

        **Recent Conversation:**
        ${history}

        **The Player (${playerCharacterName})'s latest message:** "${userInput}"

        **Your Task:**
        Generate a response in Korean for each active AI character (${activeAICharacters.map(c => c.name).join(', ')}).
        - **Crucial:** Responses must be deeply in-character and reflect their unique personas and goals.
        - **Keep responses concise and conversational**, typically 1-3 sentences.
        - **React directly** to the player's message and the preceding conversation history.
        - **OUTPUT FORMAT:** For each character, output a single, valid JSON object on its own line, followed by a newline. Do NOT use a JSON array or markdown backticks.
        
        **Example Output Format:**
        {"name": "김대리", "response": "정말요? 저는 몰랐네요."}
        {"name": "박과장", "response": "이건 분명 계획된 일이야..."}

        **Character-Specific Instructions:**
        - **If you are the VILLAIN:** Deceive with subtle tactics like misdirection, feigned surprise, or a weak alibi.
        - **If you are INNOCENT:** Help uncover the truth by asking pointed questions, offering theories, or stating observations.
    `;

    try {
        const responseStream = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        let buffer = '';
        for await (const chunk of responseStream) {
            buffer += chunk.text;
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);
                if (line) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.name && parsed.response) {
                            yield parsed;
                        }
                    } catch (e) {
                        console.warn("Could not parse JSON line from stream:", line, e);
                    }
                }
            }
        }
        if (buffer.trim()) {
            try {
                const parsed = JSON.parse(buffer.trim());
                 if (parsed.name && parsed.response) {
                    yield parsed;
                }
            } catch (e) {
                console.warn("Could not parse final JSON from stream buffer:", buffer.trim(), e);
            }
        }

    } catch (error) {
        console.error("Error getting character responses:", error);
        throw new Error("The AI colleagues are busy with the sabotage and couldn't respond. Please try again.");
    }
};

export const getVoteAndConfession = async (
    characters: Character[],
    sabotage: string,
    chatHistory: Message[],
    playerVote: { voter: string; votedFor: string }
): Promise<{ votes: { voter: string; votedFor: string }[], confession: string }> => {
    const activeAICharacters = characters.filter(c => c.status === 'active' && !c.isPlayer);
    const villain = characters.find(c => c.isVillain);
    const characterDescriptions = characters.map(c => 
        `- ${c.name} (${c.position}): ${c.personality}. ${c.isVillain ? "Is the VILLAIN." : "Is INNOCENT."}`
    ).join('\n');
    const history = chatHistory.slice(-10).map(m => `${m.sender}: ${m.text}`).join('\n');

    if (!villain) {
        throw new Error("Game error: Villain not found.");
    }

    const prompt = `
        You are the game master for 'Office Villain'. The discussion is over, and it's time to vote.
        
        **Scenario:** "${sabotage}"
        **Characters:**
        ${characterDescriptions}
        **Conversation Summary:**
        ${history}

        The player, **${playerVote.voter}**, has voted for **${playerVote.votedFor}**.

        **Your Tasks:**
        1.  **Simulate AI Votes:** For each of the other active characters (${activeAICharacters.map(c => c.name).join(', ')}), decide who they will vote for. Their vote should be a logical (but not perfect) guess based on the conversation. An AI character will not vote for themselves.
        2.  **Write the Villain's Confession:** Write a short, creative confession in Korean from the true villain, **${villain.name}**. The confession must explain the funny or absurd reason *why* they committed the sabotage: "${sabotage}".
        3.  **Return JSON:** Provide the AI votes and the villain's confession in the specified JSON format. Ensure the names in the 'votes' array are spelled correctly.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: voteAndConfessionSchema,
            },
        });
        const jsonString = response.text.trim();
        const data = JSON.parse(jsonString);
        // Ensure the AI didn't return null or invalid data
        if (!data.votes || !data.confession) {
            throw new Error("AI returned incomplete data.");
        }
        return data;
    } catch (error) {
        console.error("Error getting vote results:", error);
        throw new Error("The AI colleagues are too stressed to vote. Try again.");
    }
};