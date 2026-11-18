import {
  PageSkeletonHeader,
  StatCardsSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-gray-50">
      <PageSkeletonHeader showAction={false} />
      <StatCardsSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-3">
          <Skeleton className="h-5 w-44 rounded-md" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-3">
          <Skeleton className="h-5 w-44 rounded-md" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

