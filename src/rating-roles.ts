import type { Guild, GuildMember, Role } from "discord.js";
import type { ChessComProfile, RatingSnapshot, TimeClass } from "./types.js";

const ROLE_PREFIX: Record<TimeClass, string> = {
  rapid: "Rapid • ",
  blitz: "Blitz • ",
  bullet: "Bullet • "
};

const BRACKETS = [0, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400] as const;

export const TITLE_CODES = ["GM", "WGM", "IM", "WIM", "FM", "WFM", "NM", "WNM", "CM", "WCM"] as const;

export function ratingBracket(rating: number): string {
  const start = [...BRACKETS].reverse().find((value) => rating >= value) ?? 0;
  if (start === 2400) return "2400+";
  const index = BRACKETS.indexOf(start as (typeof BRACKETS)[number]);
  const next = BRACKETS[index + 1];
  if (next === undefined) return `${start}+`;
  return `${start}–${next - 1}`;
}

export function ratingRoleName(timeClass: TimeClass, rating: number): string {
  return `${ROLE_PREFIX[timeClass]}${ratingBracket(rating)}`;
}

export function allRatingRoleNames(): string[] {
  const names: string[] = [];
  for (const timeClass of Object.keys(ROLE_PREFIX) as TimeClass[]) {
    for (const start of BRACKETS) {
      names.push(ratingRoleName(timeClass, start));
    }
  }
  return names;
}

export function isManagedRatingRole(role: Role): boolean {
  return Object.values(ROLE_PREFIX).some((prefix) => role.name.startsWith(prefix));
}

export function titleRoleName(title: string): string {
  return `Title • ${title.toUpperCase()}`;
}

function findRole(guild: Guild, name: string): Role | undefined {
  return guild.roles.cache.find((role) => role.name === name);
}

export async function applyChessRoles(
  member: GuildMember,
  verifiedRoleId: string,
  reviewRoleId: string,
  ratings: RatingSnapshot,
  profile: ChessComProfile
): Promise<void> {
  const removeIds = member.roles.cache
    .filter((role) => isManagedRatingRole(role) || role.name.startsWith("Title • ") || role.id === reviewRoleId)
    .map((role) => role.id);

  const addIds: string[] = [verifiedRoleId];
  for (const timeClass of ["rapid", "blitz", "bullet"] as const) {
    const rating = ratings[timeClass];
    if (rating === null) continue;
    const role = findRole(member.guild, ratingRoleName(timeClass, rating));
    if (role) addIds.push(role.id);
  }

  if (profile.title) {
    const role = findRole(member.guild, titleRoleName(profile.title));
    if (role) addIds.push(role.id);
  }

  if (removeIds.length) await member.roles.remove(removeIds, "Chess.com roles refresh");
  await member.roles.add(addIds, "Chess.com account verified");
}

export async function quarantineMember(member: GuildMember, verifiedRoleId: string, reviewRoleId: string): Promise<void> {
  const removeIds = member.roles.cache
    .filter((role) => role.id === verifiedRoleId || isManagedRatingRole(role) || role.name.startsWith("Title • "))
    .map((role) => role.id);
  if (removeIds.length) await member.roles.remove(removeIds, "Chess.com account closed");
  await member.roles.add(reviewRoleId, "Chess.com account requires staff review");
}
