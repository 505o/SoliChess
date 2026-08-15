import { randomBytes, randomInt } from "node:crypto";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Guild,
  GuildMember,
  Interaction,
  MessageFlags,
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
import { renderBoard } from "./board-renderer.js";
import { analyzeCompletedGame, type GameAnalysisResult, type MoveClassification } from "./game-analysis.js";
import { LichessPuzzleClient } from "./lichess-puzzles.js";
import {
  colorName,
  puzzleHint,
  sessionFromPuzzle,
  solutionInSan,
  submitPuzzleMove,
  themeLabels,
  updatedPuzzleRating
} from "./puzzles.js";
import { applyChessRoles, isManagedRatingRole, quarantineMember } from "./rating-roles.js";
import { setupAnalysisChannel, setupGuild } from "./setup.js";
import { StockfishEngine } from "./stockfish.js";
import type { ChessComProfile, ChessComStats, LinkRecord, PuzzleSession, RatingSnapshot, TimeClass } from "./types.js";

const LINK_MODAL_ID = "chess_link_modal";
const CHECK_BUTTON_ID = "chess_link_check";
const PUZZLE_MOVE_PREFIX = "puzzle_move:";
const PUZZLE_MODAL_PREFIX = "puzzle_move_modal:";
const REVIEW_BUTTON_PREFIX = "review_";

interface ReviewSession {
  result: GameAnalysisResult;
  index: number;
  content: string;
}

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
  const payload = { content: `❌ ${message}`, flags: MessageFlags.Ephemeral } as const;
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

export class ChessGateBot {
  readonly client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  private readonly chess: ChessComClient;
  private readonly puzzles: LichessPuzzleClient;
  private readonly engine = new StockfishEngine();
  private readonly analysesInProgress = new Set<string>();
  private readonly lastAnalysisAt = new Map<string, number>();
  private readonly reviewSessions = new Map<string, ReviewSession>();
  private monitorRunning = false;
  private gameMonitorRunning = false;

  constructor(
    private readonly config: AppConfig,
    private readonly db: AppDatabase
  ) {
    this.chess = new ChessComClient(config.chessComUserAgent);
    this.puzzles = new LichessPuzzleClient(config.chessComUserAgent);
  }

