"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Store, 
  Package, 
  Users,
  History,
  BarChart2, 
  Settings,
  User,
  LogOut,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  ShoppingCart,
  Briefcase
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/utils/supabase/client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const supabase = createClient();
  const { role, loading } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const allNavItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "POS", href: "/dashboard/pos", icon: Store },
    { name: "Returns", href: "/dashboard/returns", icon: RotateCcw },
    { name: "Products", href: "/dashboard/products", icon: Package },
    { name: "Purchases", href: "/dashboard/purchases", icon: ShoppingCart },
    { name: "Investors", href: "/dashboard/investors", icon: Briefcase },
    { name: "Customers", href: "/dashboard/customers", icon: Users },
    { name: "History", href: "/dashboard/history", icon: History },
    { name: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  const navItems = role === "owner" 
    ? allNavItems 
    : allNavItems.filter(item => ["POS", "Returns", "Customers", "History"].includes(item.name));

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        className={`bg-white border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col justify-between ${
          isExpanded ? "w-64" : "w-20"
        }`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div>
          {/* Logo */}
          <div className="h-20 flex items-center px-6 border-b border-gray-100">
            {isExpanded ? (
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-gray-900">RIZQ</span>
                <span className="text-xs text-gray-400">POS</span>
              </div>
            ) : (
              <span className="text-xl font-bold tracking-tight text-gray-900 ml-1">RZ</span>
            )}
          </div>

          {/* Nav Links */}
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/dashboard");
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-xl transition-colors ${
                    isActive 
                      ? "bg-[#f3f0ea] text-gray-900" 
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-gray-900" : "text-gray-400"}`} />
                  {isExpanded && <span className="font-medium text-sm">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User / Bottom */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center space-x-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-gray-500" />
            </div>
            {isExpanded && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <span className="text-sm font-semibold text-gray-900 truncate capitalize">
                  {role ? role : "Loading..."}
                </span>
                <button onClick={handleLogout} className="text-xs text-left text-red-500 hover:text-red-700">
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col h-full bg-gray-50">
        {!loading && role === "salesman" && (
          pathname === "/dashboard" || 
          pathname.startsWith("/dashboard/analytics") || 
          pathname.startsWith("/dashboard/settings") || 
          pathname.startsWith("/dashboard/products")
        ) ? (
          <div className="flex-1 flex items-center justify-center flex-col p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-500 mb-6">You don't have permission to view this page.</p>
            <Link href="/dashboard/pos" className="bg-black text-white px-6 py-2 rounded-xl font-medium hover:bg-gray-800 transition-colors">
              Go to POS
            </Link>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
