import { GoogleGenAI, Type } from "@google/genai";
import type { Character, Message } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schema for the first call: generating the scene
const sceneGenerationSchema = {
    type: Type.OBJECT,
    properties: {
        sabotage: { 
            type: Type.STRING,
            description: "A creative, funny, and specific office sabotage scenario caused by the villain, in Korean. This text must be suitable for displaying as an alert.",
        },
        sabotageImagePrompt: {
            type: Type.STRING,
            description: "A detailed prompt in English for an image generation AI. The prompt must describe a cute, bright retro pixel art scene depicting the sabotage. It should feature 4-5 distinct and expressive office worker characters reacting to the situation. If the sabotage involves specific text (like a changed folder name), the prompt MUST instruct the AI to include that EXACT Korean text in the image."
        }
    },
    required: ["sabotage", "sabotageImagePrompt"],
};

// Schema for the second call: extracting characters from the generated image
const characterExtractionSchema = {
    type: Type.OBJECT,
    properties: {
        characters: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "A unique Korean name for the character." },
                    position: { type: Type.STRING, description: "The character's job position." },
                    personality: { 
                        type: Type.STRING, 
                        description: "A very short, one-phrase personality description in Korean (e.g., '늘 의욕이 넘치는', '매사에 시니컬한')." 
                    },
                    isVillain: { type: Type.BOOLEAN },
                    imageDescription: { 
                        type: Type.STRING,
                        description: "A detailed visual description in English of this specific character, based on their appearance in the provided image. This will be used to generate a unique portrait avatar. Describe their hair, expression, clothing, and any distinguishing features. e.g., 'A pixel art portrait of the woman with orange hair in a bun and glasses, looking shocked, wearing a yellow blouse.'"
                    },
                },
                required: ["name", "position", "personality", "isVillain", "imageDescription"],
            },
        },
    },
    required: ["characters"],
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


export const setupGame = async (): Promise<{ characters: Omit<Character, 'status' | 'isPlayer' | 'votes'>[]; sabotage: string; sabotageImageUrl: string; }> => {
    try {
        // Part 1: Generate the sabotage scenario and the prompt for its image.
        const scenePrompt = `
            You are the game master for '오피스 빌런' (Office Villain). Your goal is to create a fun and engaging scenario.
            1.  **Create a realistic and passive-aggressive office sabotage scenario**: The scenario must be in Korean. It should reflect something a real "office villain" might do. The description must be from a neutral, third-person perspective, like an alert, using phrases like '누군가' (someone).
                *   **Examples**: "사내 익명 게시판에 누군가 '퇴사하면 모든 게 편해져요'라는 글을 올렸습니다.", "팀 프로젝트 마감 직전, 공용 클라우드 드라이브의 모든 폴더 이름이 '여긴 어디? 나는 누구?'로 바뀌어 버렸습니다."
            2.  **Create a detailed Image Prompt for the scenario**: Based on the sabotage scenario, create a concise, descriptive prompt in English for an image generation AI.
                *   **Style:** The style must be cute and bright retro pixel art, featuring cute pixel characters.
                *   **Content:** The prompt must describe a scene with 4 to 5 distinct and expressive Korean office worker characters reacting to the sabotage.
                *   **Text Integration:** This is critical. If the sabotage involves specific text (like a bulletin board post or a changed folder name), the prompt MUST instruct the AI to include that EXACT Korean text in the image. For example, for "폴더 이름이 '여긴 어디? 나는 누구?'로 바뀌었습니다", the prompt MUST contain instructions like "The screens prominently display the Korean text '여긴 어디? 나는 누구?'".
            3.  Return the result in a valid JSON format.
        `;

        const sceneGenResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: scenePrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: sceneGenerationSchema,
            },
        });
        const sceneData = JSON.parse(sceneGenResponse.text);
        const { sabotage, sabotageImagePrompt } = sceneData;

        // Part 2: Generate the main sabotage image.
        const sabotageImageResponse = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: sabotageImagePrompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '1:1',
            },
        });
        const sabotageImageBytes = sabotageImageResponse.generatedImages[0].image.imageBytes;
        const sabotageImageUrl = `data:image/png;base64,${sabotageImageBytes}`;
        
        // Part 3: Use the generated image to create characters.
        const characterExtractionPrompt = `
            You are a game master for 'Office Villain'. An incident has occurred, and this image depicts the scene. Your task is to define the characters based on the people in this image.
            1.  **Analyze the Image:** Carefully observe each distinct character in the provided image.
            2.  **Create Characters:** For each character you identify, create the following:
                *   A unique Korean name and a plausible job position.
                *   A **very short, one-phrase personality description** in Korean (e.g., '늘 의욕이 넘치는', '매사에 시니컬한', '농담을 좋아하는'). Keep it concise for readability.
                *   A detailed 'imageDescription' in English. This must be a visual description of THAT specific character from the image, to be used for generating a separate portrait. Describe their appearance (hair, clothes, expression) accurately.
            3.  **Assign the Villain:** Secretly designate ONLY ONE of these characters as the 'Villain' by setting 'isVillain' to true. All others must be false.
            4.  **Format as JSON:** Return a JSON object that strictly follows the provided schema. Ensure you identify all main characters in the image.
        `;

        const imagePart = {
            inlineData: {
                mimeType: 'image/png',
                data: sabotageImageBytes,
            },
        };

        const characterGenResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: characterExtractionPrompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: characterExtractionSchema,
            },
        });

        const characterData = JSON.parse(characterGenResponse.text);
        const extractedCharacters = characterData.characters;

        // Part 4: Generate individual character portraits based on the descriptions.
        const characterImagePromises = extractedCharacters.map((char: any) => {
            const characterPrompt = `A cute, expressive, retro pixel art portrait of a Korean office worker. ${char.imageDescription}. Bust shot, plain background, 1:1 aspect ratio.`;
            return ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: characterPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: '1:1',
                }
            });
        });

        const characterImageResponses = await Promise.all(characterImagePromises);
        
        const charactersWithImages = extractedCharacters.map((char: any, index: number) => {
            const { imageDescription, ...restOfChar } = char;
            const base64ImageBytes: string = characterImageResponses[index].generatedImages[0].image.imageBytes;
            return {
                ...restOfChar,
                imageUrl: `data:image/png;base64,${base64ImageBytes}`
            };
        });

        return { characters: charactersWithImages, sabotage, sabotageImageUrl };

    } catch (error) {
        console.error("Error setting up game:", error);
        throw new Error("Failed to initialize the game with the AI. Please check your API key and network connection.");
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