import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits
} from "discord.js";
import { allRatingRoleNames, TITLE_CODES, titleRoleName } from "./rating-roles.js";
import type { GuildSettings } from "./types.js";

async function getOrCreateRole(guild: Guild, name: string, color: number): Promise<string> {
  const existing = guild.roles.cache.find((role) => role.name === name);
  if (existing) return existing.id;
  const role = await guild.roles.create({ name, colors: { primaryColor: color }, reason: "Chess Gate setup" });
  return role.id;
}

export async function setupAnalysisChannel(
  guild: Guild,
  verifiedRoleId: string,
  requestedChannelId?: string
): Promise<string> {
  const existing = requestedChannelId
    ? await guild.channels.fetch(requestedChannelId)
    : guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && channel.name === "مراجعات-المباريات");
  const channel = existing ?? await guild.channels.create({
    name: "مراجعات-المباريات",
    type: ChannelType.GuildText,
    reason: "SoliChess automatic post-game reviews"
  });
  if (channel.type !== ChannelType.GuildText) throw new Error("روم المراجعات يجب أن يكون رومًا كتابيًا عاديًا.");

  await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }, { reason: "SoliChess review channel" });
  await channel.permissionOverwrites.edit(verifiedRoleId, {
    ViewChannel: true,
    ReadMessageHistory: true
  }, { reason: "SoliChess review channel" });
  await channel.permissionOverwrites.edit(guild.client.user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    EmbedLinks: true,
    AttachFiles: true
  }, { reason: "SoliChess review channel" });
  return channel.id;
}

export async function setupGuild(
  guild: Guild,
  lockExisting: boolean,
  requestedLogChannelId?: string
): Promise<GuildSettings> {
  const everyoneId = guild.roles.everyone.id;
  const botUserId = guild.client.user.id;
  const verifiedRoleId = await getOrCreateRole(guild, "Verified Chess Player", 0x57f287);
  const reviewRoleId = await getOrCreateRole(guild, "Account Review", 0xed4245);

  for (const roleName of allRatingRoleNames()) {
    await getOrCreateRole(guild, roleName, 0x5865f2);
  }
  for (const title of TITLE_CODES) {
    await getOrCreateRole(guild, titleRoleName(title), 0xfee75c);
  }

  const category = await guild.channels.create({
    name: "البداية",
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: everyoneId, allow: [PermissionFlagsBits.ViewChannel] },
      { id: verifiedRoleId, allow: [PermissionFlagsBits.ViewChannel] }
    ],
    reason: "Chess Gate onboarding"
  });

  const verify = await guild.channels.create({
    name: "التفعيل",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: everyoneId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }
    ],
    reason: "Chess Gate onboarding"
  });

  let logChannelId = requestedLogChannelId;
  if (!logChannelId) {
    const logs = await guild.channels.create({
      name: "chess-gate-logs",
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.ownerId, allow: [PermissionFlagsBits.ViewChannel] },
        {
          id: botUserId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
      ],
      reason: "Chess Gate audit logs"
    });
    logChannelId = logs.id;
  }

  const analysisChannelId = await setupAnalysisChannel(guild, verifiedRoleId);

  if (lockExisting) {
    for (const channel of guild.channels.cache.values()) {
      if (channel.id === category.id || channel.parentId === category.id || channel.id === logChannelId || channel.id === analysisChannelId) continue;
      if (channel.isThread()) continue;
      await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false }, { reason: "Mandatory Chess.com verification" });
      await channel.permissionOverwrites.edit(verifiedRoleId, { ViewChannel: true }, { reason: "Mandatory Chess.com verification" });
    }
  }

  await verify.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("قوانين وربط حساب Chess.com")
        .setDescription(
          [
            "• يلزم ربط حساب Chess.com واحد للوصول إلى السيرفر.",
            "• الربط دائم ولا يستطيع العضو تغييره بنفسه.",
            "• نخزن Discord ID وChess.com player_id والتصنيفات العامة وحالة الحساب.",
            "• الحسابات المغلقة تُحوّل إلى مراجعة الإدارة.",
            "• لا ترسل كلمة مرور Chess.com إلى البوت أو لأي شخص."
          ].join("\n")
        )
    ]
  });

  await verify.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("اربط حسابك وافتح السيرفر")
        .setDescription(
          "اضغط الزر واتبع خطوات تأكيد الحساب. بعد نجاح الربط ستحصل تلقائيًا على رولات Rapid وBlitz وBullet."
        )
        .setFooter({ text: "لن يطلب منك البوت كلمة المرور أبدًا" })
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("chess_link_start").setLabel("ربط حساب Chess.com").setStyle(ButtonStyle.Success)
      )
    ]
  });

  return {
    guildId: guild.id,
    verifiedRoleId,
    reviewRoleId,
    onboardingCategoryId: category.id,
    rulesChannelId: verify.id,
    verifyChannelId: verify.id,
    logChannelId,
    analysisChannelId
  };
}
