import { redirect } from "next/navigation";

export default function AdminExperimentsRedirectPage() {
  redirect("/platform-admin/experiments");
}
