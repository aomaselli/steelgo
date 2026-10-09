import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider, useLanguage, type Language } from "@/lib/i18n";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

const {signIn, signUp} = vi.hoisted(() => ({signIn:vi.fn(),signUp:vi.fn()}));
vi.mock("@tanstack/react-router", () => ({Link: ({to,children,...p}:any) => <a href={to} {...p}>{children}</a>, useNavigate: () => vi.fn()}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({signIn,isAuthenticated:false,isLoading:false,profile:null,role:null,authError:null,retryBootstrap:vi.fn()})}));
vi.mock("@/integrations/supabase/client", () => ({supabase:{auth:{signUp,signInWithPassword:vi.fn(),signInWithOAuth:vi.fn()},rpc:vi.fn()}}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true; localStorage.setItem("steelgo.language","pt"); host=document.createElement("div"); document.body.append(host); root=createRoot(host); });
afterEach(async () => {await act(async () => root.unmount());host.remove();localStorage.clear();vi.clearAllMocks();});
function Switcher() {const {setLanguage}=useLanguage();return <>{(["pt","en","es"] as Language[]).map(l => <button key={l} data-language={l} onClick={() => setLanguage(l)}>{l}</button>)}</>;}
const click = async (el: Element) => act(async () => {el.dispatchEvent(new MouseEvent("click",{bubbles:true}));});
const setInput = async (el: HTMLInputElement,value:string) => act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});

it("translates login in all three languages without losing the typed email", async () => {
  await act(async () => root.render(<LanguageProvider><Switcher/><LoginPage/></LanguageProvider>));
  const email=host.querySelector<HTMLInputElement>('input[name="email"]')!;
  await setInput(email,"review@example.com");
  for (const [lang,title,google] of [["en","Welcome back","Continue with Google"],["es","Bienvenido de nuevo","Continuar con Google"],["pt","Bem-vindo de volta","Continuar com Google"]]) {
    await click(host.querySelector(`[data-language="${lang}"]`)!);
    expect(host.textContent).toContain(title);expect(host.textContent).toContain(google);
    expect(email.value).toBe("review@example.com");
  }
  expect(signIn).not.toHaveBeenCalled();
});

it("translates registration roles and steps while preserving role and personal data", async () => {
  await act(async () => root.render(<LanguageProvider><Switcher/><RegisterPage/></LanguageProvider>));
  await click(host.querySelector('[data-language="es"]')!);
  expect(host.textContent).toContain("¿Quién eres?");
  const carrier=[...host.querySelectorAll("button")].find(b => b.textContent?.includes("Transportista"))!;
  await click(carrier);
  await click([...host.querySelectorAll("button")].find(b => b.textContent?.trim()==="Siguiente →")!);
  expect(host.textContent).toContain("Tus datos");
  const name=host.querySelector<HTMLInputElement>('input[name="full_name"]')!;
  await setInput(name,"Test Person");
  await click(host.querySelector('[data-language="en"]')!);
  expect(host.textContent).toContain("Your details");expect(host.textContent).toContain("Full name");expect(name.value).toBe("Test Person");
  await click([...host.querySelectorAll("button")].find(b => b.textContent?.trim()==="← Back")!);
  await click([...host.querySelectorAll("button")].find(b => b.textContent?.trim()==="Next →")!);
  expect(host.textContent).toContain("Your details");
  expect(signUp).not.toHaveBeenCalled();
});

it("shows login validation in the selected language without attempting authentication", async () => {
  await act(async () => root.render(<LanguageProvider><Switcher/><LoginPage/></LanguageProvider>));
  await click(host.querySelector('[data-language="es"]')!);
  await act(async () => {host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
  expect(host.textContent).toContain("Correo electrónico no válido");
  expect(host.textContent).toContain("La contraseña debe tener al menos 6 caracteres");
  expect(signIn).not.toHaveBeenCalled();
});
