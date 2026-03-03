"use client";

import { getMe } from "@/lib/api/client";

export const PROFILE_COMPLETION_PATH = "/parent/profile-completion";

type EnforceProfileCompletionParams = {
  childId: number | null | undefined;
  redirect: (target: string) => void;
};

export async function enforceProfileCompletionRedirect(params: EnforceProfileCompletionParams): Promise<boolean> {
  const childId = typeof params.childId === "number" && Number.isFinite(params.childId) && params.childId > 0 ? params.childId : null;
  if (childId === null) {
    return false;
  }
  try {
    const me = await getMe();
    const child = me.child_profiles.find((item) => item.id === childId);
    if (!child) {
      return false;
    }
    const missingDateOfBirth = !child.date_of_birth || String(child.date_of_birth).trim().length === 0;
    if (missingDateOfBirth || child.needs_profile_completion) {
      params.redirect(`${PROFILE_COMPLETION_PATH}?childId=${child.id}`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
