"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

/** Promote (move into the doc body) or dismiss a staged "Pending changes" delta. */
export function GraduationActions({ planId }: { planId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"promote" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "promote" | "dismiss") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/patches/${planId}/${kind}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        This is staged under “Pending changes.” Promote it into the doc body once
        the work has shipped, or dismiss it.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => act("promote")}
          disabled={busy !== null}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "promote" ? "Promoting…" : "Promote to body"}
        </button>
        <button
          onClick={() => act("dismiss")}
          disabled={busy !== null}
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
