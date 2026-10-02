"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getMe, updateMe, uploadAvatar, type Me } from "@/lib/api/users";

export default function ProfilePage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then((m) => {
        setMe(m);
        setFullName(m.full_name);
      })
      .catch(() =>
        toast.error("Unable to load profile", "Session may have expired."),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      await updateMe(fullName.trim());
      toast.success("Profile updated", "Your full name has been saved.");
      setMe((prev) => (prev ? { ...prev, full_name: fullName.trim() } : prev));
    } catch (err: any) {
      toast.error("Update failed", err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Unsupported image type", "Use PNG, JPEG, or WebP.");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("Image too large", "Maximum size is 1 MB.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });
      const [meta, b64] = dataUrl.split(",");
      const mime = meta.slice(5, meta.indexOf(";"));
      await uploadAvatar(mime, b64);
      setPreview(dataUrl);
      setMe((prev) => (prev ? { ...prev, has_avatar: true } : prev));
      toast.success(
        "Avatar uploaded",
        "Your photo is now visible across the workspace.",
      );
    } catch (err: any) {
      toast.error("Upload failed", err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!me) {
    return (
      <div className="h-40 animate-pulse rounded-md border border-border bg-bg" />
    );
  }

  const initials = me.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Profile</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Your identity across this workspace.
        </p>
      </header>

      <section className="rounded-md border border-border bg-bg p-6">
        <div className="flex items-center gap-5">
          {preview || me.has_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview ?? "/api/v1/users/me/avatar"}
              alt={me.full_name}
              className="h-20 w-20 rounded-full border border-border object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-subtle text-xl font-semibold text-accent">
              {initials}
            </span>
          )}
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-accent-hover"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <p className="text-xs text-fg-subtle">
              PNG, JPEG, or WebP. Maximum 1 MB.
            </p>
            {uploading && <p className="text-xs text-fg-muted">Uploading...</p>}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-bg p-6">
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-muted">
              Full name
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted">
              Email
            </label>
            <input
              value={me.email}
              disabled
              className="mt-1 block w-full rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted"
            />
            <p className="mt-1 text-xs text-fg-subtle">
              Email is managed by your workspace administrator.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={savingName || fullName.trim() === ""}
            >
              {savingName ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
