"use client";

import Link from "next/link";
import Image from "next/image";

import { AuthWallpaper } from "@/components/layout/auth-wallpaper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function AxionMascot() {
  return (
    <div className="axion-float axion-glow relative mx-auto h-[112px] w-[112px]">
      <Image
        src="/axiora/mascot/axiora-mascot-icon.png"
        alt="Mascote Axiora"
        fill
        sizes="112px"
        className="object-contain"
        priority
      />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="axiora-brand-page relative isolate">
      <AuthWallpaper />
      <main className="axiora-brand-content safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md overflow-x-clip p-4 md:p-6">
        <div className="relative min-h-[calc(100vh-2rem)] w-full md:min-h-[calc(100vh-3rem)]">
          <div className="pointer-events-none absolute left-0 right-0 top-12 md:top-16">
            <AxionMascot />
          </div>
          <Card className="axiora-auth-panel absolute left-1/2 top-[58%] w-full -translate-x-1/2 -translate-y-1/2">
            <CardHeader>
              <CardTitle className="text-[#22352f]">Redefinir senha</CardTitle>
              <CardDescription className="axiora-auth-muted">A recuperação automática ainda não está disponível neste MVP.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="axiora-auth-muted text-sm leading-6">
                Se você já tem uma conta, peça a redefinição ao administrador responsável pelo seu acesso. Se ainda não começou, você pode criar uma nova conta de família agora.
              </p>
              <div className="grid gap-3">
                <Button asChild className="w-full bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] shadow-[inset_0_1px_0_rgba(255,219,190,0.46),0_6px_0_rgba(158,74,30,0.42),0_16px_24px_rgba(93,48,22,0.18)]" type="button">
                  <Link href="/signup">Criar conta</Link>
                </Button>
                <Button asChild className="w-full border-[#ddc6ab] bg-[rgba(255,250,244,0.88)] text-[#29403a] shadow-[0_8px_18px_rgba(194,170,144,0.1)]" type="button" variant="outline">
                  <Link href="/login">Voltar para login</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <style jsx global>{`
        @keyframes axion-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-7px);
          }
        }

        @keyframes axion-glow {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes axion-crown-bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        @keyframes axion-blink {
          0%,
          90%,
          100% {
            transform: scaleY(1);
          }
          95% {
            transform: scaleY(0.06);
          }
        }

        .axion-float {
          animation: axion-float 3s ease-in-out infinite;
          transform-origin: center;
        }

        .axion-glow {
          animation: axion-glow 3s ease-in-out infinite;
        }

        .axion-crown {
          animation: axion-crown-bob 2.5s ease-in-out infinite;
          transform-origin: 48px 14px;
        }

        .axion-blink {
          animation: axion-blink 4s ease-in-out infinite;
          transform-origin: center;
        }

        @media (prefers-reduced-motion: reduce) {
          .axion-float,
          .axion-glow,
          .axion-crown,
          .axion-blink {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
