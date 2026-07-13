"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // If auth state finishes loading and user is null, redirect to login
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-50">
        <div className="text-xs uppercase tracking-widest text-zinc-500 animate-pulse">
          Loading Gateway Context...
        </div>
      </div>
    );
  }

  // Determine KYC verification status
  const isUnlocked = user.role === "CHECKER" || user.kycStatus === "APPROVED" || user.kycStatus === "VERIFIED";

  // Define navigation items with KYC gating constraints
  const navItems = [
    { name: "Overview", path: "/dashboard", requiresKyc: false },
    { name: "Accounts", path: "/dashboard/accounts", requiresKyc: true },
    { name: "Transfers", path: "/dashboard/transfers", requiresKyc: true },
    { name: "Maker-Checker Queue", path: "/dashboard/approvals", requiresKyc: false },
  ];

  // Map user role to badge variant
  const getRoleVariant = (role: string) => {
    switch (role) {
      case "OPERATIONS": return "warning";
      case "CHECKER": return "success";
      case "MAKER": return "info";
      case "AUDITOR": return "neutral";
      default: return "info";
    }
  };

  const getKycVariant = (status: string) => {
    switch (status) {
      case "APPROVED":
      case "VERIFIED": return "success";
      case "SUBMITTED": return "warning";
      case "REJECTED":
      case "SUSPENDED": return "error";
      default: return "neutral";
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-zinc-50">
      {/* Left Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200 bg-white p-6 flex flex-col justify-between">
        <div className="space-y-8">
          {/* Logo Brand */}
          <div className="flex items-center space-x-2">
            <span className="h-4 w-4 bg-zinc-950" />
            <span className="text-xs uppercase font-bold tracking-widest text-zinc-900">
              LEDGER EDGE
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              const isLocked = item.requiresKyc && !isUnlocked;

              if (isLocked) {
                return (
                  <div
                    key={item.path}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300 cursor-not-allowed select-none flex items-center justify-between"
                    title="Unlock requires KYC verification"
                  >
                    <span>{item.name}</span>
                    <span className="text-[10px] ml-1">🔒</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-zinc-900 text-zinc-50"
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Session Segment */}
        <div className="mt-8 pt-6 border-t border-zinc-100 space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-zinc-900 truncate">
              {user.firstName ? `${user.firstName} ${user.lastName || ""}` : "New Profile"}
            </div>
            <div className="text-[10px] text-zinc-500 truncate mb-1">
              {user.email}
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              <Badge variant={getRoleVariant(user.role)}>
                {user.role}
              </Badge>
              <Badge variant={getKycVariant(user.kycStatus)}>
                KYC: {user.kycStatus}
              </Badge>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={logout}
            className="w-full text-xs"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 flex flex-col bg-zinc-50 overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-200 bg-white px-8 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">
            {pathname === "/dashboard" && "Dashboard Overview"}
            {pathname === "/dashboard/accounts" && "Accounts Repository"}
            {pathname === "/dashboard/transfers" && "Transfer Saga Gateway"}
            {pathname === "/dashboard/approvals" && "Maker-Checker Control Board"}
          </div>
          <div className="text-[10px] font-mono text-zinc-400">
            SECURE ACCESS ID: {user.id}
          </div>
        </header>

        {/* Child Content Panel */}
        <div className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}
