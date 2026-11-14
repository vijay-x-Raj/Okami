"use client";

import React from "react";

export interface ToastData {
  id: number;
  text: string;
  type?: "info" | "success" | "warning";
}

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;

  return (
    <div className="okami-toast" role="status" aria-live="polite">
      <span className="okami-toast-icon">
        {toast.type === "warning" ? "!" : "✓"}
      </span>
      <span className="okami-toast-text">{toast.text}</span>
    </div>
  );
}
