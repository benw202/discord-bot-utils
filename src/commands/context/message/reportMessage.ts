import {
    ActionRowBuilder,
    ApplicationCommandType,
    ContextMenuCommandInteraction,
    ModalBuilder, TextChannel,
    TextInputBuilder,
    TextInputStyle,
    Colors,
} from 'discord.js';
import moment from 'moment/moment';
import { constantsConfig, contextMenuCommand, contextMenuCommandStructure, Logger, makeEmbed } from '../../../lib';

const data = contextMenuCommandStructure({
    name: 'Report Message',
    type: ApplicationCommandType.Message,
});

const messageEmbed = (targetMessage: any, interaction: ContextMenuCommandInteraction<'cached'>, messageContent: string, commentContent: string, formattedDate: string) => makeEmbed({
    author: {
        name: `[REPORTED MESSAGE] ${targetMessage.author.tag}`,
        iconURL: targetMessage.author.displayAvatarURL(),
    },
    fields: [
        {
            name: 'Reported by',
            value: interaction.user.toString(),
            inline: true,
        },
        {
            name: 'Message Author',
            value: targetMessage.author.toString(),
            inline: true,
        },
        {
            name: 'Message Content',
            value: messageContent,
            inline: false,
        },
        {
            name: 'Link to Message',
            value: targetMessage.url,
            inline: false,
        },
        {
            name: 'Additional Comments',
            value: commentContent,
            inline: false,
        },
        {
            name: 'Reported at',
            value: formattedDate,
            inline: false,
        },
    ],
    color: Colors.Red,
    footer: { text: `Reported Users ID: ${targetMessage.author.id}` },
});

export default contextMenuCommand(data, async ({ interaction }) => {
    const currentDate = new Date();
    const formattedDate: string = moment(currentDate)
        .utcOffset(0)
        .format();
    const scamReportLogs = interaction.guild.channels.resolve(constantsConfig.channels.SCAM_REPORT_LOGS) as TextChannel;
    const modRoleId = constantsConfig.roles.MODERATION_TEAM;

    if (!scamReportLogs) {
        await interaction.reply({
            content: 'Unable to find the mod logs channel. Please contact a Moderator.',
            ephemeral: true,
        });
        return;
    }

    if (!interaction.channel) {
        await interaction.reply({
            content: 'Unable to find the target message.',
            ephemeral: true,
        });
        return;
    }

    const targetMessageId = interaction.targetId;

    if (!targetMessageId) {
        await interaction.reply({
            content: 'Unable to find the target message.',
            ephemeral: true,
        });
        return;
    }

    const targetMessage = await interaction.channel.messages.fetch(targetMessageId);

    if (!targetMessage) {
        await interaction.reply({
            content: 'Unable to find the target message.',
            ephemeral: true,
        });
        return;
    }

    let messageContent;
    if (targetMessage.embeds.length === 0) {
        messageContent = targetMessage.content;
    } else {
        messageContent = 'Message is an embed. Please check the link below.';
    }

    //Create and send the modal

    const modal = new ModalBuilder({
        customId: 'standardPriorityModal',
        title: 'Report a Message',
    });

    const standardPriorityComments = new TextInputBuilder()
        .setCustomId('standardPriorityComments')
        .setLabel('Comments')
        .setPlaceholder('Please provide any additional comments about your report here. You may leave this blank.')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(false);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(standardPriorityComments);

    modal.addComponents(actionRow);

    await interaction.showModal(modal);

    //Modal sent

    const filter = (interaction: {
        customId: string;
        user: { id: any; };
    }) => interaction.customId === 'standardPriorityModal' && interaction.user.id;

    let commentContent = 'No additional comments provided.';

    try {
        //Await a modal response
        const modalSubmitInteraction = await interaction.awaitModalSubmit({
            filter,
            time: 120000,
        });

        //Respond to the user once they have submitted the modal
        await modalSubmitInteraction.reply({
            content: `Thank you for reporting the message from ${targetMessage.author.toString()}, the <@&${modRoleId}> has been notified.`,
            ephemeral: true,
        });

        commentContent = modalSubmitInteraction.fields.getTextInputValue('standardPriorityComments');
        commentContent = commentContent.trim() || 'No additional comments provided.';
    } catch (error) {
        //Handle the error if the user does not respond in time
        Logger.error(error);
        await interaction.followUp({
            content: 'You did not provide any comments in time. Your report has been cancelled.',
            ephemeral: true,
        });
        return;
    }

    //Send a follow-up message to the user if they are part of the staff role group

    if (constantsConfig.roleGroups.SUPPORT && constantsConfig.roleGroups.SUPPORT.some((role) => interaction.member.roles.cache.has(role))) {
        await interaction.followUp({
            content: 'Do you want to ping the Moderation Team?',
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 3,
                            label: 'Yes',
                            customId: 'pingModerationTeamYes',
                        },
                        {
                            type: 2,
                            style: 4,
                            label: 'No',
                            customId: 'pingModerationTeamNo',
                        },
                    ],
                },
            ],
            ephemeral: true,
        });

        try {
        // Handle the button interactions
            const buttonInteraction = await interaction.channel.awaitMessageComponent({
                filter: (i) => i.customId === 'pingModerationTeamYes' || i.customId === 'pingModerationTeamNo',
                time: 60000,
            });

            let pingModerationTeam = false;

            if (buttonInteraction.customId === 'pingModerationTeamYes') {
                pingModerationTeam = true;
            }

            // Respond based on the user's choice
            let responseMessage;

            if (pingModerationTeam) {
                // Ping the moderation team
                await scamReportLogs.send({ content: `<@&${modRoleId}>` });
                responseMessage = `I will also ping the <@&${modRoleId}>.`;
            } else {
                // Do not ping the moderation team
                responseMessage = `I will not ping the <@&${modRoleId}>.`;
            }

            // Respond to the user
            await buttonInteraction.reply({
                content: responseMessage,
                ephemeral: true,
            });
        } catch (error) {
            Logger.error(error);
            // Handle the error if the user does not respond in time
            await interaction.followUp({
                content: `You did not choose an option in time. Your report has been submitted without pinging the <@&${modRoleId}>.`,
                ephemeral: true,
            });
        }
    }
    await scamReportLogs.send({ embeds: [messageEmbed(targetMessage, interaction, messageContent, commentContent, formattedDate)] });
});
