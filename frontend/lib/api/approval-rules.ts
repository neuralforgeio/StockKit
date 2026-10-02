import { apiFetch } from "./client";

export type ApprovalRule = {
  id: string;
  document_type: string;
  name: string;
  threshold_minor: number;
  approver_role: string;
  level: number;
  active: boolean;
};

export type ApprovalRulePayload = {
  document_type: string;
  name: string;
  threshold_minor: number;
  approver_role: string;
  level: number;
  active: boolean;
};

export async function listApprovalRules(): Promise<ApprovalRule[]> {
  const body = await apiFetch<{ data: ApprovalRule[] }>("/approval-rules");
  return body.data;
}

export async function createApprovalRule(payload: ApprovalRulePayload) {
  const body = await apiFetch<{ data: ApprovalRule }>("/approval-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateApprovalRule(
  id: string,
  payload: ApprovalRulePayload,
) {
  const body = await apiFetch<{ data: ApprovalRule }>(`/approval-rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function deleteApprovalRule(id: string) {
  await apiFetch<{ status: string }>(`/approval-rules/${id}`, {
    method: "DELETE",
  });
}
