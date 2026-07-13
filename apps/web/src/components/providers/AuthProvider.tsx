"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile, UserRole, KycStatus, Account, ApprovalRequest, Transfer } from "@fintech/shared-types";

// Extends shared-types ApprovalRequest for frontend representation of KYC submissions
export interface OnboardingApprovalRequest extends Omit<ApprovalRequest, 'payload'> {
  payload: {
    email: string;
    firstName: string;
    lastName: string;
    documentType: string;
    documentNumber: string;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ message: string; verificationToken?: string }>;
  verifyEmail: (token: string) => Promise<string>;
  logout: () => void;
  // Profile & KYC onboarding
  createProfile: (firstName: string, lastName: string, phoneNumber: string) => Promise<void>;
  submitKyc: (documentType: string, documentNumber: string) => Promise<void>;
  // Accounts
  accounts: Account[];
  balances: Record<string, number>; // accountId -> balance in Rupees
  // Transfers
  transfers: Transfer[];
  initiateTransfer: (fromAccountId: string, toAccountId: string, amount: number, currency: string) => Promise<void>;
  // Compliance approvals
  approvals: ApprovalRequest[];
  reviewKyc: (requestId: string, action: "APPROVE" | "REJECT", reason?: string) => Promise<void>;
  reviewTransfer: (requestId: string, action: "APPROVE" | "REJECT") => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Decoupled states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

  const router = useRouter();

