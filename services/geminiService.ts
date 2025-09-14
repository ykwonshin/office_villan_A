import { GoogleGenAI, Type } from "@google/genai";
import type { Character, Message } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// A single, optimized schema to generate the entire game setup in one go.
const gameSetupSchema = {
    type: Type.OBJECT,
    properties: {
        sabotage: {
            type: Type.STRING,
            description: "A creative, funny, and specific office sabotage scenario caused by the villain, in Korean. This text must be suitable for displaying as an alert.",
        },
        sabotageImagePrompt: {
            type: Type.STRING,
            description: "A detailed prompt in English for an image generation AI to create the main scene. It must describe a cute, bright retro pixel art scene depicting the sabotage and include all the characters defined below, with their specific appearances and reactions."
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
                    portraitPrompt: {
                        type: Type.STRING,
                        description: "A detailed prompt in English to generate a unique pixel art portrait for this character. e.g., 'A cute, expressive, retro pixel art portrait of a Korean office worker, a woman with orange hair in a bun and glasses, looking shocked. Bust shot, plain background.'"
                    },
                },
                required: ["name", "position", "personality", "isVillain", "portraitPrompt"],
            },
        },
    },
    required: ["sabotage", "sabotageImagePrompt", "characters"],
};


const characterResponseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING },
            response: { type: Type.STRING }
        },
        required: ["name", "response"]
    }
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
    characters: (Omit<Character, 'status' | 'isPlayer' | 'votes' | 'imageUrl' | 'isVillain'> & { isVillain: boolean; portraitPrompt: string; })[];
    sabotage: string;
    sabotageImagePrompt: string;
}> => {
    try {
        const setupPrompt = `
            You are the game master for '오피스 빌런' (Office Villain). Your goal is to create a complete and cohesive scenario in one go.
            1.  **Create a Sabotage Scenario**: Invent a creative, funny, and specific office sabotage scenario in Korean. It should be from a neutral, third-person perspective (e.g., "누군가..."). Be creative! The event could be anything from a classic prank to a weird, unexplainable occurrence. For example: "누군가 탕비실 커피머신 원두를 전부 디카페인으로 바꿔놓았다." (Someone replaced all the beans in the office coffee machine with decaf.), "누군가 대표님 의자를 어린이용 뿡뿡이 의자로 바꿔치기했다." (Someone swapped the CEO's chair with a children's squeaky chair.), or "누군가 사내게시판에 '퇴사하면 모든게 편해.. 퇴사해..' 라는 익명의 글을 올렸다." (Someone anonymously posted 'If you quit, everything becomes comfortable.. quit..' on the company bulletin board.).
            2.  **Create Characters**: Create 4-5 distinct Korean office workers. For each character:
                *   Assign a unique name, job position, and a very short, one-phrase personality in Korean.
                *   Secretly designate ONLY ONE character as the villain ('isVillain: true').
                *   Provide a detailed visual description (hair, clothes, expression).
            3.  **Create Main Image Prompt**: Write a detailed prompt in English for a cute, bright retro pixel art image. This prompt MUST:
                *   Describe the sabotage scene from step 1.
                *   Incorporate ALL characters from step 2, using their specific visual descriptions and describing their reactions.
                *   CRITICAL: The image must be purely visual. Do NOT include any letters, words, or text in the image, regardless of the language.
            4.  **Create Portrait Prompts**: For EACH character from step 2, write a separate, detailed prompt in English to generate their individual portrait. The prompt must be for a "cute, expressive, retro pixel art portrait... bust shot, plain background" and be based on their visual description.
            5.  **Return as JSON**: Format the entire output as a single JSON object conforming to the provided schema.
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

        return {
            sabotage: gameData.sabotage,
            sabotageImagePrompt: gameData.sabotageImagePrompt,
            characters: gameData.characters
        };

    } catch (error) {
        console.error("Error setting up game (text-generation phase):", error);
        throw new Error("Failed to initialize the game with the AI. Please check your API key and network connection.");
    }
};

export const generateSabotageImage = async (prompt: string): Promise<string | null> => {
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
        console.warn("Could not generate sabotage image, likely due to API quota. Continuing without it.", imageError);
        return null;
    }
};

export const generateCharacterPortraits = async (prompts: string[]): Promise<(string | null)[]> => {
    if (!prompts || prompts.length === 0) return [];
    try {
        const imageGenerationPromises = prompts.map(prompt => 
            ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                  numberOfImages: 1,
                  outputMimeType: 'image/png',
                  aspectRatio: '1:1',
                },
            })
        );
        const allImageResponses = await Promise.all(imageGenerationPromises);

        return allImageResponses.map(response => {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        });
    } catch (imageError) {
        console.warn("Could not generate character portraits, likely due to API quota. Continuing without them.", imageError);
        return Array(prompts.length).fill(null);
    }
};


export const getCharacterResponses = async (
    userInput: string,
    characters: Character[],
    sabotage: string,
    chatHistory: Message[],
    playerCharacterName: string
): Promise<{ name: string; response: string }[]> => {
    const activeAICharacters = characters.filter(c => c.status === 'active' && c.name !== playerCharacterName);
    const characterDescriptions = characters.filter(c => c.status === 'active').map(c => 
        `- ${c.name} (${c.position}): ${c.personality}. ${c.isVillain ? "This character is the villain. They must act deceptively and try to shift blame." : "This character is innocent and genuinely trying to find the villain."}`
    ).join('\n');

    const history = chatHistory.slice(-6).map(m => `${m.sender}: ${m.text}`).join('\n');

    const prompt = `
        You are roleplaying as multiple characters in the game 'Office Villain'.
        
        **Scenario:** "${sabotage}"
        
        **Characters:**
        ${characterDescriptions}
        
        **Recent Conversation:**
        ${history}

        **The Player (${playerCharacterName})'s latest message:** "${userInput}"

        **Your Task:**
        Generate a response in Korean for each active AI character (${activeAICharacters.map(c => c.name).join(', ')}).
        - **CRITICAL RULE:** Each response MUST be very short, 1 or 2 sentences at most.
        - The responses must be strongly in-character, reflecting their unique personas.
        - The villain's response should be subtle and deceptive. Innocent characters should respond genuinely.
        - Provide the response as a JSON array.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: characterResponseSchema,
            },
        });
        const jsonString = response.text;
        return JSON.parse(jsonString);
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