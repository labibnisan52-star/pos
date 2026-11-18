import {
  PageSkeletonHeader,
  StatCardsSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-gray-50">
      <PageSkeletonHeader />
      <StatCardsSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-100 space-y-3">
          <Skeleton className="h-5 w-40 rounded-md" />
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-14 w-full rounded-xl" />
          ))}
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-3">
          <Skeleton className="h-5 w-32 rounded-md" />
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

