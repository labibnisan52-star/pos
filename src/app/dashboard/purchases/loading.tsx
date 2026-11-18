import { TablePageSkeleton } from "@/components/ui/skeleton";

export default function PurchasesLoading() {
  return <TablePageSkeleton statCount={3} rows={6} />;
}

