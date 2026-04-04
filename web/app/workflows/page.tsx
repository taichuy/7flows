import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkflowsPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  const searchString = new URLSearchParams(resolvedParams as Record<string, string>).toString();
  redirect(`/workspace${searchString ? `?${searchString}` : ""}`);
}
