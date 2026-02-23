// register.js
// Run with: DISCORD_APP_ID=xxx DISCORD_BOT_TOKEN=xxx node register.js

const appId = process.env.DISCORD_APP_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!appId || !token) {
    console.error('❌ Missing environment variables. Please set DISCORD_APP_ID and DISCORD_BOT_TOKEN');
    process.exit(1);
}

const url = `https://discord.com/api/v10/applications/${appId}/commands`;

const sharedOptions = [
    {
        name: 'user',
        description: 'Tag a specific person for smoketime',
        type: 6, // 6 = USER type
        required: false,
    },
];

const commands = [
    {
        name: 'smoketime',
        description: 'Initiate the smoke signal',
        type: 1, // 1 = CHAT_INPUT (Slash Command)
        options: sharedOptions,
    },
    {
        name: 'smoke',
        description: 'Quick smoke break request',
        type: 1, // 1 = CHAT_INPUT (Slash Command)
        options: sharedOptions,
    },
];

async function register() {
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
    });

    if (response.ok) {
        console.log('✅ Commands "/smoketime" and "/smoke" registered successfully!');
    } else {
        const data = await response.json();
        console.error('❌ Error registering command:', JSON.stringify(data, null, 2));
    }
}

register();
