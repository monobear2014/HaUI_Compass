"use client";
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

export const AssistantDockContext = createContext<HTMLElement | null>(null);
export function DockedAssistant({ children }: { children: React.ReactNode }) {
  const target = useContext(AssistantDockContext);
  return target ? createPortal(children, target) : null;
}
