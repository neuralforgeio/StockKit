"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { API_BASE } from "@/lib/api/base";
import {
  loadCurrentUser,
  setCurrentUser,
  useCurrentUser,
} from "@/lib/current-user";

/* ------------------------- Password field ------------------------- */

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

/* --------------------------- Crop modal --------------------------- */

const VIEW = 288; // crop viewport (css px)
const OUT = 512; // output size (px)

function CropModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scale0 = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const dw = img ? img.naturalWidth * scale0 * crop.zoom : VIEW;
  const dh = img ? img.naturalHeight * scale0 * crop.zoom : VIEW;

  const clamp = (c: { zoom: number; x: number; y: number }) => ({
    zoom: c.zoom,
    x: Math.min(0, Math.max(VIEW - dw, c.x)),
    y: Math.min(0, Math.max(VIEW - dh, c.y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    const base = drag.current;
    setCrop((c) => clamp({ ...c, x: base.x + dx, y: base.y + dy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const confirm = () => {
    if (!img) return;
    const s = scale0 * crop.zoom;
    const sx = -crop.x / s;
    const sy = -crop.y / s;
    const sw = VIEW / s;
    const sh = VIEW / s;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT, OUT);
    canvas.toBlob(
      (b) => {
        if (b) onConfirm(b);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div
      className="modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="modal-pop w-full max-w-md rounded-xl border border-white/10 bg-[#151a21] p-6 shadow-2xl shadow-black/70 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-fg">Crop foto profil</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Geser untuk memposisikan dan atur zoom. Hasil: kotak {OUT}×{OUT}px.
        </p>

        <div
          className="mx-auto mt-4 cursor-grab touch-none select-none overflow-hidden rounded-lg border border-border bg-bg-subtle active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.src}
              alt="crop preview"
              draggable={false}
              className="block"
              style={{
                width: dw,
                height: dh,
                transform: `translate(${crop.x}px, ${crop.y}px)`,
              }}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-fg-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={crop.zoom}
            onChange={(e) =>
              setCrop((c) =>
                clamp({
                  ...c,
                  zoom: Math.min(4, Math.max(1, parseFloat(e.target.value))),
                }),
              )
            }
            className="flex-1"
          />
          <span className="w-12 text-right font-mono text-xs text-fg-muted">
            {crop.zoom.toFixed(2)}×
          </span>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!img}>
            Crop & Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */

type ProfileData = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  status: string;
  roles: string[];
  created_at: string;
};

export default function ProfilePage() {
  const toast = useToast();
  const live = useCurrentUser();
  const [me, setMe] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);

  const load = useCallback(async () => {
    try {
      const u = (await loadCurrentUser(true)) as ProfileData;
      setMe(u);
    } catch (err: any) {
      toast.error("Load failed", err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: store berubah (WS profile_updated) → halaman ikut update.
  useEffect(() => {
    if (live) setMe(live as ProfileData);
  }, [live]);

  // Input mengikuti data DB selama user belum mengetik.
  useEffect(() => {
    if (me && !dirty) setFullName(me.full_name ?? "");
  }, [me, dirty]);

  const match = pw.confirm.length > 0 ? pw.next === pw.confirm : null;
  const canSubmitPw =
    !changingPw &&
    pw.current.length >= 1 &&
    pw.next.length >= 8 &&
    match === true;

  const initials = useMemo(() => {
    const src = me?.full_name || me?.email || "?";
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
      setDirty(false);
      setCurrentUser({ full_name: fullName.trim() }); // sidebar update instan
      toast.success("Profile saved", "Full name updated.");
      load();
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSavingName(false);
    }
  };

  const uploadBlob = async (blob: Blob) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "avatar.jpg");
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
      setAvatarFailed(false);
      setAvatarVersion((v) => v + 1);
      // Sidebar avatar refresh tanpa reload
      window.dispatchEvent(new CustomEvent("stockkit:avatar-changed"));
      toast.success("Avatar updated", "Foto profil diperbarui.");
    } catch (err: any) {
      toast.error("Upload failed", err.message);
    } finally {
      setUploading(false);
      setCropFile(null);
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
        {/* ---------- Identity (prefilled from DB, live-synced) ---------- */}
        <div className="space-y-6 rounded-xl border border-border bg-bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Identitas</h2>
            {me && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  me.status === "active"
                    ? "bg-success/10 text-success"
                    : "bg-bg-subtle text-fg-muted"
                }`}
              >
                {me.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-bg-subtle">
              {!avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${API_BASE}/users/me/avatar?v=${avatarVersion}`}
                  alt="avatar"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarFailed(true)}
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
                    if (f) setCropFile(f); // buka modal crop, bukan upload langsung
                    e.target.value = "";
                  }}
                  className="block w-full text-xs text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-bg-subtle file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-fg hover:file:bg-bg"
                />
              </label>
              <p className="text-[11px] text-fg-subtle">
                {uploading
                  ? "Mengupload..."
                  : "Pilih file → crop di modal → upload otomatis. Tanpa avatar, inisial nama ditampilkan."}
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
                onChange={(e) => {
                  setFullName(e.target.value);
                  setDirty(true);
                }}
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
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Roles
              </label>
              <div className="flex flex-wrap gap-1">
                {(me?.roles ?? []).map((r) => (
                  <span
                    key={r}
                    className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
                  >
                    {r}
                  </span>
                ))}
                {(me?.roles ?? []).length === 0 && (
                  <span className="text-xs text-fg-subtle">—</span>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Anggota sejak
              </label>
              <div className="text-sm text-fg">
                {me?.created_at
                  ? new Date(me.created_at).toLocaleDateString("id-ID", {
                      dateStyle: "long",
                    })
                  : "—"}
              </div>
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

      {/* Crop modal */}
      {cropFile && (
        <CropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={uploadBlob}
        />
      )}
    </div>
  );
}
