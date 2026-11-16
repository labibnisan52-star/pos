import DashboardLayout from "@/app/dashboard/layout";

export default function QuickAddLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
