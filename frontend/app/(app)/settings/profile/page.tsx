"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { API_BASE } from "@/lib/api/base";

/* Password field with eye toggle + optional match indicator */
function PasswordField({
  label,
  value,
  onChange,
  match,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  match?: boolean | null;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-fg-muted">
          {label}
        </label>
        {match === true && (
          <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
            Correct
          </span>
        )}
        {match === false && (
          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
            Incorrect
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          required
          minLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-bg px-3 py-1.5 pr-9 text-sm text-fg"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
        >
          {show ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const toast = useToast();
  const [me, setMe] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarOk, setAvatarOk] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await apiFetch<any>("/users/me");
      setMe(m);
      setFullName(m?.full_name ?? m?.fullName ?? "");
    } catch (err: any) {
      toast.error("Load failed", err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const match = pw.confirm.length > 0 ? pw.next === pw.confirm : null;
  const canSubmitPw =
    !changingPw &&
    pw.current.length >= 1 &&
    pw.next.length >= 8 &&
    match === true;

  const initials = useMemo(() => {
    const src = (me?.full_name ?? me?.fullName ?? me?.email ?? "?") as string;
    return src
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }, [me]);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSavingName(true);
    try {
      await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      toast.success("Profile saved", "Full name updated.");
      load();
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSavingName(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const csrf =
        document.cookie
          .split("; ")
          .find((c) => c.startsWith("csrf="))
          ?.split("=")[1] ?? "";
      const res = await fetch(`${API_BASE}/users/me/avatar`, {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      setAvatarVersion((v) => v + 1);
      setAvatarOk(true);
      toast.success("Avatar updated", "Photo profile diperbarui.");
    } catch (err: any) {
      toast.error("Upload failed", err.message);
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitPw) return;
    setChangingPw(true);
    try {
      await apiFetch("/users/me/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: pw.current,
          new_password: pw.next,
        }),
      });
      setPw({ current: "", next: "", confirm: "" });
      toast.success(
        "Password changed",
        "Perangkat lain telah logout. Perangkat ini tetap login.",
      );
    } catch (err: any) {
      toast.error("Change failed", err.message);
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          ← Settings
        </Link>
        <h1 className="text-2xl font-semibold text-fg">My Profile</h1>
        <p className="text-sm text-fg-muted">
          Kelola nama, foto profil, dan password akun Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---------- Identity ---------- */}
        <div className="space-y-6 rounded-xl border border-border bg-bg-surface p-6">
          <h2 className="text-sm font-semibold text-fg">Identitas</h2>

          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-bg-subtle">
              {avatarOk || me?.has_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${API_BASE}/users/me/avatar?v=${avatarVersion}`}
                  alt="avatar"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarOk(false)}
                  onLoad={() => setAvatarOk(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-fg-muted">
                  {initials || "?"}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-fg-muted">
                  Foto profil
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                    e.target.value = "";
                  }}
                  className="block w-full text-xs text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-bg-subtle file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-fg hover:file:bg-bg"
                />
              </label>
              <p className="text-[11px] text-fg-subtle">
                PNG/JPEG/WEBP. Tanpa avatar, inisial nama ditampilkan.
              </p>
            </div>
          </div>

          <form onSubmit={saveName} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Full name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Email (tidak dapat diubah)
              </label>
              <input
                value={me?.email ?? ""}
                disabled
                className="w-full rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-sm text-fg-muted"
              />
            </div>
            <Button type="submit" disabled={savingName || !fullName.trim()}>
              {savingName ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </div>

        {/* ---------- Password ---------- */}
        <div className="rounded-xl border border-border bg-bg-surface p-6">
          <h2 className="text-sm font-semibold text-fg">Ganti password</h2>
          <p className="mt-1 text-xs text-fg-muted">
            Password baru minimal 8 karakter dan harus berbeda dari password
            saat ini. Perangkat lain akan logout otomatis.
          </p>
          <form onSubmit={changePassword} className="mt-4 space-y-4">
            <PasswordField
              label="Current password"
              value={pw.current}
              onChange={(v) => setPw({ ...pw, current: v })}
              placeholder="Password saat ini"
            />
            <PasswordField
              label="New password"
              value={pw.next}
              onChange={(v) => setPw({ ...pw, next: v })}
              placeholder="Min 8 karakter"
            />
            <PasswordField
              label="Confirm new password"
              value={pw.confirm}
              onChange={(v) => setPw({ ...pw, confirm: v })}
              match={match}
              placeholder="Ulangi password baru"
            />
            <Button type="submit" disabled={!canSubmitPw}>
              {changingPw ? "Changing..." : "Change password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
