import { getIssues } from "@/lib/issues";
import { HomeView } from "@/components/HomeView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const issues = await getIssues();

  return <HomeView issues={issues} />;
}
