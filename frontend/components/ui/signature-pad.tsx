"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalIcon } from "@/components/ui/modal";

type Props = {
  open: boolean;
  onClose: () => void;
  initialName: string;
  initialSignature: string | null;
  onConfirm: (name: string, signatureDataUrl: string) => void;
};

export function SignaturePad({
  open,
  onClose,
  initialName,
  initialSignature,
  onConfirm,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const [name, setName] = useState(initialName);
  const [empty, setEmpty] = useState(!initialSignature);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#12151A";
    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        setEmpty(false);
      };
      img.src = initialSignature;
    } else {
      setEmpty(true);
    }
  }, [open, initialName, initialSignature]);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setEmpty(false);
  };

  const up = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || empty) return;
    const flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;
    const fctx = flat.getContext("2d");
    if (!fctx) return;
    fctx.fillStyle = "#FFFFFF";
    fctx.fillRect(0, 0, flat.width, flat.height);
    fctx.drawImage(canvas, 0, 0);
    onConfirm(name.trim() || initialName, flat.toDataURL("image/png"));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sign the report"
      description="Your signature is embedded in the PDF and reused for future exports on this device."
      icon={<ModalIcon path="M3 17l6-6 4 4 8-8M17 7h4v4" />}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-fg-muted">
            Signer name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div ref={wrapRef} className="rounded-lg border border-border bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            className="block w-full touch-none rounded-lg"
            aria-label="Signature canvas"
          />
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            Clear signature
          </Button>
          <p className="text-xs text-fg-subtle">
            Draw with mouse, pen, or finger.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={empty}>
            Sign & export PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
