import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import type { Account, ApprovalRequest } from "@fintech/shared-types";

interface StatsGridProps {
  accounts: Account[];
  balances: Record<string, number>;
  approvals: ApprovalRequest[];
}

export function StatsGrid({ accounts, balances, approvals }: StatsGridProps) {
  // Sum INR balances
  const totalInr = accounts
    .filter((a) => a.currency === "INR" && a.status === "ACTIVE")
    .reduce((sum, a) => sum + (balances[a.id] || 0), 0);

  // Sum USD balances
  const totalUsd = accounts
    .filter((a) => a.currency === "USD" && a.status === "ACTIVE")
    .reduce((sum, a) => sum + (balances[a.id] || 0), 0);

  const pendingApprovalsCount = approvals.filter((a) => a.status === "PENDING").length;
  const activeAccountsCount = accounts.filter((a) => a.status === "ACTIVE").length;

  const formatRupees = (amount: number) => {
    return amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* INR Balance */}
      <Card>
        <CardHeader className="pb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Total INR Portfolio (Active)
          </span>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-medium tracking-tight text-zinc-950">
            ₹<span className="ledger-number">{formatRupees(totalInr)}</span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
            Primary Ledger Base
          </p>
        </CardContent>
      </Card>

      {/* USD Balance */}
      <Card>
        <CardHeader className="pb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Total USD Portfolio (Active)
          </span>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-medium tracking-tight text-zinc-950">
            $<span className="ledger-number">{formatRupees(totalUsd)}</span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
            Ledger Settlement Base
          </p>
        </CardContent>
      </Card>

      {/* Active Accounts */}
      <Card>
        <CardHeader className="pb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Active Accounts
          </span>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-medium tracking-tight text-zinc-950">
            <span className="ledger-number">{activeAccountsCount}</span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
            Total Accounts: {accounts.length}
          </p>
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card className={pendingApprovalsCount > 0 ? "border-amber-500/50" : ""}>
        <CardHeader className="pb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Maker-Checker Items
          </span>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-medium tracking-tight text-zinc-950">
            <span className="ledger-number">{pendingApprovalsCount}</span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">
            Awaiting checker approval
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
