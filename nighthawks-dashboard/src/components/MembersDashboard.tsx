import { useState } from "react";
import Card, { CardContent } from "./ui/Card";
import Button from "./ui/Button";
import Modal from "./ui/Modal";

import {
  Calendar,
  ConciergeBell,
  User,
  Home,
  ArrowRight,
  Crown,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

type Tab = "Home" | "Concierge" | "Events" | "Account";

export default function MembersDashboard() {
  const prefersReduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<Tab>("Home");

  // Modal state for seat requests
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    meta?: string;
  }>({
    id: "inner-circle-oct17-tribeca",
    title: "Inner Circle · Private Dinner",
    meta: "Thu, Oct 17 · Tribeca · 8 PM",
  });

  const quick = [
    { label: "Make a request" },
    { label: "View reservations" },
    { label: "Contact concierge" },
  ];

  const upcoming = [
    { title: "4-top · L’Atelier", meta: "Fri, 8:30 PM", status: "Confirmed" },
    { title: "Rooftop · The Nines", meta: "Sat, 10:45 PM", status: "On hold" },
  ];

  const openReq = [
    { title: "Private room · Downtown", meta: "Anniversary dinner", status: "Working" },
    { title: "Bar seats · West Village", meta: "Tonight", status: "Secured" },
  ];

  const invites = [
    { title: "Chef’s Counter · LES", meta: "10 seats · Fri 9 PM", cta: "Request" },
    { title: "Paris Weekend Preview", meta: "Members only · RSVP by Thu", cta: "RSVP" },
  ];

  const statusClass = (s: string) => {
    const val = s.toLowerCase();
    if (val.includes("confirm") || val.includes("secure"))
      return "text-xs rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-300";
    if (val.includes("hold"))
      return "text-xs rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-yellow-200";
    return "text-xs rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/70";
  };

  function openRequest(ev?: { title: string; meta?: string; id?: string }) {
    setResult(null);
    setSelectedEvent({
      id: ev?.id ?? "inner-circle-oct17-tribeca",
      title: ev?.title ?? "Inner Circle · Private Dinner",
      meta: ev?.meta ?? "Thu, Oct 17 · Tribeca · 8 PM",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      fullName: fd.get("fullName")?.toString().trim(),
      email: fd.get("email")?.toString().trim(),
      phone: fd.get("phone")?.toString().trim() || undefined,
      partySize: Number(fd.get("partySize") || 1),
      dietary: fd.get("dietary")?.toString().trim() || undefined,
      notes: fd.get("notes")?.toString().trim() || undefined,
      marketingConsent: fd.get("consent") === "on",
      honeypot: fd.get("website")?.toString() || "", // bot trap
      memberId: "NHX-7234-A",
      eventId: selectedEvent.id,
      eventTitle: selectedEvent.title,
      eventMeta: selectedEvent.meta,
      timestamp: new Date().toISOString(),
    };

    // Basic validation + honeypot
    if (payload.honeypot) {
      setSubmitting(false);
      return; // silently drop bots
    }
    if (!payload.fullName || !payload.email) {
      setSubmitting(false);
      setResult("error");
      return;
    }

    try {
      const res = await fetch("/api/inner-circle-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Bad status");

      setResult("ok");
      (e.currentTarget as HTMLFormElement).reset();
      setTimeout(() => setModalOpen(false), 900);
    } catch {
      // Local fallback so you don't lose requests during dev
      try {
        const key = "nhx_ic_requests";
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.push(payload);
        localStorage.setItem(key, JSON.stringify(arr));
        setResult("ok");
        (e.currentTarget as HTMLFormElement).reset();
        setTimeout(() => setModalOpen(false), 900);
      } catch {
        setResult("error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      {/* Ambient gradients for depth */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-70
        [background:radial-gradient(60%_40%_at_70%_10%,rgba(255,255,255,.08),transparent_60%),radial-gradient(40%_30%_at_10%_20%,rgba(255,255,255,.06),transparent_60%)]"
      />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-black/40 bg-black/20 border-b border-white/10 rounded-b-2xl shadow-[inset_0_-1px_0_0_rgba(255,255,255,.06)]">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            {/* Brand + greeting */}
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-full bg-white/80" aria-hidden />
              <div>
                <p className="text-[10px] tracking-[0.24em] uppercase text-white/50">Nighthawks</p>
                <h1 className="font-serif text-xl md:text-2xl font-semibold tracking-tight">
                  Welcome back, <span className="text-white/80">JD</span>
                </h1>
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-6 text-sm text-white/70" aria-label="Primary">
              {["Home", "Concierge", "Events", "Account"].map((item) => (
                <a key={item} className="hover:text-white" href="#">{item}</a>
              ))}
              <span className="ml-3 text-xs px-3 py-1 rounded-full border border-white/15 text-white/60">
                Founder · NYC
              </span>
              <Button variant="ghost" className="px-5">Log out</Button>
            </nav>

            {/* Mobile logout */}
            <div className="md:hidden">
              <Button variant="ghost" className="px-4">Log out</Button>
            </div>
          </div>
        </header>

        {/* Inner Circle CTA */}
        <motion.div
          className="mt-6"
          initial={prefersReduced ? false : { opacity: 0, y: 8 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="rounded-3xl overflow-hidden border-white/10 bg-gradient-to-r from-white/[0.08] to-white/[0.02]">
            <CardContent className="p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 border border-white/20">
                  <Crown className="h-5 w-5 text-amber-300" aria-hidden />
                </span>
                <div>
                  <p className="text-[10px] tracking-[0.22em] uppercase text-white/60">Inner Circle</p>
                  <p className="font-serif text-lg leading-tight">Inner Circle · Private Dinner</p>
                  <p className="text-sm text-white/70">Thu, Oct 17 · Tribeca · 8 PM</p>
                  <p className="text-sm text-white/60 hidden sm:block mt-1">
                    12 seats only. Curated tasting with winemaker pairing.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                <Button className="px-5" onClick={() => openRequest()}>
                  Request seat
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" className="px-4">Details</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick + Membership */}
        <section className="grid gap-6 md:grid-cols-3 mt-8">
          {/* Quick Actions */}
          <Card className="md:col-span-2 rounded-3xl bg-white/[0.04] backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-base font-medium tracking-wide">Quick Actions</h2>
                <span className="text-xs text-white/50">Founder · NYC</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {quick.map((q) => (
                  <Button key={q.label} variant="ghost" className="px-5 py-2">
                    {q.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Membership Card */}
          <Card className="rounded-3xl border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02]">
            <CardContent className="p-6">
              <p className="text-[11px] tracking-[0.24em] uppercase text-white/50">Membership</p>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-white/50 mb-1">Nighthawks ID</p>
                <p className="text-lg font-medium tracking-widest">NHX-7234-A</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-white/50">Tier</p>
                  <p className="font-medium">Founder</p>
                </div>
                <div>
                  <p className="text-white/50">Renewal</p>
                  <p className="font-medium">Jun 30, 2026</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <p className="text-sm text-white/60">Card • • • • 4421</p>
                <Button variant="ghost" className="px-4 py-1.5 text-sm">Manage</Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Upcoming + Open Requests */}
        <section className="mt-8 grid gap-6 md:grid-cols-3">
          {/* Upcoming */}
          <Card className="md:col-span-2 rounded-3xl bg-white/[0.035]">
            <CardContent className="p-6">
              <h3 className="font-serif text-base font-medium tracking-wide mb-4">Upcoming</h3>
              <ul className="divide-y divide-white/10">
                {upcoming.map((u, i) => (
                  <li key={i} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{u.title}</p>
                      <p className="text-sm text-white/60">{u.meta}</p>
                    </div>
                    <span className={statusClass(u.status)}>{u.status}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Open Requests */}
          <Card className="rounded-3xl bg-white/[0.035]">
            <CardContent className="p-6">
              <h3 className="font-serif text-base font-medium tracking-wide mb-4">Open Requests</h3>
              <ul className="divide-y divide-white/10">
                {openReq.map((r, i) => (
                  <li key={i} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-sm text-white/60">{r.meta}</p>
                    </div>
                    <span className={statusClass(r.status)}>{r.status}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Invitations */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-serif text-base font-medium tracking-wide">Invitations & Moments</h3>
            <a className="text-sm text-white/60 hover:text-white" href="#">View all</a>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {invites.map((it, i) => (
              <motion.div
                key={i}
                whileHover={prefersReduced ? undefined : { y: -2 }}
                transition={{ duration: 0.15 }}
              >
                <Card className="overflow-hidden rounded-3xl bg-white/[0.035]">
                  <div className="h-40 w-full bg-gradient-to-tr from-white/10 to-transparent" />
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-medium">{it.title}</p>
                        <p className="text-sm text-white/60">{it.meta}</p>
                      </div>
                      <Button
                        className="px-5"
                        onClick={() =>
                          openRequest({
                            id: it.title.toLowerCase().replace(/\s+/g, "-"),
                            title: it.title,
                            meta: it.meta,
                          })
                        }
                      >
                        {it.cta}
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      {/* Modal for seat requests */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <h3 className="font-serif text-lg mb-2">Request a seat</h3>
        <p className="text-sm text-white/70 mb-4">
          {selectedEvent.title} — {selectedEvent.meta}
        </p>

        {result === "ok" ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 text-sm p-3">
            Request received — we’ll email you shortly.
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={handleSubmit}>
            {/* Honeypot (bot trap) */}
            <input
              name="website"
              autoComplete="off"
              className="hidden"
              tabIndex={-1}
            />

            <input
              name="fullName"
              placeholder="Full name"
              className="rounded-xl bg-white/5 border border-white/15 px-3 py-2"
              required
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="rounded-xl bg-white/5 border border-white/15 px-3 py-2"
              required
            />
            <input
              name="phone"
              type="tel"
              placeholder="Phone (optional)"
              className="rounded-xl bg-white/5 border border-white/15 px-3 py-2"
            />
            <input
              name="partySize"
              type="number"
              min={1}
              max={12}
              defaultValue={2}
              placeholder="Party size"
              className="rounded-xl bg-white/5 border border-white/15 px-3 py-2"
            />
            <textarea
              name="dietary"
              placeholder="Dietary notes (optional)"
              className="rounded-xl bg-white/5 border border-white/15 px-3 py-2"
            />
            <textarea
              name="notes"
              placeholder="Notes (optional)"
              className="rounded-xl bg-white/5 border border-white/15 px-3 py-2"
            />
            <label className="flex items-start gap-2 text-xs text-white/70">
              <input type="checkbox" name="consent" className="mt-1" />
              I agree to be contacted about this reservation request.
            </label>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="ghost"
                className="px-4"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button className="px-5" type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Request seat"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 mx-auto max-w-3xl mb-5 px-4"
        aria-label="Mobile"
      >
        <div className="grid grid-cols-4 rounded-2xl border border-white/10 bg-black/40 backdrop-blur p-2">
          {[
            { icon: Home, label: "Home" as const },
            { icon: ConciergeBell, label: "Concierge" as const },
            { icon: Calendar, label: "Events" as const },
            { icon: User, label: "Account" as const },
          ].map(({ icon: Icon, label }) => {
            const current = activeTab === label;
            return (
              <button
                key={label}
                aria-current={current ? "page" : undefined}
                onClick={() => setActiveTab(label)}
                className={`flex flex-col items-center gap-1 py-2 text-xs ${
                  current ? "text-white" : "text-white/60 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
