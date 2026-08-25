import { getIssues } from "@/lib/issues";
import { HomeView } from "@/components/HomeView";

export default async function Home() {
  const issues = await getIssues();

  return <HomeView issues={issues} />;
}
