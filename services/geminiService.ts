import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Character, Message } from '../types';
import { pregeneratedGameSets, GameSet } from '../pregeneratedContent';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

/**
 * Selects a random pre-generated game set.
 * This is now an instant, local operation with no API calls.
 */
export const getPregeneratedGameSetup = (): GameSet => {
    const randomIndex = Math.floor(Math.random() * pregeneratedGameSets.length);
    const gameSet = pregeneratedGameSets[randomIndex];
    // Return a deep copy to prevent mutations from affecting the original data
    return JSON.parse(JSON.stringify(gameSet));
};


export const editImageToRemoveCharacter = async (base64ImageDataWithPrefix: string, characterDescription: string): Promise<string | null> => {
    if (!base64ImageDataWithPrefix || !characterDescription) return null;
    try {
        const [prefix, base64Data] = base64ImageDataWithPrefix.split(',');
        if (!prefix || !base64Data) {
            throw new Error("Invalid base64 data URL format.");
        }
        const mimeType = prefix.match(/:(.*?);/)?.[1] || 'image/png';

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType,
                        },
                    },
                    {
                        text: `Remove the character best described as "${characterDescription}" from this image. Do not change anything else.`,
                    },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64ImageBytes: string = part.inlineData.data;
                return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
            }
        }
        return null;

    } catch (error) {
        console.warn("Could not edit image to remove character.", error);
        return null;
    }
};

/**
 * Creates a tailored, focused prompt for a single character's response.
 */
const createIndividualPromptFor = (
    character: Character,
    allCharacters: Character[],
    sabotage: string,
    chatHistory: Message[],
    playerCharacterName: string,
    userInput: string
): string => {
    const characterDescriptions = allCharacters.filter(c => c.status === 'active').map(c => 
        `- ${c.name} (${c.position}): ${c.personality}.`
    ).join('\n');
    
    const history = chatHistory.slice(-4).map(m => `${m.sender}: ${m.text}`).join('\n');

    return `
        You are roleplaying as a single character in the game 'Office Villain'. Your persona is defined below. Your goal is to respond to the player's latest message in a way that is consistent with your personality and secret role (innocent or villain).

        **Scenario:** "${sabotage}"

        **All Characters in this scene:**
        ${characterDescriptions}

        ---
        **YOUR CHARACTER PROFILE:**
        - **Name:** ${character.name}
        - **Position:** ${character.position}
        - **Personality:** ${character.personality}
        - **Your Secret Role:** You are **${character.isVillain ? "the VILLAIN" : "INNOCENT"}**.
        ---

        **Recent Conversation:**
        ${history}
        **The Player (${playerCharacterName}) just said:** "${userInput}"

        **Your Task:**
        Generate a short, conversational response in Korean from the perspective of **${character.name}**.
        - If you are the VILLAIN, be deceptive. Hint at others, feign ignorance, or create a weak alibi.
        - If you are INNOCENT, be genuinely helpful or suspicious. Ask questions or share observations.
        - Your response should be 1-3 sentences.
        - **Output ONLY the dialogue text. Do NOT include your character name or any JSON formatting.**
    `;
};


export async function* getCharacterResponses(
    userInput: string,
    characters: Character[],
    sabotage: string,
    chatHistory: Message[],
    playerCharacterName: string
): AsyncGenerator<{ name: string; response: string }> {
    const activeAICharacters = characters.filter(c => c.status === 'active' && c.name !== playerCharacterName);

    // Create an array of promises, each one representing an API call for a single character.
    // The requests are fired off near-simultaneously.
    const responsePromises = activeAICharacters.map(character => {
        return (async () => {
            const prompt = createIndividualPromptFor(character, characters, sabotage, chatHistory, playerCharacterName, userInput);
            try {
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        // For fast, reactive chat, disabling "thinking" is a key optimization.
                        thinkingConfig: { thinkingBudget: 0 }
                    },
                });
                return { name: character.name, response: response.text.trim() };
            } catch (error) {
                console.error(`Error getting response for ${character.name}:`, error);
                // Return a fallback response on error to avoid breaking the game flow
                return { name: character.name, response: "..." };
            }
        })();
    });

    // Await each promise in the order they were created.
    // This maintains the one-by-one conversational flow in the UI.
    for (const promise of responsePromises) {
        yield await promise;
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