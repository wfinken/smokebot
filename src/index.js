import {
    verifyKey,
    InteractionType,
    InteractionResponseType,
    ButtonStyleTypes,
    MessageComponentTypes
} from 'discord-interactions';

export default {
    async fetch(request, env, ctx) {
        // 1. BLOCK BROWSER VISITS (Prevents 1101 in browser)
        if (request.method === 'GET') {
            return new Response('The SmokeBot is alive! But you must talk to it via Discord.', { status: 200 });
        }

        const signature = request.headers.get('x-signature-ed25519');
        const timestamp = request.headers.get('x-signature-timestamp');
        const body = await request.text(); // Read text ONCE

        // 2. VERIFY SIGNATURE
        if (!signature || !timestamp) {
            return new Response('Missing headers', { status: 401 });
        }

        if (!env.DISCORD_PUBLIC_KEY) {
            console.error("❌ Missing DISCORD_PUBLIC_KEY");
            return new Response('Missing Public Key', { status: 500 });
        }

        const publicKey = env.DISCORD_PUBLIC_KEY.trim(); // Ensure no whitespace
        const isValidRequest = await verifyKey(body, signature, timestamp, publicKey);
        if (!isValidRequest) {
            console.error("❌ Bad Request Signature");
            console.log("Signature:", signature);
            console.log("Timestamp:", timestamp);
            console.log("Body length:", body.length);
            return new Response('Bad request signature', { status: 401 });
        }

        const interaction = JSON.parse(body); // Parse the text we already have

        // --- THE FIX: HARDCODED PONG ---
        // We send a raw JSON response to ensure it is exactly what Discord expects.
        if (interaction.type === 1) { // 1 is InteractionType.PING
            console.log("🏓 Sending PONG");
            console.log("Interaction ID:", interaction.id);
            return Response.json({ type: 1 });
        }

        // 3. SLASH COMMANDS
        if (interaction.type === InteractionType.APPLICATION_COMMAND) {
            if (interaction.data.name === 'smoketime') {
                // Get the requester's ID to track through the flow
                const requesterId = interaction.member.user.id;

                // Check if a user was mentioned
                const mentionedUser = interaction.data.options?.find(opt => opt.name === 'user');
                let content = '🚬 **Smoke Break Requested!**';
                if (mentionedUser) {
                    content = `🚬 **Smoke Break Requested for <@${mentionedUser.value}>!**`;
                }
                content += ' \nWhat is the verdict?';

                return Response.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: content,
                        components: [
                            {
                                type: MessageComponentTypes.ACTION_ROW,
                                components: [
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_accept_${requesterId}`,
                                        label: 'Accept',
                                        style: ButtonStyleTypes.SUCCESS,
                                    },
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_deny_${requesterId}`,
                                        label: 'Deny',
                                        style: ButtonStyleTypes.DANGER,
                                    },
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_15_${requesterId}`,
                                        label: '15 Minutes',
                                        style: ButtonStyleTypes.SECONDARY,
                                    },
                                ],
                            },
                        ],
                    },
                });
            }
        }

        // 4. BUTTON CLICKS
        if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
            const customId = interaction.data.custom_id;
            const user = interaction.member.user.username;
            const userId = interaction.member.user.id;

            // Accept button (format: smoke_accept_<requesterId>)
            if (customId.startsWith('smoke_accept_')) {
                const requesterId = customId.split('_')[2];
                // Store both accepter's ID and requester's ID in OTW button: smoke_otw_<accepterId>_<requesterId>
                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `✅ **Accepted by ${user}!** \nLet's roll. Click below when you are heading out.`,
                        components: [
                            {
                                type: MessageComponentTypes.ACTION_ROW,
                                components: [
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_otw_${userId}_${requesterId}`,
                                        label: 'OTW 🏃',
                                        style: ButtonStyleTypes.PRIMARY,
                                    },
                                ],
                            },
                        ],
                    },
                });
            }

            // Deny button (format: smoke_deny_<requesterId>)
            if (customId.startsWith('smoke_deny_')) {
                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `🚫 **Denied by ${user}.** \nMaybe later!`,
                        components: [],
                    },
                });
            }

            // 15 Minutes button (format: smoke_15_<requesterId>)
            if (customId.startsWith('smoke_15_')) {
                const requesterId = customId.split('_')[2];
                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `⏰ **${user} needs 15 minutes.** \nHold tight!`,
                        components: [
                            {
                                type: MessageComponentTypes.ACTION_ROW,
                                components: [
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_accept_${requesterId}`,
                                        label: 'Accept Now',
                                        style: ButtonStyleTypes.SUCCESS,
                                    },
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_deny_${requesterId}`,
                                        label: 'Deny',
                                        style: ButtonStyleTypes.DANGER,
                                    },
                                ],
                            },
                        ],
                    },
                });
            }

            // OTW button (format: smoke_otw_<accepterId>_<requesterId>)
            if (customId.startsWith('smoke_otw_')) {
                const parts = customId.split('_');
                const accepterId = parts[2];
                const requesterId = parts[3];

                // Only allow the accepter to click OTW
                if (userId !== accepterId) {
                    return Response.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: `❌ Only the person who accepted can click OTW!`,
                            flags: 64, // Ephemeral message (only visible to the clicker)
                        },
                    });
                }

                // Show OTW acknowledgement button for the requester
                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `🏃 **${user} is On The Way!** \n<@${requesterId}>, acknowledge below!`,
                        components: [
                            {
                                type: MessageComponentTypes.ACTION_ROW,
                                components: [
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_otwack_${accepterId}_${requesterId}`,
                                        label: 'Copy That! 👍',
                                        style: ButtonStyleTypes.PRIMARY,
                                    },
                                ],
                            },
                        ],
                    },
                });
            }

            // OTW Acknowledgement button - opens a modal (format: smoke_otwack_<accepterId>_<requesterId>)
            if (customId.startsWith('smoke_otwack_')) {
                const parts = customId.split('_');
                const accepterId = parts[2];
                const requesterId = parts[3];

                // Only allow the requester to acknowledge
                if (userId !== requesterId) {
                    return Response.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: `❌ Only the person who requested can acknowledge!`,
                            flags: 64, // Ephemeral message (only visible to the clicker)
                        },
                    });
                }

                // Show modal for acknowledgement
                return Response.json({
                    type: 9, // MODAL response type
                    data: {
                        custom_id: `smoke_otwack_modal_${accepterId}_${requesterId}`,
                        title: '🏃 OTW Acknowledgement',
                        components: [
                            {
                                type: MessageComponentTypes.ACTION_ROW,
                                components: [
                                    {
                                        type: 4, // TEXT_INPUT type
                                        custom_id: 'ack_message',
                                        label: 'Quick response (optional)',
                                        style: 1, // Short text
                                        placeholder: 'e.g., "On my way too!" or "See you there!"',
                                        required: false,
                                        max_length: 100,
                                    },
                                ],
                            },
                        ],
                    },
                });
            }

            // Aqui button (format: smoke_aqui_<accepterId>)
            if (customId.startsWith('smoke_aqui_')) {
                const accepterId = customId.split('_')[2];

                // Only allow the accepter to click Aqui
                if (userId !== accepterId) {
                    return Response.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: `❌ Only the person who accepted can click Aqui!`,
                            flags: 64, // Ephemeral message (only visible to the clicker)
                        },
                    });
                }

                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `📍 **${user} is Aqui!** \nSession active. ☁️`,
                        components: [],
                    },
                });
            }
        }

        // 5. MODAL SUBMISSIONS
        if (interaction.type === 5) { // MODAL_SUBMIT type
            const customId = interaction.data.custom_id;
            const user = interaction.member.user.username;

            // OTW Acknowledgement modal (format: smoke_otwack_modal_<accepterId>_<requesterId>)
            if (customId.startsWith('smoke_otwack_modal_')) {
                const parts = customId.split('_');
                const accepterId = parts[3];

                // Get the optional message from the modal
                const ackMessage = interaction.data.components?.[0]?.components?.[0]?.value || '';

                let content = `👍 **${user} acknowledged!**`;
                if (ackMessage) {
                    content += ` _"${ackMessage}"_`;
                }
                content += ` \nClick when you have arrived.`;

                // Update the original message with Aqui button
                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: content,
                        components: [
                            {
                                type: MessageComponentTypes.ACTION_ROW,
                                components: [
                                    {
                                        type: MessageComponentTypes.BUTTON,
                                        custom_id: `smoke_aqui_${accepterId}`,
                                        label: 'Aqui! 📍',
                                        style: ButtonStyleTypes.SUCCESS,
                                    },
                                ],
                            },
                        ],
                    },
                });
            }
        }

        return new Response('Unknown Type', { status: 400 });
    },
};