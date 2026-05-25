import type { Profile } from "@/lib/types";

export function getProfileDisplayName(profile: Profile | null) {
  return profile?.email ?? null;
}

export function getProfileInitials(profile: Profile | null) {
  const email = profile?.email;

  if (!email) {
    return "DH";
  }

  const localPart = email.split("@")[0] ?? "";
  const parts = localPart.split(/[^a-z0-9]+/i).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return localPart.slice(0, 2).toUpperCase() || "DH";
}
