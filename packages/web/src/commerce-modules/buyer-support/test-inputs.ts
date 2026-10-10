/**
 * Controlled-input helpers for W2-012 component tests. React's value tracker
 * swallows naive `input.value = ...` assignments, so tests go through the
 * native prototype setters before dispatching the bubbling events React's
 * onChange listens for.
 */
import { act } from "react";

function nativeSetterOf<T extends HTMLElement>(proto: T, key: "value" | "checked"): (el: T, v: string | boolean) => void {
  const descriptor = Object.getOwnPropertyDescriptor(proto, key);
  if (!descriptor?.set) throw new Error(`native ${key} setter unavailable`);
  return (el, v) => {
    descriptor.set!.call(el, v as never);
  };
}

const setInputValue = nativeSetterOf<HTMLInputElement>(HTMLInputElement.prototype, "value");
const setSelectValue = nativeSetterOf<HTMLSelectElement>(HTMLSelectElement.prototype, "value");

/** Set a text/number/date input and fire React's onChange. */
export function fillInput(container: HTMLElement, ariaLabel: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(ariaLabel)}"]`);
  if (!input) throw new Error(`input not found: ${ariaLabel}`);
  act(() => {
    setInputValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Select an option and fire React's onChange. */
export function pickOption(container: HTMLElement, ariaLabel: string, value: string): void {
  const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${CSS.escape(ariaLabel)}"]`);
  if (!select) throw new Error(`select not found: ${ariaLabel}`);
  act(() => {
    setSelectValue(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
