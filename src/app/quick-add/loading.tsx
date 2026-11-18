import { Skeleton } from "@/components/ui/skeleton";

export default function QuickAddLoading() {
  return (
    <div className="flex flex-col h-dvh bg-[#faf9f6] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36 rounded-xl" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <div className="flex-1 space-y-3 overflow-hidden">
        <Skeleton className="h-20 w-4/5 rounded-2xl" />
        <Skeleton className="h-14 w-3/5 rounded-2xl ml-auto" />
        <Skeleton className="h-28 w-4/5 rounded-2xl" />
      </div>
      <Skeleton className="h-14 w-full rounded-2xl" />
    </div>
  );
}

