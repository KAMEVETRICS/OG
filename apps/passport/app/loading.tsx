import { Fingerprint } from 'lucide-react';

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="text-center">
        <span className="mx-auto grid size-12 animate-pulse place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
          <Fingerprint className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Reading 0G proofs</p>
      </div>
    </main>
  );
}
