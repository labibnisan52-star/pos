import { TablePageSkeleton } from "@/components/ui/skeleton";

export default function InvestorsLoading() {
  return <TablePageSkeleton statCount={3} rows={5} />;
}

