import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LanguageProvider, useLanguage } from "@/lib/i18n";
import { HOME_I18N } from "@/lib/i18n.home";
import { InnerPage } from "./InnerPage";
import { MENU, NAV_SLUGS, PILLAR_PATH } from "./data";
import { destination, PUBLIC_PAGE_PATHS } from "./routes";

vi.mock("./HomeLink", () => ({HomeLink: ({to,children,...props}: any) => <a href={destination(to).href} {...props}>{children}</a>}));
let host:HTMLDivElement;
let root:Root;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {observe() {} disconnect() {}});
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("steelgo.language","pt");
  host=document.createElement("div"); document.body.append(host); root=createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); localStorage.clear();});

it("resolves every category, menu option and pillar to an integrated destination", () => {
  for (const path of [...NAV_SLUGS,...Object.values(MENU).flat().map(item=>item.path),...Object.values(PILLAR_PATH)]) {
    expect(destination(path).pending, path).toBe(false);
  }
});

it.each(PUBLIC_PAGE_PATHS)("renders %s in PT, EN and ES with valid related links", async path => {
  for (const lang of ["pt","en","es"] as const) {
    localStorage.setItem("steelgo.language",lang);
    await act(async () => root.render(<LanguageProvider key={lang}><InnerPage path={path}/></LanguageProvider>));
    const category=path.split("/")[0];
    const c=HOME_I18N[lang];
    const expected=path===category ? c.nav[NAV_SLUGS.indexOf(category as any)] : (c.pages.titles as Record<string,string>)[path];
    expect(host.querySelector("h1")?.textContent).toBe(expected);
    for (const link of host.querySelectorAll<HTMLAnchorElement>('main a[href]')) {
      const key=link.getAttribute("href")!.slice(1);
      expect(destination(key).pending,key).toBe(false);
    }
  }
});

it("keeps calculator inputs and the destination when changing language on an inner page", async () => {
  function Switch() {const {setLanguage}=useLanguage();return <button onClick={()=>setLanguage("es")}>Change</button>;}
  await act(async () => root.render(<LanguageProvider><Switch/><InnerPage path="esg/calculadora"/></LanguageProvider>));
  const input=host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"1000");
    input.dispatchEvent(new Event("input",{bubbles:true}));
    host.querySelector("button")!.dispatchEvent(new MouseEvent("click",{bubbles:true}));
  });
  expect(host.querySelector("input")!.value).toBe("1000");
  expect(host.querySelector("h1")!.textContent).toBe(HOME_I18N.es.pages.titles["esg/calculadora"]);
});
