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
            return new Response('Bad request signature', { status: 401 });
        }

        const interaction = JSON.parse(body);

        // HARDCODED PONG
        if (interaction.type === 1) { // 1 is InteractionType.PING
            console.log("🏓 Sending PONG");
            return Response.json({ type: 1 });
        }

        // 3. SLASH COMMANDS
        if (interaction.type === InteractionType.APPLICATION_COMMAND) {
            if (interaction.data.name === 'smoketime') {
                const requesterId = interaction.member.user.id;
                const mentionedArg = interaction.data.options?.find(opt => opt.name === 'user');
                let content = '🚬 **Smoke Break Requested!**';
                let targetId = null;

                if (mentionedArg) {
                    content = `🚬 **Smoke Break Requested for <@${mentionedArg.value}>!**`;
                    targetId = mentionedArg.value;
                }
                content += ' \nWhat is the verdict?';

                const components = [
                    {
                        type: MessageComponentTypes.BUTTON,
                        custom_id: `smoke_accept_${requesterId}_${targetId || 'none'}`,
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
                        custom_id: `smoke_reqtime_${requesterId}_${targetId || 'none'}`,
                        label: 'Request Time',
                        style: ButtonStyleTypes.SECONDARY,
                    },
                ];

                return Response.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: content,
                        components: [{
                            type: MessageComponentTypes.ACTION_ROW,
                            components: components
                        }],
                    },
                });
            }
        }

        // 4. BUTTON CLICKS & MODALS
        if (interaction.type === InteractionType.MESSAGE_COMPONENT || interaction.type === 5) { // 5 is MODAL_SUBMIT
            const customId = interaction.data.custom_id;
            const username = interaction.member.user.username;
            const userId = interaction.member.user.id;

            // --- REQUEST TIME (Button) -> MODAL ---
            if (customId.startsWith('smoke_reqtime_')) {
                const parts = customId.split('_');
                const requesterId = parts[2];
                const targetId = parts[3];

                return Response.json({
                    type: 9, // MODAL
                    data: {
                        custom_id: `smoke_modal_time_${requesterId}_${targetId}`,
                        title: 'Request Specific Time',
                        components: [{
                            type: MessageComponentTypes.ACTION_ROW,
                            components: [{
                                type: 4, // TEXT_INPUT
                                custom_id: 'time_input',
                                label: 'How much time? (e.g. 5m, 10m)',
                                style: 1, // SHORT
                                min_length: 1,
                                max_length: 20,
                                placeholder: '5 minutes',
                                required: true
                            }]
                        }]
                    }
                });
            }

            // --- MODAL SUBMISSION (Time Request) ---
            if (customId.startsWith('smoke_modal_time_') && interaction.type === 5) {
                const parts = customId.split('_');
                const originalRequesterId = parts[3];
                const originalTargetId = parts[4] !== 'none' ? parts[4] : null;

                const timeValue = interaction.data.components[0].components[0].value;

                // Who needs to accept this?
                // If the original target requested time, the original requester needs to accept.
                // If the original requester requested time (self-negotiation?), the target needs to accept.
                // For simplicity, let's just say the "other party" needs to accept.
                // If there was no specific target, anyone can accept.

                // We'll treat the person who submitted the modal as the "TimeRequester".
                // The person who needs to accept is the "Other".
                
                let content = `⏰ **${username} requests ${timeValue}.**`;
                let acceptBtnId = `smoke_accept_${originalRequesterId}_${userId}`; // Fallback logic

                if (userId === originalRequesterId && originalTargetId) {
                    content += ` <@${originalTargetId}>, does this work?`;
                    acceptBtnId = `smoke_accept_${userId}_${originalTargetId}`;
                } else if (userId === originalTargetId) {
                    content += ` <@${originalRequesterId}>, does this work?`;
                    acceptBtnId = `smoke_accept_${originalTargetId}_${originalRequesterId}`;
                } else {
                     content += ` Any takers?`;
                     acceptBtnId = `smoke_accept_${originalRequesterId}_${userId}`;
                }

                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: content,
                        components: [{
                            type: MessageComponentTypes.ACTION_ROW,
                            components: [
                                {
                                    type: MessageComponentTypes.BUTTON,
                                    custom_id: acceptBtnId,
                                    label: 'Accept Time',
                                    style: ButtonStyleTypes.SUCCESS,
                                },
                                {
                                    type: MessageComponentTypes.BUTTON,
                                    custom_id: `smoke_deny_${originalRequesterId}`,
                                    label: 'Deny',
                                    style: ButtonStyleTypes.DANGER,
                                }
                            ]
                        }]
                    }
                });
            }

            // --- ACCEPT ---
            if (customId.startsWith('smoke_accept_')) {
                const parts = customId.split('_');
                // The structure here is looser. We just need to capture who the two participants are.
                // Generally: smoke_accept_<PartnerA>_<PartnerB>
                // Whoever clicks it, becomes one of the confirmed participants effectively.
                
                const p1 = parts[2];
                const p2 = parts[3] !== 'none' ? parts[3] : userId;

                // We normalize by storing both IDs.
                // We don't strictly enforce who clicks "Accept" unless we want to lock it to the target.
                // Let's assume standard flow: If you aren't involved, you probably shouldn't click, but we won't strictly block for open requests.

                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `✅ **Accepted!** \nParticipants: <@${p1}> & <@${p2}>.\nEither of you can signal when you are On The Way.`,
                        components: [{
                            type: MessageComponentTypes.ACTION_ROW,
                            components: [{
                                type: MessageComponentTypes.BUTTON,
                                // Store both participants. We don't know who will click OTW yet.
                                custom_id: `smoke_otw_${p1}_${p2}`,
                                label: 'OTW 🏃',
                                style: ButtonStyleTypes.PRIMARY,
                            }]
                        }]
                    }
                });
            }

            // --- DENY ---
            if (customId.startsWith('smoke_deny_')) {
                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `🚫 **Denied by ${username}.** \nMaybe later!`,
                        components: [],
                    },
                });
            }

            // --- OTW (On The Way) ---
            if (customId.startsWith('smoke_otw_')) {
                const parts = customId.split('_');
                const u1 = parts[2];
                const u2 = parts[3];

                // Check if clicker is one of the participants
                if (userId !== u1 && userId !== u2) {
                     return Response.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: `❌ You are not part of this smoke break!`,
                            flags: 64
                        }
                    });
                }

                // Identify the "Other" user who needs to acknowledge
                const otherUser = (userId === u1) ? u2 : u1;

                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `🏃 **${username} is On The Way!** \n<@${otherUser}>, please acknowledge!`,
                        components: [{
                            type: MessageComponentTypes.ACTION_ROW,
                            components: [{
                                type: MessageComponentTypes.BUTTON,
                                // smoke_ack_<OTW_User>_<Ack_User>
                                custom_id: `smoke_ack_${userId}_${otherUser}`,
                                label: 'Acknowledge 👍',
                                style: ButtonStyleTypes.SECONDARY,
                            }]
                        }]
                    }
                });
            }

            // --- ACKNOWLEDGE ---
            if (customId.startsWith('smoke_ack_')) {
                const parts = customId.split('_');
                const otwUser = parts[2];
                const expectedAckUser = parts[3];

                if (userId !== expectedAckUser) {
                     return Response.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: `❌ Waiting for specific acknowledgement from <@${expectedAckUser}>!`,
                            flags: 64
                        }
                    });
                }

                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `👍 **Acknowledged by ${username}!** \nWaiting for <@${otwUser}> to arrive...`,
                        components: [{
                            type: MessageComponentTypes.ACTION_ROW,
                            components: [{
                                type: MessageComponentTypes.BUTTON,
                                // smoke_aqui_<OTW_User>
                                custom_id: `smoke_aqui_${otwUser}`,
                                label: 'Aqui! 📍',
                                style: ButtonStyleTypes.SUCCESS,
                            }]
                        }]
                    }
                });
            }

            // --- AQUI ---
            if (customId.startsWith('smoke_aqui_')) {
                const parts = customId.split('_');
                const otwUser = parts[2];

                if (userId !== otwUser) {
                    return Response.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: `❌ Only the person who was OTW (<@${otwUser}>) can confirm arrival!`,
                            flags: 64
                        }
                    });
                }

                return Response.json({
                    type: InteractionResponseType.UPDATE_MESSAGE,
                    data: {
                        content: `📍 **${username} is Aqui!** \nSession active. ☁️`,
                        components: [],
                    },
                });
            }
        }

        return new Response('Unknown Interaction Type', { status: 400 });
    },
};