import { ToolsIdentityProvider } from "@/context/tools-identity-context";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <ToolsIdentityProvider>{children}</ToolsIdentityProvider>;
}