  async start(): Promise<void> {
    this.client.once(Events.ClientReady, async (readyClient) => {
      console.log(`Logged in as ${readyClient.user.tag}`);
      await this.registerCommands();
      this.db.deleteExpiredPending();
      setInterval(() => void this.refreshAll(), this.config.checkIntervalMinutes * 60_000).unref();
      setInterval(() => void this.monitorCompletedGames(), this.config.gameCheckIntervalMinutes * 60_000).unref();
      void (async () => {
        await this.refreshAll();
        await this.monitorCompletedGames();
      })();
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
      if (interaction.customId.startsWith(REVIEW_BUTTON_PREFIX)) return void await this.handleReviewButton(interaction);
      if (interaction.customId.startsWith("puzzle_")) return void await this.handlePuzzleButton(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === LINK_MODAL_ID) {
      return void await this.beginLink(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(PUZZLE_MODAL_PREFIX)) {
      return void await this.handlePuzzleMove(interaction);
    }

    if (!interaction.isChatInputCommand()) return;
    switch (interaction.commandName) {
      case "setup": return void await this.handleSetup(interaction);
      case "profile": return void await this.handleProfile(interaction);
      case "leaderboard": return void await this.handleLeaderboard(interaction);
      case "puzzle": return void await this.handlePuzzle(interaction);
      case "puzzle-stats": return void await this.handlePuzzleStats(interaction);
      case "analyze": return void await this.handleAnalyze(interaction);
      case "setup-reviews": return void await this.handleSetupReviews(interaction);
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
        flags: MessageFlags.Ephemeral
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
      lastStatsJson: JSON.stringify(stats),
      lastAnalyzedGameUrl: null
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

  private puzzleComponents(ownerId: string, active: boolean): ActionRowBuilder<ButtonBuilder>[] {
    if (!active) {
      return [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`puzzle_next:${ownerId}`).setLabel("لغز جديد").setStyle(ButtonStyle.Success)
      )];
    }
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${PUZZLE_MOVE_PREFIX}${ownerId}`).setLabel("أدخل النقلة").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`puzzle_hint:${ownerId}`).setLabel("تلميح").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`puzzle_giveup:${ownerId}`).setLabel("استسلام").setStyle(ButtonStyle.Danger)
    )];
  }

  private async puzzlePayload(session: PuzzleSession, note?: string, active = true) {
    const stats = this.db.getPuzzleStats(session.guildId, session.discordUserId);
    const filename = `solichess-puzzle-${session.puzzleId}.png`;
    const board = await renderBoard(session.currentFen, session.userColor);
    const description = [
      `أنت تلعب بـ **${colorName(session.userColor)}**. ابحث عن أفضل نقلة.`,
      note ? `\n${note}` : "",
      "\nاكتب النقلة بصيغة مثل `Nf7+` أو `e2e4`."
    ].join("");
    const embed = new EmbedBuilder()
      .setColor(active ? 0x5865f2 : 0x57f287)
      .setTitle(active ? "لغز SoliChess" : "نتيجة اللغز")
      .setDescription(description)
      .addFields(
        { name: "تقييمك", value: String(stats.rating), inline: true },
        { name: "السلسلة", value: String(stats.streak), inline: true },
        { name: "المواضيع", value: themeLabels(session.themes) || "تكتيك", inline: false }
      )
      .setImage(`attachment://${filename}`)
      .setFooter({ text: active ? "ألغاز مرخّصة CC0 من قاعدة Lichess المفتوحة" : `تقييم اللغز: ${session.puzzleRating} • Lichess CC0` });
    return {
      content: null,
      embeds: [embed],
      files: [new AttachmentBuilder(board, { name: filename })],
      components: this.puzzleComponents(session.discordUserId, active)
    };
  }

  private recordPuzzleFailure(session: PuzzleSession): PuzzleSession {
    if (session.failedOnce) return session;
    const stats = this.db.getPuzzleStats(session.guildId, session.discordUserId);
    stats.rating = updatedPuzzleRating(stats.rating, session.puzzleRating, false);
    stats.failed += 1;
    stats.streak = 0;
    stats.updatedAt = Date.now();
    this.db.savePuzzleStats(stats);
    const failedSession = { ...session, failedOnce: true };
    this.db.savePuzzleSession(failedSession);
    return failedSession;
  }

  private recordPuzzleSuccess(session: PuzzleSession): void {
    const stats = this.db.getPuzzleStats(session.guildId, session.discordUserId);
    stats.solved += 1;
    if (!session.failedOnce) {
      stats.rating = updatedPuzzleRating(stats.rating, session.puzzleRating, true);
      stats.streak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    }
    stats.updatedAt = Date.now();
    this.db.savePuzzleStats(stats);
  }

  private async createPuzzle(guildId: string, userId: string): Promise<PuzzleSession> {
    const previous = this.db.getPuzzleSession(guildId, userId);
    if (previous) this.recordPuzzleFailure(previous);
    const puzzle = await this.puzzles.getNextPuzzle();
    const session = sessionFromPuzzle(guildId, userId, puzzle);
    this.db.savePuzzleSession(session);
    return session;
  }

  private async handlePuzzle(interaction: ChatInputCommandInteraction): Promise<void> {
    const link = this.db.getLinkByDiscord(interaction.guildId!, interaction.user.id);
    if (!link) return void await replyError(interaction, "اربط حساب Chess.com أولًا قبل استخدام الألغاز.");
    await interaction.deferReply();
    const session = await this.createPuzzle(interaction.guildId!, interaction.user.id);
    await interaction.editReply(await this.puzzlePayload(session));
  }

  private async handlePuzzleButton(interaction: ButtonInteraction): Promise<void> {
    const [action, ownerId] = interaction.customId.split(":", 2);
    if (!ownerId || ownerId !== interaction.user.id) {
      return void await interaction.reply({ content: "هذا اللغز يخص عضوًا آخر. استخدم `/puzzle` لبدء لغزك.", flags: MessageFlags.Ephemeral });
    }

    if (action === "puzzle_next") {
      await interaction.deferUpdate();
      const session = await this.createPuzzle(interaction.guildId!, ownerId);
      await interaction.editReply(await this.puzzlePayload(session));
      return;
    }

    const session = this.db.getPuzzleSession(interaction.guildId!, ownerId);
    if (!session) return void await interaction.reply({ content: "انتهت جلسة اللغز. ابدأ لغزًا جديدًا.", flags: MessageFlags.Ephemeral });

    if (action === "puzzle_hint") {
      return void await interaction.reply({ content: `💡 ${puzzleHint(session)}`, flags: MessageFlags.Ephemeral });
    }

    if (action === "puzzle_giveup") {
      const remaining = solutionInSan(session);
      const failed = this.recordPuzzleFailure(session);
      this.db.deletePuzzleSession(session.guildId, session.discordUserId);
      await interaction.deferUpdate();
      await interaction.editReply(await this.puzzlePayload(failed, `استسلمت. الحل المتبقي: **${remaining.join(" ")}**`, false));
      return;
    }

    if (action === "puzzle_move") {
      const input = new TextInputBuilder()
        .setCustomId("puzzle_move_value")
        .setLabel("اكتب نقلتك")
        .setPlaceholder("مثال: Nf7+ أو e2e4")
        .setMinLength(2)
        .setMaxLength(12)
        .setRequired(true)
        .setStyle(TextInputStyle.Short);
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${PUZZLE_MODAL_PREFIX}${ownerId}`)
          .setTitle("حل اللغز")
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))
      );
    }
  }

  private async handlePuzzleMove(interaction: ModalSubmitInteraction): Promise<void> {
    const ownerId = interaction.customId.slice(PUZZLE_MODAL_PREFIX.length);
    if (ownerId !== interaction.user.id) return void await replyError(interaction, "هذا اللغز يخص عضوًا آخر.");
    const session = this.db.getPuzzleSession(interaction.guildId!, ownerId);
    if (!session) return void await replyError(interaction, "انتهت جلسة اللغز. ابدأ لغزًا جديدًا.");
    const input = interaction.fields.getTextInputValue("puzzle_move_value");

    let result;
    try {
      result = submitPuzzleMove(session, input);
    } catch {
      return void await interaction.reply({ content: "هذه النقلة غير قانونية أو صيغتها غير صحيحة. جرّب مثل `Nf7+` أو `e2e4`.", flags: MessageFlags.Ephemeral });
    }

    if (result.kind === "wrong") {
      this.recordPuzzleFailure(result.session);
      return void await interaction.reply({ content: "❌ ليست أفضل نقلة. خسر اللغز تقييمه، لكن تستطيع المحاولة مرة أخرى.", flags: MessageFlags.Ephemeral });
    }

    if (result.kind === "continue") {
      this.db.savePuzzleSession(result.session);
      await interaction.deferUpdate();
      await interaction.editReply(await this.puzzlePayload(
        result.session,
        `✅ **${result.playedSan}** صحيحة. رد الخصم: **${result.opponentSan}** — أكمل الحل.`
      ));
      return;
    }

    this.recordPuzzleSuccess(result.session);
    this.db.deletePuzzleSession(result.session.guildId, result.session.discordUserId);
    await interaction.deferUpdate();
    await interaction.editReply(await this.puzzlePayload(
      result.session,
      result.session.failedOnce
        ? `✅ أكملت الحل بالنقلة **${result.playedSan}** بعد محاولة خاطئة.`
        : `🎉 حل صحيح من أول محاولة: **${result.playedSan}**`,
      false
    ));
  }

  private async handlePuzzleStats(interaction: ChatInputCommandInteraction): Promise<void> {
    const target = interaction.options.getUser("member") ?? interaction.user;
    const stats = this.db.getPuzzleStats(interaction.guildId!, target.id);
    const ranked = this.db.listPuzzleStats(interaction.guildId!);
    const rankIndex = ranked.findIndex((entry) => entry.discordUserId === target.id);
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`إحصائيات ألغاز ${target.displayName}`)
        .addFields(
          { name: "التقييم", value: String(stats.rating), inline: true },
          { name: "ترتيب السيرفر", value: rankIndex >= 0 ? `#${rankIndex + 1}` : "—", inline: true },
          { name: "تم حلها", value: String(stats.solved), inline: true },
          { name: "الإخفاقات", value: String(stats.failed), inline: true },
          { name: "السلسلة الحالية", value: String(stats.streak), inline: true },
          { name: "أفضل سلسلة", value: String(stats.bestStreak), inline: true }
        )]
    });
  }

