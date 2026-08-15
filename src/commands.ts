import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("إعداد نظام التحقق الإجباري من Chess.com")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option
        .setName("lock_existing")
        .setDescription("إخفاء الرومات الحالية عن غير الموثقين (استخدم View Server As Role بعد الإعداد)")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("log_channel")
        .setDescription("روم سجلات التحقق والحسابات المغلقة")
        .addChannelTypes(ChannelType.GuildText)
    ),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("عرض ملف وتصنيفات لاعب موثق")
    .addUserOption((option) => option.setName("member").setDescription("العضو؛ اتركه فارغًا لعرض حسابك")),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("ترتيب أعضاء السيرفر حسب تصنيف Chess.com")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("نوع اللعب")
        .setRequired(true)
        .addChoices(
          { name: "Rapid", value: "rapid" },
          { name: "Blitz", value: "blitz" },
          { name: "Bullet", value: "bullet" }
        )
    ),
  new SlashCommandBuilder()
    .setName("puzzle")
    .setDescription("ابدأ لغز شطرنج تفاعليًا داخل ديسكورد"),
  new SlashCommandBuilder()
    .setName("puzzle-stats")
    .setDescription("عرض تقييم وإحصائيات الألغاز")
    .addUserOption((option) => option.setName("member").setDescription("العضو؛ اتركه فارغًا لعرض إحصائياتك")),
  new SlashCommandBuilder()
    .setName("analyze")
    .setDescription("تحليل آخر مباراة Chess.com مكتملة للحساب المرتبط"),
  new SlashCommandBuilder()
    .setName("setup-reviews")
    .setDescription("إعداد روم مراجعات المباريات التلقائية")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("روم المراجعات؛ اتركه فارغًا ليُنشئ البوت رومًا جديدًا")
        .addChannelTypes(ChannelType.GuildText)
    ),
  new SlashCommandBuilder()
    .setName("setup-daily-puzzle")
    .setDescription("إعداد روم وتوقيت تحدي الألغاز الدوري")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("الروم الذي تُنشر فيه الألغاز والنتائج")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addIntegerOption((option) =>
      option
        .setName("interval")
        .setDescription("مدة كل جولة بالساعات")
        .setRequired(true)
        .addChoices(
          { name: "كل 6 ساعات", value: 6 },
          { name: "كل 12 ساعة", value: 12 }
        )
    ),
  new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("تحديث بيانات Chess.com لعضو")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) => option.setName("member").setDescription("العضو المطلوب").setRequired(true)),
  new SlashCommandBuilder()
    .setName("restore")
    .setDescription("إعادة عضو معزول بعد التأكد أن حساب Chess.com عاد نشطًا")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) => option.setName("member").setDescription("العضو المطلوب").setRequired(true)),
  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("فك ربط إداري مع تسجيل السبب")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) => option.setName("member").setDescription("العضو المطلوب").setRequired(true))
    .addStringOption((option) =>
      option.setName("reason").setDescription("سبب فك الربط").setRequired(true).setMinLength(5).setMaxLength(300)
    )
];

export const commandJson = commandBuilders.map((command) => command.toJSON());
