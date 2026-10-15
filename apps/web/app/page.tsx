import { redirect } from "next/navigation";
import { getServerSession } from "../lib/server-session";

export default async function HomePage() {
  redirect((await getServerSession()) ? "/news" : "/auth");
}
