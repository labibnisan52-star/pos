import { TablePageSkeleton } from "@/components/ui/skeleton";

export default function CustomerDetailLoading() {
  return <TablePageSkeleton statCount={3} rows={5} showFilters={false} />;
}

