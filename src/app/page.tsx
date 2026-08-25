import { getIssues } from "@/lib/issues";
import { IssueMap } from "@/components/IssueMap";

export default async function Home() {
  const issues = await getIssues();

  return <IssueMap issues={issues} />;
}
