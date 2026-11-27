import {
  BarChart3,
  Blocks,
  Boxes,
  Cable,
  Play,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/server-api";

// Public home. `/` used to bounce straight to /login, so a first-time
// visitor met a login form before learning what the product was. Signed-in
// users still go straight to their projects.
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (user) redirect({ href: "/projects", locale });

  const t = await getTranslations("home");

  const steps = [
    { icon: Blocks, key: "drag" },
    { icon: Cable, key: "connect" },
    { icon: Play, key: "run" },
  ] as const;
  const features = [
    { icon: ShieldCheck, key: "sandbox" },
    { icon: SquareTerminal, key: "terminal" },
    { icon: BarChart3, key: "results" },
    { icon: Boxes, key: "vault" },
  ] as const;
  const circuit = ["H", "CNOT", "Measure", "Measure", "Run", "Histogram"];

  return (
    <div className="bg-background">
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="font-heading text-4xl font-bold leading-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="px-5">
              <Link href="/register">{t("ctaRegister")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-5">
              <Link href="/login">{t("ctaLogin")}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="px-5">
              <Link href="/vault">{t("ctaVault")}</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("audience")}</p>
        </div>

        {/* Static sketch of the Bell-state example users get in the editor. */}
        <div
          aria-hidden
          className="rounded-2xl bg-muted/50 p-6 ring-1 ring-foreground/10"
        >
          <div className="flex flex-wrap items-center gap-2">
            {circuit.map((label, i) => (
              <div key={`${label}-${i}`} className="flex items-center gap-2">
                <span className="rounded-lg bg-background px-3 py-2 font-mono text-sm shadow-sm ring-1 ring-foreground/10">
                  {label}
                </span>
                {i < circuit.length - 1 && (
                  <span className="text-muted-foreground">→</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex h-32 items-end gap-6 border-b border-foreground/20 px-6">
            <Bar label="00" height="h-[92%]" />
            <Bar label="01" height="h-0" />
            <Bar label="10" height="h-0" />
            <Bar label="11" height="h-[88%]" />
          </div>
          <p className="mt-8 text-sm text-muted-foreground">{t("sketchCaption")}</p>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-heading text-2xl font-bold">{t("howTitle")}</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map(({ icon: Icon, key }, i) => (
              <li key={key} className="space-y-2 rounded-xl bg-background p-5 ring-1 ring-foreground/10">
                <div className="flex items-center gap-2 text-primary">
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-semibold">
                    {i + 1}. {t(`steps.${key}.title`)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{t(`steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-heading text-2xl font-bold">{t("featuresTitle")}</h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, key }) => (
            <li key={key} className="space-y-2">
              <Icon className="h-6 w-6 text-primary" />
              <p className="font-semibold">{t(`features.${key}.title`)}</p>
              <p className="text-sm text-muted-foreground">{t(`features.${key}.body`)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-wrap items-center gap-4 rounded-2xl bg-nav p-6 text-nav-foreground">
          <p className="flex-1 text-lg font-semibold">{t("finalCta")}</p>
          <Button asChild size="lg" className="px-5">
            <Link href="/register">{t("ctaRegister")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Bar({ label, height }: { label: string; height: string }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
      <div className={`w-full rounded-t bg-primary ${height}`} />
      <span className="translate-y-6 font-mono text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