  private analysisLabel(classification: MoveClassification): string {
    const labels: Record<MoveClassification, string> = {
      brilliant: "💎 عبقرية",
      best: "⭐ أفضل نقلة",
      excellent: "✅ ممتازة",
      good: "👍 جيدة",
      inaccuracy: "غير دقيقة",
      mistake: "❓ خطأ",
      blunder: "⁉️ بلندر"
    };
    return labels[classification];
  }

  private analysisColor(classification: MoveClassification): number {
    const colors: Record<MoveClassification, number> = {
      brilliant: 0x1baca6,
      best: 0x81b64c,
      excellent: 0x96bc4b,
      good: 0x95a5a6,
      inaccuracy: 0xf7c631,
      mistake: 0xe58f2a,
      blunder: 0xfa412d
    };
    return colors[classification];
  }

  private evaluationText(whiteEvaluation: number): string {
    if (Math.abs(whiteEvaluation) >= 99_000) return whiteEvaluation > 0 ? "مات لصالح الأبيض" : "مات لصالح الأسود";
    const score = (whiteEvaluation / 100).toFixed(2);
    if (Math.abs(whiteEvaluation) < 10) return "0.00 • متعادل";
    return `${whiteEvaluation > 0 ? "+" : ""}${score} • أفضلية ${whiteEvaluation > 0 ? "للأبيض" : "للأسود"}`;
  }

