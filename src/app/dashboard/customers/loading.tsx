import { TablePageSkeleton } from "@/components/ui/skeleton";

export default function CustomersLoading() {
  return <TablePageSkeleton statCount={3} rows={6} />;
}

