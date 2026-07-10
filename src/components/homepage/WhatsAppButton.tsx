import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/5511984339109"
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-6 right-6 z-50 group"
    >
      <div className="relative">
        <div className="w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:bg-[#2FA98A] transition-all cursor-pointer">
          <MessageCircle size={28} className="text-white" />
        </div>
        <div className="absolute bottom-full right-0 mb-2 bg-[#1C2128] text-[#E6EDF3] text-xs px-3 py-1.5 rounded-[8px] whitespace-nowrap border border-[#30363D] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Fale conosco
        </div>
      </div>
    </a>
  );
}
