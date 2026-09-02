import { CertificationWorkbench } from '@/components/certification-workbench';
import { ProductHeader } from '@/components/product-header';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CertifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedId = typeof params.request === 'string' && /^[0-9a-f-]{36}$/i.test(params.request)
    ? params.request
    : undefined;

  return (
    <main className="passport-shell certification-shell">
      <div className="ambient-media" aria-hidden="true" />
      <div className="ambient-vignette" aria-hidden="true" />
      <ProductHeader active="certify" />

      <section className="certification-intro" aria-labelledby="certification-title">
        <p className="section-kicker">SELF-SERVICE AGENT CERTIFICATION</p>
        <h1 id="certification-title">Earn the seal. Don&apos;t claim it.</h1>
        <p>
          Prove ownership, lock one implementation package, and run every policy case through TEE-verified 0G Compute. Passing evidence is committed before the issuer can write a seal.
        </p>
        <div className="certification-constraints" aria-label="Certification requirements">
          <span>15 CASES</span><span>45 TEE RUNS</span><span>100% REQUIRED</span><span>7-DAY SEAL</span>
        </div>
      </section>

      <CertificationWorkbench initialRequestId={requestedId} />

      <footer className="certification-footer">
        <span>AGENTSEAL · DEFI-SAFE@1.0.0</span>
        <span>OWNER AUTHORIZED · FAIL CLOSED · VERSION BOUND</span>
      </footer>
    </main>
  );
}
