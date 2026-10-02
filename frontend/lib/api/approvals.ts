import { apiFetch } from "./client";

export type ApprovalStep = {
  id: string;
  level: number;
  approver_role: string;
  status: string;
  decider_name?: string | null;
  decided_at?: string | null;
  reason?: string | null;
};

export type ApprovalInstance = {
  id: string;
  document_type: string;
  document_id: string;
  document_label?: string | null;
  amount_minor?: number | null;
  status: string;
  requester_name?: string | null;
  created_at: string;
  steps: ApprovalStep[];
};

export async function listApprovals(): Promise<ApprovalInstance[]> {
  const body = await apiFetch<{ data: ApprovalInstance[] }>("/approvals/inbox");
  return body.data;
}

export async function getApproval(id: string): Promise<ApprovalInstance> {
  const body = await apiFetch<{ data: ApprovalInstance }>(`/approvals/${id}`);
  return body.data;
}

export async function getApprovalByDocument(
  docType: string,
  docId: string,
): Promise<ApprovalInstance | null> {
  try {
    const body = await apiFetch<{ data: ApprovalInstance | null }>(
      `/approvals/by-document/${docType}/${docId}`,
    );
    return body.data;
  } catch {
    return null;
  }
}

export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  reason: string,
) {
  const body = await apiFetch<{ data: ApprovalInstance }>(
    `/approvals/${id}/decide`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    },
  );
  return body.data;
}
