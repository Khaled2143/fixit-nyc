import { getIssues } from "@/lib/issues";

export default async function Home() {
  const issues = await getIssues();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Fix It NYC</h1>
      <ul className="mt-6 flex flex-col gap-4">
        {issues.map((issue) => (
          <li key={issue.id} className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="font-medium">{issue.category}</p>
            <p className="text-zinc-600 dark:text-zinc-400">{issue.description}</p>
            {issue.address && (
              <p className="mt-1 text-sm text-zinc-500">{issue.address}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
