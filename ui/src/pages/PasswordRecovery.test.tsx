// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordRecovery } from "./PasswordRecovery";

const request = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const reset = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../api/auth", () => ({
  authApi: { requestPasswordReset: request, resetPassword: reset },
  AuthApiError: class extends Error {},
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.clearAllMocks());

describe("PasswordRecovery", () => {
  it("requests a code, validates confirmation, resets and returns to login", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const client = new QueryClient();
    const back = vi.fn();
    const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
    await act(async () => root.render(<QueryClientProvider client={client}><PasswordRecovery initialEmail="fixture@example.test" onBack={back} /></QueryClientProvider>));
    const submit = async () => { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await flush(); };
    const fill = async (id: string, value: string) => { await act(async () => {
      const input = container.querySelector(`#${id}`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }); };
    await submit();
    expect(request).toHaveBeenCalledWith("fixture@example.test");
    expect(container.textContent).toContain("Jika email terdaftar");
    expect(container.querySelector("#recovery-otp")?.getAttribute("autocomplete")).toBe("one-time-code");
    await fill("recovery-otp", "123456");
    await fill("recovery-password", "new-fixture-password");
    await fill("recovery-confirmation", "mismatch");
    await submit();
    expect(reset).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("tidak cocok");
    await fill("recovery-confirmation", "new-fixture-password");
    reset.mockRejectedValueOnce(new Error("invalid OTP"));
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("kedaluwarsa");
    await submit();
    expect(reset).toHaveBeenLastCalledWith({ email: "fixture@example.test", otp: "123456", password: "new-fixture-password" });
    expect(container.textContent).toContain("Kata sandi diperbarui");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    await act(async () => { [...container.querySelectorAll("button")].find(b => b.textContent === "Kembali masuk")!.click(); });
    expect(back).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    client.clear();
  });
});
