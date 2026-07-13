"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-zinc-50">
      <Card className="w-full max-auto max-w-md border border-zinc-200 bg-white p-8 shadow-sm">
        <CardHeader className="space-y-2 text-center mb-6">
          <CardTitle className="text-2xl font-semibold tracking-tight text-zinc-900">
            Platform Gateway
          </CardTitle>
          <CardDescription>
            Access the transaction ledger & approval network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs border border-red-200 bg-red-50 text-red-700">
                {error}
              </div>
            )}
            
            <Input
              label="Email Address"
              type="email"
              placeholder="e.g. name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            <Button
              type="submit"
              className="w-full mt-6"
              variant="primary"
              disabled={loading}
            >
              {loading ? "Authenticating..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-zinc-500">
            Need credentials?{" "}
            <Link href="/register" className="font-semibold underline hover:text-foreground">
              Scaffold profile
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
