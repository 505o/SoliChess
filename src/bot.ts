import { randomInt } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Guild,
  GuildMember,
  Interaction,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { AppConfig } from "./config.js";
import { ChessComApiError, ChessComClient, isClosedStatus, isFairPlayClosure, ratingSnapshot } from "./chesscom.js";
import { commandJson } from "./commands.js";
import { AppDatabase } from "./database.js";
import { applyChessRoles, isManagedRatingRole, quarantineMember } from "./rating-roles.js";
import { setupGuild } from "./setup.js";
import type { ChessComProfile, ChessComStats, LinkRecord, RatingSnapshot, TimeClass } from "./types.js";

const LINK_MODAL_ID = "chess_link_modal";
const CHECK_BUTTON_ID = "chess_link_check";

function challengeCode(): string {
  return `DC-${randomInt(100_000, 1_000_000)}`;
}

function statusLabel(status: string): string {
  if (isFairPlayClosure(status)) return "مغلق بسبب Fair Play";
  if (isClosedStatus(status)) return "مغلق";
  return "نشط";
}

function ratingText(rating: number | null): string {
  return rating === null ? "غير مصنف" : rating.toLocaleString("en-US");
}

function parseStoredRatings(link: LinkRecord): RatingSnapshot {
  if (!link.lastStatsJson) return { rapid: null, blitz: null, bullet: null };
  try {
    return ratingSnapshot(JSON.parse(link.lastStatsJson) as ChessComStats);
  } catch {
    return { rapid: null, blitz: null, bullet: null };
  }
}

