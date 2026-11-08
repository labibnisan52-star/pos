"use client";

import React, { useState, useEffect } from "react";
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
  RotateCcw,
  ShoppingCart,
  Briefcase,
  Menu,
  X,
  Globe,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/utils/supabase/client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const supabase = createClient();
  const { user, role, loading } = useAuth();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
    {
      name: "Public Catalog",
      href: "/catalog",
      icon: Globe,
      external: true,
    },
  ];

  const navItems =
    role === "owner"
      ? allNavItems
      : allNavItems.filter((item) =>
          [
            "POS",
            "Returns",
            "Customers",
            "History",
            "Settings",
            "Public Catalog",
          ].includes(item.name)
        );

  const currentNav = allNavItems.find(
    (item) =>
      pathname === item.href ||
      (pathname.startsWith(item.href) && item.href !== "/dashboard")
  );

  const isRestrictedForSalesman =
    !loading &&
    role === "salesman" &&
    (pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/analytics") ||
      pathname.startsWith("/dashboard/products") ||
      pathname.startsWith("/dashboard/purchases") ||
      pathname.startsWith("/dashboard/investors"));

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-gray-50 overflow-hidden font-sans">
      {/* Mobile Top Bar (< md) */}
      <header className="md:hidden h-14 px-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-800 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-black tracking-tight text-gray-900">
              RIZQ
            </span>
            {currentNav && (
              <span className="text-xs font-semibold text-gray-500">
                / {currentNav.name}
              </span>
            )}
          </div>
        </div>

        <Link
          href="/dashboard/pos"
          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            pathname === "/dashboard/pos"
              ? "bg-[#f3f0ea] text-gray-900"
              : "bg-black text-white"
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>POS</span>
        </Link>
      </header>

      {/* Mobile Hamburger Drawer (< md) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-2xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[84vw] bg-white h-full shadow-2xl flex flex-col justify-between z-10 overflow-y-auto">
            <div>
              <div className="h-16 px-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-lg font-black tracking-tight text-gray-900">
                    RIZQ POS
                  </span>
                  <p className="text-[11px] text-gray-500">
                    Shoe Store Management
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="p-3 space-y-1">
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (pathname.startsWith(item.href) &&
                      item.href !== "/dashboard");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        isActive
                          ? "bg-[#f3f0ea] text-gray-900"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? "text-gray-900" : "text-gray-400"
                        }`}
                      />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="p-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-3 px-1">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-gray-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 capitalize truncate">
                    {role || "Staff"}
                  </p>
                  {user?.email && (
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop & Tablet Sidebar (md+) */}
      <aside
        className={`hidden md:flex bg-white border-r border-gray-200 transition-all duration-200 ease-in-out flex-col justify-between shrink-0 ${
          isExpanded ? "w-60" : "w-20"
        }`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className="overflow-y-auto no-scrollbar">
          {/* Logo */}
          <div className="h-16 flex items-center px-5 border-b border-gray-100">
            {isExpanded ? (
              <div className="flex flex-col">
                <span className="text-xl font-black tracking-tight text-gray-900">
                  RIZQ
                </span>
                <span className="text-[11px] font-medium text-gray-400">
                  Shoe POS
                </span>
              </div>
            ) : (
              <span className="text-xl font-black tracking-tight text-gray-900 mx-auto">
                RZ
              </span>
            )}
          </div>

          {/* Nav Links */}
          <nav className="p-3 space-y-1.5">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (pathname.startsWith(item.href) && item.href !== "/dashboard");
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  title={!isExpanded ? item.name : undefined}
                  className={`min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                    isActive
                      ? "bg-[#f3f0ea] text-gray-900"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  } ${!isExpanded ? "justify-center" : ""}`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${
                      isActive ? "text-gray-900" : "text-gray-400"
                    }`}
                  />
                  {isExpanded && (
                    <span className="font-semibold text-sm truncate">
                      {item.name}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User / Bottom */}
        <div className="p-3 border-t border-gray-100 shrink-0">
          <div
            className={`flex items-center gap-3 px-2 py-2 ${
              !isExpanded ? "justify-center" : ""
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-gray-500" />
            </div>
            {isExpanded && (
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-bold text-gray-900 truncate capitalize">
                  {role ? role : "Loading..."}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs text-left font-semibold text-red-600 hover:text-red-800 mt-0.5"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col bg-gray-50">
        {isRestrictedForSalesman ? (
          <div className="flex-1 flex items-center justify-center flex-col p-6 text-center">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Access Restricted
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">
              Your account does not have permission to view owner management
              pages.
            </p>
            <Link
              href="/dashboard/pos"
              className="min-h-[46px] bg-black text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors flex items-center"
            >
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
