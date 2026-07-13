"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/components/providers/AuthProvider";
import type { ApprovalRequest } from "@fintech/shared-types";

export default function ApprovalsPage() {
  const { user, approvals, reviewKyc, reviewTransfer } = useAuth();
  
  const [selectedReq, setSelectedReq] = useState<ApprovalRequest | null>(null);
  const [justification, setJustification] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReview = async (decision: "APPROVE" | "REJECT") => {
    if (!user || !selectedReq) return;
    setFeedback(null);

    const isChecker = user.role === "CHECKER" || user.role === "OPERATIONS";
    if (!isChecker) {
      setFeedback({ type: "error", text: "UNAUTHORIZED: Only compliance CHECKER roles can resolve review tickets." });
      return;
    }

    if (!justification.trim()) {
      setFeedback({ type: "error", text: "A justification reason is required for compliance audit logs." });
      return;
    }

    setLoading(true);

    try {
      const isKycTicket = selectedReq.id.startsWith("req_kyc_") || (selectedReq.payload && "documentType" in selectedReq.payload);

      if (isKycTicket) {
        await reviewKyc(selectedReq.id, decision, justification.trim());
      } else {
        await reviewTransfer(selectedReq.id, decision);
      }

      setFeedback({
        type: "success",
        text: `Successfully resolved ticket ${selectedReq.id} as ${decision}D.`
      });

      setSelectedReq(null);
      setJustification("");
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to process review." });
    } finally {
      setLoading(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "APPROVED": return "success";
      case "PENDING": return "warning";
      case "REJECTED": return "error";
      default: return "neutral";
    }
  };

  const isChecker = user?.role === "CHECKER" || user?.role === "OPERATIONS";

  const getTicketTitle = (req: ApprovalRequest) => {
    const isKyc = req.id.startsWith("req_kyc_") || (req.payload && "documentType" in req.payload);
    return isKyc ? "KYC COMPLIANCE REVIEW" : req.actionType.replace("_", " ");
  };

  return (
    <div className="space-y-8">
      {feedback && (
        <div
          className={`p-3 text-xs border ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Approvals List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Pending Control Tickets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {approvals.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-400 uppercase tracking-wider">
                  Approval queue is empty.
                </div>
              ) : (
                <div className="divide-y divide-zinc-150">
                  {approvals.map((req: ApprovalRequest) => (
                    <div
                      key={req.id}
                      onClick={() => !loading && setSelectedReq(req)}
                      className={`py-4 first:pt-0 last:pb-0 flex items-center justify-between cursor-pointer group transition-colors ${
                        selectedReq?.id === req.id ? "bg-zinc-100/50 px-3" : ""
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs uppercase font-bold text-zinc-800 group-hover:underline">
                            {getTicketTitle(req)}
                          </span>
                          <Badge variant={getStatusVariant(req.status)}>
                            {req.status}
                          </Badge>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          TICKET ID: {req.id}
                        </div>
                        <div className="text-[10px] text-zinc-500 uppercase">
                          Maker ID: {req.makerId.slice(0, 12)}...
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-zinc-400 group-hover:text-foreground">
                          Inspect →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Panel Details */}
        <div className="lg:col-span-1">
          {selectedReq ? (
            <Card className="border border-zinc-300 bg-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Ticket Inspection</span>
                  <button
                    onClick={() => setSelectedReq(null)}
                    className="text-xs text-zinc-400 hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
                <CardTitle className="text-base font-semibold mt-2">
                  {getTicketTitle(selectedReq)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Details list */}
                <div className="space-y-3 bg-zinc-50 p-4 border border-zinc-150 text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 block font-semibold">Correlation ID</span>
                    <span className="font-mono text-zinc-700 select-all">{selectedReq.correlationId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 block font-semibold">Target User/Resource ID</span>
                    <span className="font-mono text-zinc-700 select-all">{selectedReq.targetResourceId}</span>
                  </div>
                  
                  {/* KYC specific details display */}
                  {selectedReq.payload && "documentType" in selectedReq.payload ? (
                    <>
                      <div>
                        <span className="text-[10px] uppercase text-zinc-400 block font-semibold">Applicant Email</span>
                        <span className="font-semibold text-zinc-800">{selectedReq.payload.email as string}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-zinc-400 block font-semibold">Applicant Legal Name</span>
                        <span className="font-semibold text-zinc-800">
                          {selectedReq.payload.firstName as string} {selectedReq.payload.lastName as string}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-zinc-400 block font-semibold">Document Type</span>
                        <span className="text-zinc-700 uppercase font-mono text-[10px]">{selectedReq.payload.documentType as string}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-zinc-400 block font-semibold">Document ID Number</span>
                        <span className="font-mono font-semibold text-zinc-800 select-all">{selectedReq.payload.documentNumber as string}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Transfers specific details */}
                      {selectedReq.actionType === "LIMIT_OVERRIDE" && selectedReq.payload.fromAccountId && (
                        <>
                          <div>
                            <span className="text-[10px] uppercase text-zinc-400 block font-semibold">From Account</span>
                            <span className="font-mono text-zinc-700">{selectedReq.payload.fromAccountId as string}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-zinc-400 block font-semibold">To Account</span>
                            <span className="font-mono text-zinc-700">{selectedReq.payload.toAccountId as string}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-zinc-400 block font-semibold">Transfer Volume</span>
                            <span className="font-semibold text-sm ledger-number">
                              {selectedReq.payload.currency === "USD" ? "$" : selectedReq.payload.currency === "EUR" ? "€" : "₹"}
                              {(Number(selectedReq.payload.amountPaise) / 100).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </span>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {selectedReq.status === "PENDING" ? (
                  isChecker ? (
                    <div className="space-y-4">
                      <Input
                        label="Justification Reason"
                        placeholder="e.g. Identity verified via government database checks."
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        disabled={loading}
                        required
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          variant="primary"
                          disabled={loading}
                          onClick={() => handleReview("APPROVE")}
                          className="w-full"
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          disabled={loading}
                          onClick={() => handleReview("REJECT")}
                          className="w-full"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 text-[10px] border border-amber-200 bg-amber-50 text-amber-800 leading-normal">
                      🛡️ DUAL-CONTROL AUTHENTICATION: Your active role `{user?.role}` is not authorized to verify compliance reviews. Log out and sign in as `CHECKER` to approve.
                    </div>
                  )
                ) : (
                  <div className="p-3 text-center text-xs border border-zinc-200 bg-zinc-50 text-zinc-500">
                    Ticket resolved as {selectedReq.status}.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="h-full border border-dashed border-zinc-200 p-8 text-center flex flex-col justify-center items-center">
              <span className="text-zinc-400 text-xs uppercase tracking-wider">Select a control ticket to inspect details</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