  private createReviewSession(result: GameAnalysisResult, content: string | null): { id: string; session: ReviewSession } {
    const id = randomBytes(6).toString("hex");
    const session: ReviewSession = { result, index: result.moves.length - 1, content: content ?? "" };
    this.reviewSessions.set(id, session);
    setTimeout(() => this.reviewSessions.delete(id), 2 * 60 * 60 * 1000).unref();
    return { id, session };
  }

  private reviewComponents(id: string, index: number, moveCount: number): ActionRowBuilder<ButtonBuilder>[] {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`review_first:${id}`).setEmoji("⏮️").setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
      new ButtonBuilder().setCustomId(`review_prev:${id}`).setEmoji("◀️").setLabel("السابقة").setStyle(ButtonStyle.Primary).setDisabled(index === 0),
      new ButtonBuilder().setCustomId(`review_next:${id}`).setLabel("التالية").setEmoji("▶️").setStyle(ButtonStyle.Primary).setDisabled(index === moveCount - 1),
      new ButtonBuilder().setCustomId(`review_last:${id}`).setEmoji("⏭️").setStyle(ButtonStyle.Secondary).setDisabled(index === moveCount - 1)
    )];
  }

  private async gameAnalysisPayload(id: string, session: ReviewSession) {
    const { result, index } = session;
    const move = result.moves[index]!;
    const board = await renderBoard(move.fenAfter, result.color, move.playedUci, move.bestUci ?? undefined, move.whiteEvaluation);
    const filename = `solichess-review-${id}.png`;
    const resultNames: Record<string, string> = {
      win: "فوز",
      checkmated: "خسارة بالمات",
      resigned: "خسارة بالاستسلام",
      timeout: "خسارة بالوقت",
      agreed: "تعادل",
      repetition: "تعادل بالتكرار",
      stalemate: "تعادل بالخنق",
      insufficient: "تعادل لنقص القطع",
      "50move": "تعادل بقاعدة الخمسين"
    };
    const movePrefix = move.color === "w" ? `${move.moveNumber}.` : `${move.moveNumber}...`;
    const lossText = move.centipawnLoss >= 10_000 ? "حاسمة" : `${(move.centipawnLoss / 100).toFixed(2)} بيدق`;
    const summary = `💎 ${result.counts.brilliant} • ⭐ ${result.counts.best} • ✅ ${result.counts.excellent} • 👍 ${result.counts.good} • ?! ${result.counts.inaccuracy} • ? ${result.counts.mistake} • ?? ${result.counts.blunder}`;
    const embed = new EmbedBuilder()
      .setColor(this.analysisColor(move.classification))
      .setTitle(`مراجعة ${result.username} ضد ${result.opponent}`)
      .setURL(result.gameUrl)
      .setDescription(
        `النتيجة: **${resultNames[result.result] ?? result.result}** • ${result.timeClass} • لعبت بـ**${colorName(result.color)}**\n` +
        `الدقة التقديرية: **${result.approximateAccuracy}%**\n\n${summary}`
      )
      .addFields(
        { name: `النقلة ${move.ply}/${result.moves.length}`, value: `\`${movePrefix} ${move.playedSan}\``, inline: true },
        { name: "تصنيف النقلة", value: `**${this.analysisLabel(move.classification)}**`, inline: true },
        { name: "تقييم المحرك", value: this.evaluationText(move.whiteEvaluation), inline: true },
        { name: "أفضل نقلة", value: `\`${move.bestSan}\``, inline: true },
        { name: "خسارة النقلة", value: lossText, inline: true },
        { name: "متوسط خسارتك", value: `${(result.averageCentipawnLoss / 100).toFixed(2)} بيدق`, inline: true },
        {
          name: "مسار Stockfish المقترح",
          value: move.principalVariation ? `\`\`\`\n${move.principalVariation}\n\`\`\`` : "—",
          inline: false
        }
      )
      .setImage(`attachment://${filename}`)
      .setFooter({ text: `السهم الأخضر = أفضل نقلة • Stockfish 18 Lite • عمق ${result.engineDepth} • التصنيفات تقديرية من SoliChess` });
    return {
      content: session.content,
      embeds: [embed],
      components: this.reviewComponents(id, index, result.moves.length),
      files: [new AttachmentBuilder(board, { name: filename })]
    };
  }

  private async handleReviewButton(interaction: ButtonInteraction): Promise<void> {
    const match = /^review_(first|prev|next|last):([a-f0-9]{12})$/.exec(interaction.customId);
    if (!match) return void await replyError(interaction, "زر المراجعة غير صالح.");
    const session = this.reviewSessions.get(match[2]!);
    if (!session) return void await replyError(interaction, "انتهت جلسة المراجعة. استخدم /analyze لإنشاء مراجعة جديدة.");

    const lastIndex = session.result.moves.length - 1;
    switch (match[1]) {
      case "first": session.index = 0; break;
      case "prev": session.index = Math.max(0, session.index - 1); break;
      case "next": session.index = Math.min(lastIndex, session.index + 1); break;
      case "last": session.index = lastIndex; break;
    }

    await interaction.deferUpdate();
    await interaction.editReply({
      ...await this.gameAnalysisPayload(match[2]!, session),
      attachments: []
    });
  }

  private async handleAnalyze(interaction: ChatInputCommandInteraction): Promise<void> {
    const link = this.db.getLinkByDiscord(interaction.guildId!, interaction.user.id);
    if (!link) return void await replyError(interaction, "اربط حساب Chess.com أولًا قبل طلب التحليل.");
    const key = `${interaction.guildId}:${interaction.user.id}`;
    if (this.analysesInProgress.has(key)) return void await replyError(interaction, "يوجد تحليل لمباراتك قيد التنفيذ بالفعل.");
    const waitMilliseconds = 60_000 - (Date.now() - (this.lastAnalysisAt.get(key) ?? 0));
    if (waitMilliseconds > 0) {
      return void await replyError(interaction, `انتظر ${Math.ceil(waitMilliseconds / 1000)} ثانية قبل طلب تحليل آخر.`);
    }

    this.analysesInProgress.add(key);
    this.lastAnalysisAt.set(key, Date.now());
    await interaction.deferReply();
    await interaction.editReply("جاري جلب آخر مباراة مكتملة وتحليلها بواسطة Stockfish…");
    try {
      const game = await this.chess.getLatestCompletedGame(link.chessUsername);
      const result = await analyzeCompletedGame(game, link.chessUsername, this.engine, this.config.engineDepth);
      const review = this.createReviewSession(result, null);
      await interaction.editReply(await this.gameAnalysisPayload(review.id, review.session));
      this.db.audit(interaction.guildId!, interaction.user.id, "game_analyzed", { gameUrl: result.gameUrl, depth: result.engineDepth });
    } catch (error) {
      console.error("Game analysis failed", error);
      await interaction.editReply(`❌ ${userFacingError(error)}`);
    } finally {
      this.analysesInProgress.delete(key);
    }
  }

  private async handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return void await replyError(interaction, "تحتاج صلاحية Manage Server.");
    }
    const existingSettings = this.db.getGuildSettings(interaction.guildId!);
    if (existingSettings) {
      return void await interaction.reply({
        content: `النظام معد مسبقًا وروم الربط هو <#${existingSettings.verifyChannelId}>. لن أعيد إنشاء الرومات تلقائيًا.`,
        flags: MessageFlags.Ephemeral
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lockExisting = interaction.options.getBoolean("lock_existing", true);
    const logChannel = interaction.options.getChannel("log_channel");
    const settings = await setupGuild(interaction.guild!, lockExisting, logChannel?.id);
    this.db.upsertGuildSettings(settings);
    this.db.audit(interaction.guildId!, interaction.user.id, "guild_setup", { lockExisting, settings });
    await interaction.editReply(
      `تم الإعداد. روم التحقق: <#${settings.verifyChannelId}>، وروم المراجعات التلقائية: <#${settings.analysisChannelId}>. ` +
      (lockExisting ? "تم قفل الرومات الحالية لغير الموثقين؛ راجعها بخيار View Server As Role." : "لم ألمس صلاحيات الرومات الحالية.")
    );
  }

  private async handleSetupReviews(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return void await replyError(interaction, "تحتاج صلاحية Manage Server.");
    }
    const settings = this.db.getGuildSettings(interaction.guildId!);
    if (!settings) return void await replyError(interaction, "شغّل /setup أولًا لإعداد نظام التحقق الأساسي.");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const requestedChannel = interaction.options.getChannel("channel");
    const analysisChannelId = await setupAnalysisChannel(interaction.guild!, settings.verifiedRoleId, requestedChannel?.id);
    this.db.upsertGuildSettings({ ...settings, analysisChannelId });
    this.db.audit(interaction.guildId!, interaction.user.id, "analysis_channel_configured", { analysisChannelId });

    const channel = await interaction.guild!.channels.fetch(analysisChannelId);
    if (channel?.isTextBased() && !channel.isDMBased()) {
      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ تم تفعيل مراجعات المباريات التلقائية")
          .setDescription(
            `سيراقب SoliChess مباريات الأعضاء المرتبطين كل **${this.config.gameCheckIntervalMinutes} دقيقة**، ` +
            "وعند اكتشاف مباراة مكتملة جديدة سينشر مراجعة Stockfish التفاعلية هنا."
          )
          .setFooter({ text: "لن تُعاد مراجعة مباراة سبق تحليلها" })]
      });
    }

    await interaction.editReply(
      `تم اعتماد <#${analysisChannelId}> للمراجعات التلقائية. ستظهر المباراة الجديدة بعد اكتمالها خلال ${this.config.gameCheckIntervalMinutes} دقيقة كحد أقصى.`
    );
    void this.monitorCompletedGames();
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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

  private async monitorCompletedGames(): Promise<void> {
    if (this.gameMonitorRunning) return;
    this.gameMonitorRunning = true;
    try {
      for (const link of this.db.listLinks()) {
        if (isClosedStatus(link.accountStatus)) continue;
        const key = `${link.guildId}:${link.discordUserId}`;
        if (this.analysesInProgress.has(key)) continue;
        this.analysesInProgress.add(key);
        try {
          const game = await this.chess.getLatestCompletedGame(link.chessUsername);
          if (game.url === link.lastAnalyzedGameUrl) continue;
          const guild = await this.client.guilds.fetch(link.guildId);
          const member = await guild.members.fetch(link.discordUserId).catch(() => null);
          if (!member) continue;
          const settings = this.db.getGuildSettings(link.guildId);
          if (!settings) continue;
          const channel = await guild.channels.fetch(settings.analysisChannelId).catch(() => null);
          if (!channel?.isTextBased() || channel.isDMBased()) continue;

          const result = await analyzeCompletedGame(game, link.chessUsername, this.engine, this.config.engineDepth);
          const review = this.createReviewSession(result, `♟️ مراجعة تلقائية لمباراة <@${link.discordUserId}> الجديدة`);
          await channel.send(await this.gameAnalysisPayload(review.id, review.session));
          this.db.updateLastAnalyzedGame(link.guildId, link.discordUserId, game.url);
          this.db.audit(link.guildId, link.discordUserId, "automatic_game_analysis", { gameUrl: game.url, depth: result.engineDepth });
        } catch (error) {
          console.error(`Automatic game analysis failed for ${link.guildId}/${link.discordUserId}`, error);
        } finally {
          this.analysesInProgress.delete(key);
        }
      }
    } finally {
      this.gameMonitorRunning = false;
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
