import React from "react";

export function Skeleton({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-gray-200/80 ${className}`}
      {...props}
    />
  );
}

export function PageSkeletonHeader({
  showAction = true,
}: {
  showAction?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44 rounded-lg" />
        <Skeleton className="h-4 w-64 rounded-lg bg-gray-200/60" />
      </div>
      {showAction && <Skeleton className="h-11 w-36 rounded-xl shrink-0" />}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2.5"
        >
          <Skeleton className="h-3.5 w-24 rounded-md bg-gray-200/70" />
          <Skeleton className="h-7 w-28 rounded-lg" />
          <Skeleton className="h-3 w-16 rounded-md bg-gray-200/60" />
        </div>
      ))}
    </div>
  );
}

export function TablePageSkeleton({
  statCount = 0,
  rows = 6,
  showFilters = true,
}: {
  statCount?: number;
  rows?: number;
  showFilters?: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-gray-50">
      <PageSkeletonHeader />

      {statCount > 0 && <StatCardsSkeleton count={statCount} />}

      {showFilters && (
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 flex flex-col sm:flex-row gap-2.5">
          <Skeleton className="h-11 flex-1 rounded-xl" />
          <Skeleton className="h-11 w-full sm:w-40 rounded-xl" />
          <Skeleton className="h-11 w-full sm:w-32 rounded-xl" />
        </div>
      )}

      {/* Mobile card list skeleton */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: Math.min(rows, 5) }).map((_, idx) => (
          <div
            key={idx}
            className="bg-white p-4 rounded-2xl border border-gray-100 space-y-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md bg-gray-200/60" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Skeleton className="h-10 w-20 rounded-xl" />
              <Skeleton className="h-10 w-20 rounded-xl" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table skeleton */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4">
          <Skeleton className="h-4 w-12 rounded-md" />
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md ml-auto" />
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: rows }).map((_, idx) => (
            <div key={idx} className="px-5 py-3.5 flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48 rounded-md" />
                <Skeleton className="h-3 w-28 rounded-md bg-gray-200/60" />
              </div>
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <div className="flex gap-1.5">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <Skeleton className="w-9 h-9 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PosPageSkeleton() {
  return (
    <div className="flex flex-1 h-full min-h-0 overflow-hidden bg-[#faf9f6]">
      {/* Left catalog area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-11 flex-1 rounded-xl bg-white" />
          <Skeleton className="w-11 h-11 rounded-xl bg-white shrink-0" />
          <Skeleton className="w-11 h-11 rounded-xl bg-white shrink-0" />
        </div>

        <div className="flex items-center gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton
              key={idx}
              className="h-9 w-20 rounded-full shrink-0 bg-white"
            />
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white p-3 rounded-2xl border border-gray-100 space-y-2.5"
            >
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-14 rounded-md" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop right cart skeleton */}
      <div className="hidden md:flex md:w-[370px] lg:w-[410px] xl:w-[440px] border-l border-gray-200 bg-white flex-col justify-between p-4 shrink-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md bg-gray-200/60" />
              </div>
            </div>
            <Skeleton className="h-8 w-16 rounded-xl" />
          </div>
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function FormPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-gray-50 max-w-4xl w-full mx-auto">
      <PageSkeletonHeader showAction={false} />
      {Array.from({ length: cards }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white p-5 rounded-2xl border border-gray-100 space-y-4"
        >
          <Skeleton className="h-5 w-40 rounded-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