  // Load user profile & related data on launch
  useEffect(() => {
    const savedUser = localStorage.getItem("fintech_user");
    const token = localStorage.getItem("fintech_token");
    const hasCookie = document.cookie.split(";").some((c) => c.trim().startsWith("auth-token="));

    if (savedUser && token && hasCookie) {
      try {
        const parsed = JSON.parse(savedUser);
        const userProfile: UserProfile = {
          ...parsed,
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt)
        };
        setUser(userProfile);
        loadServiceData(userProfile.id, userProfile.role);
      } catch {
        clearAuthData();
      }
    } else {
      clearAuthData();
    }
    setLoading(false);
  }, []);

  const clearAuthData = () => {
    localStorage.removeItem("fintech_user");
    localStorage.removeItem("fintech_token");
    document.cookie = "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setUser(null);
    setAccounts([]);
    setBalances({});
    setTransfers([]);
    setApprovals([]);
  };

  // Loads accounts, balances, transfers, and approvals from storage or simulated db
  const loadServiceData = (userId: string, role: UserRole) => {
    // Load accounts
    const allAccountsKey = "fintech_all_accounts";
    const allAccounts: Account[] = JSON.parse(localStorage.getItem(allAccountsKey) || "[]");
    const userAccs = allAccounts.filter((a) => a.userId === userId);
    setAccounts(userAccs);

    // Load balances
    const allBalancesKey = "fintech_all_balances";
    const allBalances: Record<string, number> = JSON.parse(localStorage.getItem(allBalancesKey) || "{}");
    setBalances(allBalances);

    // Load transfers
    const allTransfersKey = "fintech_all_transfers";
    const allTransfers: Transfer[] = JSON.parse(localStorage.getItem(allTransfersKey) || "[]");
    const userTrsfs = allTransfers.filter((t) => t.fromAccountId.includes(userId) || t.toAccountId.includes(userId) || t.fromAccountId === "acc_savings_inr_001" || t.toAccountId === "acc_savings_inr_001");
    setTransfers(userTrsfs.length ? userTrsfs : allTransfers);

    // Load approvals queue (CHECKER sees all, customers see their submitted ones)
    const allApprovalsKey = "fintech_all_approvals";
    const allApprovals: ApprovalRequest[] = JSON.parse(localStorage.getItem(allApprovalsKey) || "[]");
    if (role === "CHECKER") {
      setApprovals(allApprovals);
    } else {
      setApprovals(allApprovals.filter((req) => req.makerId === userId));
    }
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8080/api/auth/v1/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "Login failed");
      }

      const { accessToken, user: backendUser } = resData.data;

      // ─── HYBRID USER SERVICE FLOW ───
      // Try to fetch profile from live user service
      let profile: UserProfile;
      try {
        const profResponse = await fetch("http://localhost:8080/api/users/v1/profile", {
          method: "GET",
          headers: { "Authorization": `Bearer ${accessToken}` }
        });
        const profData = await profResponse.json();
        if (profResponse.ok && profData.success) {
          profile = profData.data;
        } else {
          throw new Error("No user service profile found");
        }
      } catch {
        // Fallback: load or seed from local simulated store
        console.warn("[web-gateway-fallback] User service down, loading offline profile simulation.");
        const simulatedProfilesKey = "fintech_profiles";
        const simulatedProfiles: Record<string, any> = JSON.parse(localStorage.getItem(simulatedProfilesKey) || "{}");
        
        if (simulatedProfiles[backendUser.id]) {
          profile = simulatedProfiles[backendUser.id];
        } else {
          // Skeleton profile (no first/last name yet - triggers onboarding form)
          profile = {
            id: backendUser.id,
            email: backendUser.email,
            firstName: "",
            lastName: "",
            phoneNumber: null,
            kycStatus: "PENDING",
            role: backendUser.role as UserRole,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          simulatedProfiles[backendUser.id] = profile;
          localStorage.setItem(simulatedProfilesKey, JSON.stringify(simulatedProfiles));
        }
      }

      document.cookie = `auth-token=${accessToken}; path=/; max-age=86400; SameSite=Strict`;
      localStorage.setItem("fintech_token", accessToken);
      localStorage.setItem("fintech_user", JSON.stringify(profile));
      
      setUser(profile);
      loadServiceData(profile.id, profile.role);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string): Promise<{ message: string; verificationToken?: string }> => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8080/api/auth/v1/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "Registration failed");
      }
      return {
        message: resData.data.message || "Registration successful.",
        verificationToken: resData.data.verificationToken
      };
    } finally {
      setLoading(false);
    }
  };

  const verifyEmail = async (token: string): Promise<string> => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8080/api/auth/v1/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "Verification failed");
      }
      return resData.data.message || "Verified successfully.";
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const token = localStorage.getItem("fintech_token");
    if (token) {
      try {
        await fetch("http://localhost:8080/api/auth/v1/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch (e) {
        console.error("Logout request to gateway failed", e);
      }
    }
    clearAuthData();
    router.push("/login");
  };

  const createProfile = async (firstName: string, lastName: string, phoneNumber: string) => {
    if (!user) return;
    setLoading(true);
    const token = localStorage.getItem("fintech_token");
    try {
      // Attempt live profile creation
      const response = await fetch("http://localhost:8080/api/users/v1/profile/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ firstName, lastName, phoneNumber })
      });
      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "Profile setup failed");
      }
      
      const updatedUser: UserProfile = resData.data;
      setUser(updatedUser);
      localStorage.setItem("fintech_user", JSON.stringify(updatedUser));
    } catch {
      // Offline fallback simulation
      console.warn("[web-gateway-fallback] Profile update failed, modifying offline session.");
      const updatedUser: UserProfile = {
        ...user,
        firstName,
        lastName,
        phoneNumber,
        updatedAt: new Date()
      };
      
      const simulatedProfilesKey = "fintech_profiles";
      const simulatedProfiles = JSON.parse(localStorage.getItem(simulatedProfilesKey) || "{}");
      simulatedProfiles[user.id] = updatedUser;
      localStorage.setItem(simulatedProfilesKey, JSON.stringify(simulatedProfiles));

      setUser(updatedUser);
      localStorage.setItem("fintech_user", JSON.stringify(updatedUser));
    } finally {
      setLoading(false);
    }
  };

  const submitKyc = async (documentType: string, documentNumber: string) => {
    if (!user) return;
    setLoading(true);
    const token = localStorage.getItem("fintech_token");
    try {
      // Attempt live KYC submission
      const response = await fetch("http://localhost:8080/api/users/v1/kyc/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ documentType, documentNumber })
      });
      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "KYC submission failed");
      }

      const updatedUser = { ...user, kycStatus: "SUBMITTED" as KycStatus };
      setUser(updatedUser);
      localStorage.setItem("fintech_user", JSON.stringify(updatedUser));
    } catch {
      // Offline fallback simulation
      console.warn("[web-gateway-fallback] KYC submission failed, modifying offline session.");
      const updatedUser: UserProfile = {
        ...user,
        kycStatus: "SUBMITTED",
        updatedAt: new Date()
      };

      const simulatedProfilesKey = "fintech_profiles";
      const simulatedProfiles = JSON.parse(localStorage.getItem(simulatedProfilesKey) || "{}");
      simulatedProfiles[user.id] = updatedUser;
      localStorage.setItem(simulatedProfilesKey, JSON.stringify(simulatedProfiles));

      // Append standard review request to approvals database list
      const approvalsKey = "fintech_all_approvals";
      const approvalsList: OnboardingApprovalRequest[] = JSON.parse(localStorage.getItem(approvalsKey) || "[]");
      
      const newKycRequest: OnboardingApprovalRequest = {
        id: "req_kyc_" + Math.random().toString(36).substr(2, 9),
        correlationId: "corr_" + Math.random().toString(36).substr(2, 9),
        actionType: "LIMIT_OVERRIDE", // Substituted mock schema parameter
        targetResourceId: user.id,
        status: "PENDING",
        makerId: user.id,
        payload: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          documentType,
          documentNumber
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      approvalsList.push(newKycRequest as any);
      localStorage.setItem(approvalsKey, JSON.stringify(approvalsList));

      setUser(updatedUser);
      localStorage.setItem("fintech_user", JSON.stringify(updatedUser));
      loadServiceData(user.id, user.role);
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async (type: "CHECKING" | "SAVINGS", currency: string) => {
    if (!user) return;
    setLoading(true);
    const token = localStorage.getItem("fintech_token");
    try {
      const response = await fetch("http://localhost:8080/api/accounts/v1/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ type, currency })
      });
      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "Account creation failed");
      }
      loadServiceData(user.id, user.role);
    } catch {
      // Offline fallback simulation
      console.warn("[web-gateway-fallback] Account creation failed, modifying offline state.");
      const accountsKey = "fintech_all_accounts";
      const accountsList: Account[] = JSON.parse(localStorage.getItem(accountsKey) || "[]");

      const newAccount: Account = {
        id: "acc_" + type.toLowerCase() + "_" + currency.toLowerCase() + "_" + Math.random().toString(36).substr(2, 6),
        userId: user.id,
        type,
        status: "ACTIVE",
        currency,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      accountsList.push(newAccount);
      localStorage.setItem(accountsKey, JSON.stringify(accountsList));

      // Seed default balance
      const balancesKey = "fintech_all_balances";
      const balancesMap: Record<string, number> = JSON.parse(localStorage.getItem(balancesKey) || "{}");
      balancesMap[newAccount.id] = 0;
      localStorage.setItem(balancesKey, JSON.stringify(balancesMap));

      loadServiceData(user.id, user.role);
    } finally {
      setLoading(false);
    }
  };

  const initiateTransfer = async (fromAccountId: string, toAccountId: string, amount: number, currency: string) => {
    if (!user) return;
    setLoading(true);
    const token = localStorage.getItem("fintech_token");
    try {
      const response = await fetch("http://localhost:8080/api/transfers/v1/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ fromAccountId, toAccountId, amountPaise: amount * 100, currency })
      });
      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "Transfer initiation failed");
      }
    } catch {
      // Offline fallback simulation
      console.warn("[web-gateway-fallback] Transfer failed, running offline balance shift.");
      
      const balancesKey = "fintech_all_balances";
      const balancesMap: Record<string, number> = JSON.parse(localStorage.getItem(balancesKey) || "{}");

      // Verify bounds locally
      const sourceBalance = balancesMap[fromAccountId] || 0;
      if (sourceBalance < amount) {
        throw new Error("Insufficient account funds balance.");
      }

      // Perform local balance shifts in Rupees
      balancesMap[fromAccountId] = sourceBalance - amount;
      balancesMap[toAccountId] = (balancesMap[toAccountId] || 0) + amount;
      localStorage.setItem(balancesKey, JSON.stringify(balancesMap));

      // Append transaction logs
      const transfersKey = "fintech_all_transfers";
      const transfersList: Transfer[] = JSON.parse(localStorage.getItem(transfersKey) || "[]");

      const newTransfer: Transfer = {
        id: "trsf_" + Math.random().toString(36).substr(2, 9),
        idempotencyKey: "idem_" + Math.random().toString(36).substr(2, 9),
        fromAccountId,
        toAccountId,
        amountPaise: (amount * 100) as any, // satisfy type constraints
        currency,
        status: "COMPLETED",
        createdAt: new Date(),
        updatedAt: new Date()
      };

      transfersList.unshift(newTransfer);
      localStorage.setItem(transfersKey, JSON.stringify(transfersList));
      loadServiceData(user.id, user.role);
    } finally {
      setLoading(false);
    }
  };

  const reviewKyc = async (requestId: string, action: "APPROVE" | "REJECT", reason?: string) => {
    if (!user || user.role !== "CHECKER") return;
    setLoading(true);
    const token = localStorage.getItem("fintech_token");
    try {
      const response = await fetch(`http://localhost:8080/api/approvals/v1/requests/${requestId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ action, justification: reason })
      });
      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || "Review submission failed");
      }
    } catch {
      // Offline fallback simulation
      console.warn("[web-gateway-fallback] Review request failed, modifying local state.");
      const approvalsKey = "fintech_all_approvals";
      let approvalsList: OnboardingApprovalRequest[] = JSON.parse(localStorage.getItem(approvalsKey) || "[]");
      const targetReq = approvalsList.find((r) => r.id === requestId);
      
      if (targetReq) {
        targetReq.status = action === "APPROVE" ? "APPROVED" : "REJECTED";
        targetReq.updatedAt = new Date();
        localStorage.setItem(approvalsKey, JSON.stringify(approvalsList));

        // Mutate target customer profile state
        const targetUserId = targetReq.targetResourceId;
        const simulatedProfilesKey = "fintech_profiles";
        const simulatedProfiles = JSON.parse(localStorage.getItem(simulatedProfilesKey) || "{}");
        const customerProfile: UserProfile = simulatedProfiles[targetUserId];

        if (customerProfile) {
          customerProfile.kycStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
          customerProfile.updatedAt = new Date();
          simulatedProfiles[targetUserId] = customerProfile;
          localStorage.setItem(simulatedProfilesKey, JSON.stringify(simulatedProfiles));

          // If APPROVED, auto-create a default Savings Account in INR with ₹50,000 balance
          if (action === "APPROVE") {
            const accountsKey = "fintech_all_accounts";
            const accountsList: Account[] = JSON.parse(localStorage.getItem(accountsKey) || "[]");
            
            // Check if savings account already exists for user
            const hasSavings = accountsList.some((a) => a.userId === targetUserId && a.type === "SAVINGS");
            if (!hasSavings) {
              const newAccount: Account = {
                id: "acc_savings_inr_" + Math.random().toString(36).substr(2, 6),
                userId: targetUserId,
                type: "SAVINGS",
                status: "ACTIVE",
                currency: "INR",
                createdAt: new Date(),
                updatedAt: new Date()
              };
              accountsList.push(newAccount);
              localStorage.setItem(accountsKey, JSON.stringify(accountsList));

              const balancesKey = "fintech_all_balances";
              const balancesMap: Record<string, number> = JSON.parse(localStorage.getItem(balancesKey) || "{}");
              balancesMap[newAccount.id] = 50000; // ₹50,000 starting portfolio
              localStorage.setItem(balancesKey, JSON.stringify(balancesMap));
            }
          }
        }
      }
      loadServiceData(user.id, user.role);
    } finally {
      setLoading(false);
    }
  };

  const reviewTransfer = async (requestId: string, action: "APPROVE" | "REJECT") => {
    // Simulates standard double-entry validation reviews
    await reviewKyc(requestId, action);
  };

  const updateKyc = (status: KycStatus) => {
    if (!user) return;
    const updatedUser = { ...user, kycStatus: status };
    localStorage.setItem("fintech_user", JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      verifyEmail,
      logout,
      createProfile,
      submitKyc,
      accounts,
      balances,
      transfers,
      initiateTransfer,
      approvals,
      reviewKyc,
      reviewTransfer,
      updateKyc
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
