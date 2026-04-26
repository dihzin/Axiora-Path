import { getToolsCredits, type PrimaryLoginResponse } from "@/lib/api/client";
import { setAccessToken, setUserDisplayName } from "@/lib/api/session";

type FinishPrimaryLoginParams = {
  loginResponse: PrimaryLoginResponse;
};

export async function finishPrimaryLogin({ loginResponse }: FinishPrimaryLoginParams) {
  const membership = loginResponse.memberships.find((item) => item.tenant_type === "FAMILY");
  if (!membership) {
    throw new Error("TOOLS_ACCESS_DENIED");
  }

  setAccessToken(loginResponse.access_token);
  setUserDisplayName(loginResponse.user.email);
  document.cookie = "ax_tools_auth=1; Path=/tools; Max-Age=604800; SameSite=Lax";
  const creditsResponse = await getToolsCredits().catch(() => ({ credits: 0 }));
  return Math.max(0, Number(creditsResponse.credits) || 0);
}
