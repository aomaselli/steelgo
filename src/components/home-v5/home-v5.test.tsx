import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LanguageProvider, useLanguage } from "@/lib/i18n";
import { SiteHeader } from "./SiteHeader";
import { Co2Calculator } from "./Co2Calculator";
import { destination } from "./routes";
import { parseAmount } from "./parseAmount";

vi.mock("./HomeLink", () => ({HomeLink: ({to, children, ...props}: any) => <a href={destination(to).href} {...props}>{children}</a>}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {observe() {} disconnect() {}});
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("steelgo.language", "pt");
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); localStorage.clear();});
const button = (text: string) => [...host.querySelectorAll("button")].find(el => el.textContent?.trim() === text)!;
const click = async (el: Element) => act(async () => el.dispatchEvent(new MouseEvent("click", {bubbles:true})));

describe("Home v5 integration", () => {
  it("opens one category, dismisses outside and restores focus with Escape", async () => {
    await act(async () => root.render(<LanguageProvider><SiteHeader width={1440}/></LanguageProvider>));
    await click(button("Soluções"));
    expect(host.querySelector('[data-panel="solucoes"]')).not.toBeNull();
    await click(button("Tecnologia"));
    expect(host.querySelectorAll('[data-panel]').length).toBe(1);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true})));
    expect(host.querySelector('[data-panel]')).toBeNull();
    expect(document.activeElement).toBe(button("Tecnologia"));
    await click(button("Soluções"));
    await act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", {bubbles:true})));
    expect(host.querySelector('[data-panel]')).toBeNull();
  });
  it("preserves calculator input and fuel through a language change", async () => {
    function Switch() {const {setLanguage} = useLanguage(); return <button onClick={() => setLanguage("es")}>Change language</button>;}
    await act(async () => root.render(<LanguageProvider><Switch/><Co2Calculator/></LanguageProvider>));
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "1000");
      input.dispatchEvent(new Event("input", {bubbles:true}));
    });
    const selectedFuel = host.querySelector('[role="radio"][aria-checked="true"]')!.textContent;
    expect(selectedFuel).toContain("B100");
    await click(button("Change language"));
    expect(host.querySelector("input")!.value).toBe("1000");
    expect(host.querySelector('[role="radio"][aria-checked="true"]')!.textContent).toContain("B100");
    expect(host.textContent).toContain("Distancia");
    expect(localStorage.getItem("steelgo.language")).toBe("es");
  });
  it("uses existing auth and legal routes without preselecting registration", () => {
    for (const [key, url] of [["login","/login"],["register","/register"],["termos","/terms"],["privacidade","/privacy"],["cookies","/cookies"]]) {
      expect(destination(key)).toEqual({href:url,pending:false});
    }
    expect(destination("solucoes/steelgo-pay").pending).toBe(false);
  });
  it("rejects malformed numbers and understands grouping in either notation", () => {
    const msgs = {empty:"empty",negative:"negative",invalid:"invalid",range:"range"};
    for (const value of ["1,2,3", "1.2.3", "12.34,5", "42kg"]) expect(parseAmount(value,1,5000,msgs)).toEqual({ok:false,err:"invalid"});
    for (const value of ["1.200,5", "1,200.5"]) expect(parseAmount(value,1,5000,msgs)).toEqual({ok:true,val:1200.5});
  });
});
