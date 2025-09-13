import { GoogleGenAI, Type } from "@google/genai";
import type { Character, Message } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const gameSetupSchema = {
    type: Type.OBJECT,
    properties: {
        characters: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    position: { type: Type.STRING },
                    personality: { type: Type.STRING },
                    isVillain: { type: Type.BOOLEAN },
                    imageUrl: { 
                        type: Type.STRING,
                        description: "A simple, one-or-two-word English description for a pixel art avatar (e.g., 'Smiling Woman', 'Grumpy Cat', 'Tired Manager'). This will be used as a seed for an image generation URL."
                    },
                },
                required: ["name", "position", "personality", "isVillain", "imageUrl"],
            },
        },
        sabotage: { 
            type: Type.STRING,
            description: "A creative, funny, and specific office sabotage scenario caused by the villain, in Korean.",
        },
        sabotageIconSeed: {
            type: Type.STRING,
            description: "A single, simple English noun that represents the sabotage, to be used as a seed for a simple icon. For example, if the sabotage is 'spilled coffee', a good seed would be 'coffee'. If it's 'replaced the CEO's portrait with a cat', a good seed would be 'cat'. If it's 'changed the ringtone to a trot song', a good seed would be 'music'."
        }
    },
    required: ["characters", "sabotage", "sabotageIconSeed"],
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


export const setupGame = async (): Promise<{ characters: Omit<Character, 'status' | 'isPlayer' | 'votes'>[]; sabotage: string; sabotageIconSeed: string; }> => {
    const prompt = `
        You are the game master for a Korean office-themed mafia game called '오피스 빌런' (Office Villain). Your goal is to create a fun and engaging scenario.
        1.  **Create 5 unique characters:**
            *   They must be distinct and memorable Korean office workers.
            *   Give each a Korean name, a specific job position (e.g., 'UX/UI 디자이너', '재무팀장'), and a strong, funny persona.
            *   For each character, provide a simple, one-or-two-word English description for a pixel art avatar (e.g., 'Smiling Woman', 'Grumpy Cat', 'Tired Manager') in the 'imageUrl' field. This will be used as a seed for an image.
            *   **Persona examples**: A super-caffeinated, overly-enthusiastic intern; a cynical, close-to-retirement manager who has seen it all; a tech wizard who only speaks in jargon; a bubbly HR person who loves team-building exercises. Be creative!
        2.  **Secretly designate ONE as the 'Villain'**: Set 'isVillain' to true for one character. The others must be false.
        3.  **Create a realistic and passive-aggressive office sabotage scenario**: The scenario must be in Korean. It should reflect something a real "office villain" might do to subtly annoy colleagues or disrupt work.
            *   Also provide a single, simple English noun for a simple icon representing the sabotage in the 'sabotageIconSeed' field.
            *   **Examples**: Sabotage: "사내 익명 게시판에 누군가 '퇴사하면 모든 게 편해져요'라는 글을 올렸습니다." -> sabotageIconSeed: "chat". Sabotage: "중요한 클라이언트 미팅 직전, 회의실 예약이 '팀 단합의 시간'이라는 이름으로 갑자기 변경되었습니다." -> sabotageIconSeed: "calendar". Sabotage: "사무실 공용 냉장고에 있던 모든 음료수 라벨이 '맹물'로 교체되었습니다." -> sabotageIconSeed: "water".
        4.  Return the result in a valid JSON format that matches the provided schema. Do not include any text outside the JSON structure.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: gameSetupSchema,
            },
        });

        const jsonString = response.text;
        const data = JSON.parse(jsonString);
        
        return { characters: data.characters, sabotage: data.sabotage, sabotageIconSeed: data.sabotageIconSeed };
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