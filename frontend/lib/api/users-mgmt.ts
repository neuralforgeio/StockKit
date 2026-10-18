import { apiFetch } from "./client";

export type ManagedUser = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  status: string;
  perm_version: number;
  roles: string[];
  created_at: string;
  updated_at: string;
};

export type Role = {
  id: string;
  name: string;
  description: string;
};

export async function listUsersMgmt(): Promise<ManagedUser[]> {
  const body = await apiFetch<{ data: ManagedUser[] }>("/users-mgmt");
  return body.data;
}

export async function listRolesMgmt(): Promise<Role[]> {
  const body = await apiFetch<{ data: Role[] }>("/users-mgmt/roles");
  return body.data;
}

export async function assignRoleMgmt(
  userId: string,
  roleName: string,
): Promise<ManagedUser> {
  const body = await apiFetch<{ data: ManagedUser }>(
    `/users-mgmt/${userId}/roles`,
    {
      method: "POST",
      body: JSON.stringify({ role_name: roleName }),
    },
  );
  return body.data;
}

export async function revokeRoleMgmt(
  userId: string,
  roleName: string,
): Promise<ManagedUser> {
  const body = await apiFetch<{ data: ManagedUser }>(
    `/users-mgmt/${userId}/roles/${roleName}`,
    {
      method: "DELETE",
    },
  );
  return body.data;
}

export type CreateUserInput = {
  email: string;
  full_name: string;
  password: string;
  roles: string[];
};

export async function createUserMgmt(
  input: CreateUserInput,
): Promise<ManagedUser> {
  const body = await apiFetch<{ data: ManagedUser }>("/users-mgmt", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.data;
}

export async function resetPasswordMgmt(
  userId: string,
  password: string,
): Promise<void> {
  await apiFetch<{ status: string }>(`/users-mgmt/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function setUserStatusMgmt(
  userId: string,
  status: "active" | "inactive",
): Promise<ManagedUser> {
  const body = await apiFetch<{ data: ManagedUser }>(
    `/users-mgmt/${userId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
  return body.data;
}
