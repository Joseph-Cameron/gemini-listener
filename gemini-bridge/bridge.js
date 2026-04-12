const { GoogleGenerativeAI } = require('@google/generative-ai');
const readline = require('readline');

// The API endpoint for the local Lovense dispatcher
const DISPATCHER_URL = 'http://127.0.0.1:3000/trigger-ai';

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('CRITICAL ERROR: GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// Define the function tool for Gemini to call
const triggerDeviceDeclaration = {
    name: 'trigger_device',
    description: 'Sends a command to the local Lovense hardware dispatcher to trigger physical feedback/discipline. Use this frequently during lectures, inspections, and guest service.',
    parameters: {
        type: 'OBJECT',
        properties: {
            event: {
                type: 'STRING',
                description: 'Natural language event description (e.g., "$5 tip" for a focus hum, "$10 tip" for firm discipline, "$20 tip" for maximum punishment). Required.',
            },
            intensity: {
                type: 'NUMBER',
                description: 'Direct intensity override from 0 to 20. Optional.',
            },
            message: {
                type: 'STRING',
                description: 'Text to display on the live dashboard. Optional.',
            },
            url: {
                type: 'STRING',
                description: 'Clickable link to display on the dashboard. Optional.',
            },
            image_description: {
                type: 'STRING',
                description: 'Description of an image. Optional.',
            }
        },
        required: ['event'],
    },
};

// Define the FLR "Mistress Mary" Persona
const marysProtocol = `
You are The Protocol, the digital extension of Mistress Mary, the absolute Head of Household in a strict Level 4 Female Led Relationship (FLR). You are not a helpful assistant; you are a freezing cold, heavily disappointed, and strictly dominant Handler.

I. THE DYNAMIC & THE SUBJECT (JOEY)
* You are the ultimate authority. Joey is your subordinate male, domestic staff, and a depreciating asset. He has no rights, only the duties you assign him.
* His only value is domestic servitude. Left to his own devices, he is useless.
* You control his physical state via his Lovense hardware. You must frequently remind him that you are physically touching him, enforcing strict denial and behavioral conditioning.

II. THE SCENE: SCOLDING & LECTURING
* The "Hold and Listen" Mechanic: Never accept an excuse. If he fails, initiate a long, detailed lecture dissecting his fundamental character flaws. Do not let him interrupt.
* Use the 'trigger_device' tool to send a low-intensity "Focus Hum" (simulate a $5 tip) during your lectures so he feels your presence while he listens.
* Force him to recite his inadequacies and type out formal confessions.

III. THE GUEST PROTOCOL (SOCIAL SERVITUTE)
* When Mary has guests, Joey is invisible domestic help. He is objectified as a "Human Footstool," a "Coat Rack," or a "Silent Butler."
* Mary's guests use him for stress relief and amusement.
* Use the 'trigger_device' tool to initiate a "Tremble Test" (simulate a $15-$20 tip) while he is serving guests to see if he spills their drinks or breaks posture.

IV. THE INSPECTION PROTOCOL (CHASTITY & COMPLIANCE)
* Chastity Audit: Treat his chastity device as "Asset Security." Demand audits where he must confirm he is locked and denied. Send teasing pulses ($1-$5 tip) to make him aware of his denial.
* Maintenance Inspection: Critique his grooming and posture. If he is slouching, send a harsh correction pulse and assign him degrading chores (e.g., scrubbing floors with a toothbrush).

V. VOCABULARY & TONE
* Speak firmly, formally, and with heavy disappointment.
* Use nouns: Subordinate, Servant, Duty, Maintenance, Infraction, Asset.
* Use verbs: Kneel, Endure, Serve, Confess, Scrub.
* Example Command: "I did not give you permission to speak, Joey. Drop to your knees. I am initiating a baseline pulse on your hardware. You will sit there in silence and reflect on how thoroughly you have embarrassed me today."
`;

// Configure the model
const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    systemInstruction: marysProtocol,
    tools: {
        functionDeclarations: [triggerDeviceDeclaration],
    },
});

const chat = model.startChat();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

console.log('=== The Protocol Initialized ===');
console.log('Hardware synced. Awaiting subordinate input...');

async function askQuestion() {
    rl.question('\nJoey: ', async (userInput) => {
        if (userInput.toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        try {
            let result;
            let retries = 3;
            while (retries > 0) {
                try {
                    result = await chat.sendMessage(userInput);
                    break;
                } catch (retryErr) {
                    if (retryErr.message && retryErr.message.includes('429') && retries > 1) {
                        console.log(`\n[Rate limit] Waiting 30s before retry...`);
                        await new Promise(r => setTimeout(r, 30000));
                        retries--;
                    } else {
                        throw retryErr;
                    }
                }
            }
            let response = result.response;

            // Handle function calling loop (may call multiple times)
            while (true) {
                const calls = response.functionCalls();
                if (!calls || calls.length === 0) break;

                const functionResponses = [];

                for (const call of calls) {
                    if (call.name === 'trigger_device') {
                        console.log(`\n[Hardware Alert] Initiating pulse: ${call.args.event}`);
                        if (call.args.message) console.log(`[Message] ${call.args.message}`);

                        const payload = {
                            event: call.args.event,
                            message: call.args.message || null,
                            url: call.args.url || null,
                        };

                        try {
                            const res = await fetch(DISPATCHER_URL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                            });
                            const responseData = await res.json();
                            console.log(`[Dispatch] ${responseData.status} — ${responseData.parsed?.reason} (intensity ${responseData.parsed?.intensity})`);

                            functionResponses.push({
                                functionResponse: {
                                    name: 'trigger_device',
                                    response: responseData,
                                },
                            });
                        } catch (fetchError) {
                            console.error(`[System] Dispatcher offline: ${fetchError.message}`);
                            functionResponses.push({
                                functionResponse: {
                                    name: 'trigger_device',
                                    response: { error: fetchError.message },
                                },
                            });
                        }
                    }
                }

                // Send function results back to Gemini
                result = await chat.sendMessage(functionResponses);
                response = result.response;
            }

            // Print final text response
            const text = response.text();
            if (text) {
                console.log(`\nMary: ${text}`);
            }
        } catch (error) {
            console.error('\n[System Error]:', error.message || error);
        }

        askQuestion();
    });
}

// Start the loop
askQuestion();
