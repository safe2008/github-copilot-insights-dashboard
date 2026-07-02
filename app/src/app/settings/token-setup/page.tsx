import { redirect } from "next/navigation";

/** The former "Token Setup" page has merged into /settings/token. */
export default function TokenSetupRedirect() {
  redirect("/settings/token");
}