async function replyError(interaction: Interaction, message: string): Promise<void> {
  if (!interaction.isRepliable()) return;
  const payload = { content: `❌ ${message}`, ephemeral: true } as const;
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

export class ChessGateBot {
  readonly client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  private readonly chess: ChessComClient;
  private monitorRunning = false;

  constructor(
    private readonly config: AppConfig,
    private readonly db: AppDatabase
  ) {
    this.chess = new ChessComClient(config.chessComUserAgent);
  }

  async start(): Promise<void> {
    this.client.once("ready", async (readyClient) => {
      console.log(`Logged in as ${readyClient.user.tag}`);
      await this.registerCommands();
      this.db.deleteExpiredPending();
      setInterval(() => void this.refreshAll(), this.config.checkIntervalMinutes * 60_000).unref();
      void this.refreshAll();
    });

    this.client.on("interactionCreate", (interaction) => {
      void this.handleInteraction(interaction).catch((error: unknown) => {
        console.error("Interaction failed", error);
        void replyError(interaction, userFacingError(error));
      });
    });

    this.client.on("error", (error) => console.error("Discord client error", error));
    await this.client.login(this.config.discordToken);
  }

  private async registerCommands(): Promise<void> {
    const rest = new REST({ version: "10" }).setToken(this.config.discordToken);
    if (this.config.discordGuildId) {
      await rest.put(Routes.applicationGuildCommands(this.config.discordClientId, this.config.discordGuildId), { body: commandJson });
      console.log(`Registered guild commands in ${this.config.discordGuildId}`);
    } else {
      await rest.put(Routes.applicationCommands(this.config.discordClientId), { body: commandJson });
      console.log("Registered global commands");
    }
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.inGuild()) return void await replyError(interaction, "استخدم البوت داخل السيرفر.");

    if (interaction.isButton()) {
      if (interaction.customId === "chess_link_start") return void await this.openLinkModal(interaction);
      if (interaction.customId === CHECK_BUTTON_ID) return void await this.checkChallenge(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === LINK_MODAL_ID) {
      return void await this.beginLink(interaction);
    }

    if (!interaction.isChatInputCommand()) return;
    switch (interaction.commandName) {
      case "setup": return void await this.handleSetup(interaction);
      case "profile": return void await this.handleProfile(interaction);
      case "leaderboard": return void await this.handleLeaderboard(interaction);
      case "refresh": return void await this.handleRefresh(interaction);
      case "restore": return void await this.handleRestore(interaction);
      case "unlink": return void await this.handleUnlink(interaction);
    }
  }

  private async openLinkModal(interaction: ButtonInteraction): Promise<void> {
    const existing = this.db.getLinkByDiscord(interaction.guildId!, interaction.user.id);
    if (existing) {
      return void await interaction.reply({
        content: `حسابك مرتبط بشكل دائم بـ **${existing.chessUsername}**. لا يمكن تغييره من طرف العضو.`,
        ephemeral: true
      });
    }

    const username = new TextInputBuilder()
      .setCustomId("chess_username")
      .setLabel("اسم حساب Chess.com")
      .setPlaceholder("مثال: Hikaru")
      .setMinLength(2)
      .setMaxLength(40)
      .setRequired(true)
      .setStyle(TextInputStyle.Short);

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(LINK_MODAL_ID)
        .setTitle("ربط حساب Chess.com")
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(username))
    );
  }

  private async beginLink(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId!;
    const discordUserId = interaction.user.id;

    if (this.db.getLinkByDiscord(guildId, discordUserId)) {
      return void await interaction.editReply("حسابك مرتبط مسبقًا ولا يمكن تغييره من طرف العضو.");
    }

    const submittedUsername = interaction.fields.getTextInputValue("chess_username");
    const profile = await this.chess.getProfile(submittedUsername);
    const claimed = this.db.getLinkByChessPlayer(guildId, profile.player_id);
    if (claimed) {
      this.db.audit(guildId, discordUserId, "duplicate_link_attempt", { chessPlayerId: profile.player_id });
      return void await interaction.editReply("هذا الحساب مرتبط بعضو آخر بالفعل. تواصل مع الإدارة إذا كنت مالكه.");
    }

    if (isClosedStatus(profile.status)) {
      this.db.audit(guildId, discordUserId, "closed_account_link_attempt", { username: profile.username, status: profile.status });
      return void await interaction.editReply(`لا يمكن ربط هذا الحساب لأن حالته: **${statusLabel(profile.status)}**.`);
    }

    const code = challengeCode();
    const now = Date.now();
    this.db.savePending({
      guildId,
      discordUserId,
      chessUsername: profile.username,
      chessPlayerId: profile.player_id,
      challengeCode: code,
      createdAt: now,
      expiresAt: now + this.config.verificationTtlMinutes * 60_000
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`إثبات ملكية ${profile.username}`)
          .setDescription(
            [
              "1. افتح إعدادات ملفك في Chess.com.",
              "2. ضع الرمز التالي **مؤقتًا** في خانة Location/الموقع:",
              `\`${code}\``,
              "3. احفظ التعديل ثم اضغط «تحققت».",
              "4. تستطيع إعادة موقعك السابق بعد نجاح الربط.",
              "",
              "قد يتأخر ظهور التعديل بسبب التخزين المؤقت لدى Chess.com. لا ترسل كلمة مرورك أبدًا."
            ].join("\n")
          )
          .setFooter({ text: `ينتهي الرمز خلال ${this.config.verificationTtlMinutes} دقيقة` })
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(CHECK_BUTTON_ID).setLabel("تحققت").setStyle(ButtonStyle.Primary)
        )
      ]
    });
  }

  private async checkChallenge(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId!;
    const pending = this.db.getPending(guildId, interaction.user.id);
    if (!pending) return void await interaction.editReply("لا يوجد طلب تحقق نشط. ابدأ الربط من جديد.");
    if (pending.expiresAt < Date.now()) {
      this.db.deletePending(guildId, interaction.user.id);
      return void await interaction.editReply("انتهت صلاحية رمز التحقق. ابدأ الربط من جديد.");
    }

    const profile = await this.chess.getProfile(pending.chessUsername);
    if (profile.player_id !== pending.chessPlayerId) {
      this.db.audit(guildId, interaction.user.id, "player_id_mismatch", { expected: pending.chessPlayerId, actual: profile.player_id });
      return void await interaction.editReply("تغيّرت هوية الحساب أثناء التحقق. تواصل مع الإدارة.");
    }
    if (profile.location?.trim().toUpperCase() !== pending.challengeCode.toUpperCase()) {
      return void await interaction.editReply(
        `لم يظهر الرمز \`${pending.challengeCode}\` في خانة Location حتى الآن. تأكد من الحفظ وانتظر قليلًا ثم حاول مجددًا.`
      );
    }
    if (isClosedStatus(profile.status)) {
      return void await interaction.editReply(`توقّف التحقق لأن الحساب أصبح: **${statusLabel(profile.status)}**.`);
    }

    const duplicate = this.db.getLinkByChessPlayer(guildId, profile.player_id);
    if (duplicate) return void await interaction.editReply("سبق ربط هذا الحساب بعضو آخر.");

    const stats = await this.chess.getStats(profile.username);
    const link: LinkRecord = {
      guildId,
      discordUserId: interaction.user.id,
      chessPlayerId: profile.player_id,
      chessUsername: profile.username,
      linkedAt: Date.now(),
      verifiedVia: "profile_location_challenge",
      accountStatus: profile.status,
      lastCheckedAt: Date.now(),
      lastStatsJson: JSON.stringify(stats)
    };

    try {
      this.db.createLink(link);
    } catch (error) {
      console.error("Create link conflict", error);
      return void await interaction.editReply("تعذر تثبيت الربط؛ قد يكون الحساب ارتبط للتو. تواصل مع الإدارة.");
    }

    const settings = this.db.getGuildSettings(guildId);
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!settings) return void await interaction.editReply("تم إثبات الحساب، لكن إعداد السيرفر غير مكتمل. تواصل مع الإدارة.");
    await applyChessRoles(member, settings.verifiedRoleId, settings.reviewRoleId, ratingSnapshot(stats), profile);
    this.db.audit(guildId, interaction.user.id, "account_linked", { username: profile.username, playerId: profile.player_id });
    await this.sendLog(interaction.guild!, `✅ تم ربط <@${interaction.user.id}> بحساب **${profile.username}** (ID: ${profile.player_id}).`);

    const ratings = ratingSnapshot(stats);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("تم الربط وفتح السيرفر")
          .setDescription(`تم تأكيد ملكيتك لحساب **${profile.username}**.`)
          .addFields(
            { name: "Rapid", value: ratingText(ratings.rapid), inline: true },
            { name: "Blitz", value: ratingText(ratings.blitz), inline: true },
            { name: "Bullet", value: ratingText(ratings.bullet), inline: true }
          )
          .setFooter({ text: "يمكنك الآن إعادة خانة Location إلى قيمتها السابقة" })
      ],
      components: []
    });
  }

  private async handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return void await replyError(interaction, "تحتاج صلاحية Manage Server.");
    }
    const existingSettings = this.db.getGuildSettings(interaction.guildId!);
    if (existingSettings) {
      return void await interaction.reply({
        content: `النظام معد مسبقًا وروم الربط هو <#${existingSettings.verifyChannelId}>. لن أعيد إنشاء الرومات تلقائيًا.`,
        ephemeral: true
      });
    }
    await interaction.deferReply({ ephemeral: true });
    const lockExisting = interaction.options.getBoolean("lock_existing", true);
    const logChannel = interaction.options.getChannel("log_channel");
    const settings = await setupGuild(interaction.guild!, lockExisting, logChannel?.id);
    this.db.upsertGuildSettings(settings);
    this.db.audit(interaction.guildId!, interaction.user.id, "guild_setup", { lockExisting, settings });
    await interaction.editReply(
      `تم الإعداد. روم التحقق: <#${settings.verifyChannelId}>. ` +
      (lockExisting ? "تم قفل الرومات الحالية لغير الموثقين؛ راجعها بخيار View Server As Role." : "لم ألمس صلاحيات الرومات الحالية.")
    );
  }

  private async handleProfile(interaction: ChatInputCommandInteraction): Promise<void> {
    const target = interaction.options.getUser("member") ?? interaction.user;
    const link = this.db.getLinkByDiscord(interaction.guildId!, target.id);
    if (!link) return void await replyError(interaction, "هذا العضو لم يربط حساب Chess.com.");
    const ratings = parseStoredRatings(link);
    const links = this.db.listLinks(interaction.guildId!);

    const rank = (mode: TimeClass): string => {
      const rating = ratings[mode];
      if (rating === null) return "—";
      const sorted = links
        .map((item) => ({ id: item.discordUserId, rating: parseStoredRatings(item)[mode] }))
        .filter((item): item is { id: string; rating: number } => item.rating !== null)
        .sort((a, b) => b.rating - a.rating);
      const index = sorted.findIndex((item) => item.id === target.id);
      return index < 0 ? "—" : `#${index + 1}`;
    };

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(isClosedStatus(link.accountStatus) ? 0xed4245 : 0x5865f2)
          .setTitle(link.chessUsername)
          .setURL(`https://www.chess.com/member/${encodeURIComponent(link.chessUsername)}`)
          .setDescription(`Discord: <@${target.id}>\nالحالة: **${statusLabel(link.accountStatus)}**`)
          .addFields(
            { name: "Rapid", value: `${ratingText(ratings.rapid)} • ${rank("rapid")}`, inline: true },
            { name: "Blitz", value: `${ratingText(ratings.blitz)} • ${rank("blitz")}`, inline: true },
            { name: "Bullet", value: `${ratingText(ratings.bullet)} • ${rank("bullet")}`, inline: true }
          )
          .setFooter({ text: "الترتيب داخل هذا السيرفر" })
      ]
    });
  }

  private async handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
    const mode = interaction.options.getString("mode", true) as TimeClass;
    const ranked = this.db.listLinks(interaction.guildId!)
      .map((link) => ({ link, rating: parseStoredRatings(link)[mode] }))
      .filter((item): item is { link: LinkRecord; rating: number } => item.rating !== null && !isClosedStatus(item.link.accountStatus))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 20);

    const lines = ranked.map((item, index) => `**${index + 1}.** <@${item.link.discordUserId}> — ${item.rating}`);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`ترتيب ${mode[0]!.toUpperCase()}${mode.slice(1)}`)
          .setDescription(lines.join("\n") || "لا توجد بيانات مصنفة بعد.")
          .setFooter({ text: "أفضل 20 لاعبًا موثقًا في السيرفر" })
      ]
    });
  }

  private async handleRefresh(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("member", true);
    const link = this.db.getLinkByDiscord(interaction.guildId!, user.id);
    if (!link) return void await replyError(interaction, "هذا العضو غير مرتبط.");
    await interaction.deferReply({ ephemeral: true });
    await this.refreshLink(link, true);
    await interaction.editReply(
      isClosedStatus(link.accountStatus)
        ? `تم تحديث بيانات **${link.chessUsername}**. إذا عاد الحساب نشطًا استخدم \`/restore\` بعد مراجعته.`
        : `تم تحديث بيانات **${link.chessUsername}** ورولاته.`
    );
  }

  private async handleRestore(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("member", true);
    const link = this.db.getLinkByDiscord(interaction.guildId!, user.id);
    if (!link) return void await replyError(interaction, "هذا العضو غير مرتبط.");
    await interaction.deferReply({ ephemeral: true });
    const profile = await this.chess.getProfile(link.chessUsername);
    if (isClosedStatus(profile.status)) {
      return void await interaction.editReply(`لا يمكن إعادته؛ الحساب ما زال: **${statusLabel(profile.status)}**.`);
    }
    await this.refreshLink(link, true, true);
    this.db.audit(interaction.guildId!, user.id, "admin_restore", { adminId: interaction.user.id, status: profile.status });
    await this.sendLog(interaction.guild!, `✅ أعاد <@${interaction.user.id}> تفعيل <@${user.id}> بعد عودة حساب **${profile.username}** نشطًا.`);
    await interaction.editReply(`تمت إعادة **${profile.username}** ومنح الرولات الحالية.`);
  }

  private async handleUnlink(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("member", true);
    const reason = interaction.options.getString("reason", true);
    const settings = this.db.getGuildSettings(interaction.guildId!);
    const existing = this.db.getLinkByDiscord(interaction.guildId!, user.id);
    if (!existing) return void await replyError(interaction, "هذا العضو غير مرتبط.");

    await interaction.deferReply({ ephemeral: true });
    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (member && settings) {
      const managedIds = member.roles.cache
        .filter((role) => role.id === settings.verifiedRoleId || role.id === settings.reviewRoleId || isManagedRatingRole(role) || role.name.startsWith("Title • "))
        .map((role) => role.id);
      if (managedIds.length) await member.roles.remove(managedIds, `Admin unlink: ${reason}`);
    }

    this.db.deleteLink(interaction.guildId!, user.id);
    this.db.audit(interaction.guildId!, user.id, "admin_unlink", { adminId: interaction.user.id, reason, chessPlayerId: existing.chessPlayerId });
    await this.sendLog(interaction.guild!, `⚠️ فك <@${interaction.user.id}> ربط <@${user.id}> عن **${existing.chessUsername}**. السبب: ${reason}`);
    await interaction.editReply(`تم فك الربط عن **${existing.chessUsername}** وتسجيل السبب.`);
  }

  private async refreshAll(): Promise<void> {
    if (this.monitorRunning) return;
    this.monitorRunning = true;
    try {
      for (const link of this.db.listLinks()) {
        await this.refreshLink(link, false);
      }
      this.db.deleteExpiredPending();
    } finally {
      this.monitorRunning = false;
    }
  }

  private async refreshLink(link: LinkRecord, throwOnError: boolean, forceRestore = false): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(link.guildId);
      const settings = this.db.getGuildSettings(link.guildId);
      if (!settings) return;
      const profile = await this.chess.getProfile(link.chessUsername);
      const previousStatus = link.accountStatus;
      const member = await guild.members.fetch(link.discordUserId).catch(() => null);

      if (isClosedStatus(profile.status)) {
        this.db.updateLinkCheck(link.guildId, link.discordUserId, profile.username, profile.status, link.lastStatsJson);
        if (member) await quarantineMember(member, settings.verifiedRoleId, settings.reviewRoleId);
        if (previousStatus !== profile.status) {
          this.db.audit(link.guildId, link.discordUserId, "account_closed", { previousStatus, status: profile.status });
          await this.sendLog(guild, `🚨 حساب **${profile.username}** المرتبط بـ <@${link.discordUserId}> أصبح: **${statusLabel(profile.status)}**.`);
        }
        return;
      }

      const stats = await this.chess.getStats(profile.username);
      this.db.updateLinkCheck(link.guildId, link.discordUserId, profile.username, profile.status, JSON.stringify(stats));
      if (member && (!isClosedStatus(previousStatus) || forceRestore)) {
        await applyChessRoles(member, settings.verifiedRoleId, settings.reviewRoleId, ratingSnapshot(stats), profile);
      } else if (isClosedStatus(previousStatus) && previousStatus !== profile.status) {
        await this.sendLog(guild, `ℹ️ حالة **${profile.username}** عادت نشطة، لكنه سيبقى تحت المراجعة حتى تتدخل الإدارة.`);
      }
    } catch (error) {
      console.error(`Refresh failed for ${link.guildId}/${link.discordUserId}`, error);
      if (throwOnError) throw error;
    }
  }

  private async sendLog(guild: Guild, content: string): Promise<void> {
    const settings = this.db.getGuildSettings(guild.id);
    if (!settings) return;
    const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (channel?.isTextBased() && !channel.isDMBased()) await channel.send({ content });
  }
}

export function userFacingError(error: unknown): string {
  if (error instanceof ChessComApiError) return error.message;
  return "حدث خطأ غير متوقع.";
}
