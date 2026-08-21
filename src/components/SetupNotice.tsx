const PROJECT_REF = (import.meta.env.VITE_SUPABASE_URL ?? "")
  .replace("https://", "")
  .replace(".supabase.co", "");

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Copy the anon key",
    body: (
      <>
        Supabase Dashboard{" "}
        {PROJECT_REF ? (
          <>
            &rarr;{" "}
            <a
              href={`https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api-keys`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-ink underline underline-offset-2"
            >
              Project Settings &rarr; API Keys
            </a>
          </>
        ) : (
          <>&rarr; Project Settings &rarr; API Keys</>
        )}
        . Take the <Code>anon</Code> <Code>public</Code> key (it starts with{" "}
        <Code>eyJ</Code>) or a <Code>sb_publishable_…</Code> key. This one is
        meant to ship in frontend code &mdash; row level security is already on.
      </>
    ),
  },
  {
    title: "Paste it into .env.local",
    body: (
      <>
        The file is already in the project root with the URL filled in. Add the
        key after the <Code>=</Code>:
        <pre className="mt-2 overflow-x-auto rounded-sm border border-line bg-paper px-3 py-2 font-mono text-[11.5px] leading-[1.7] text-ink-2">
          VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs…
        </pre>
      </>
    ),
  },
  {
    title: "Restart the dev server",
    body: (
      <>
        Vite only reads <Code>.env.local</Code> at boot, so stop it and run{" "}
        <Code>npm run dev</Code> again. The board loads straight away.
      </>
    ),
  },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-xs bg-mute-bg px-1 py-0.5 font-mono text-[11.5px] text-ink">
      {children}
    </code>
  );
}

export function SetupNotice() {
  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
          One step left
        </h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          The database is ready. The app just needs a key to talk to it.
        </p>
      </header>
      <ol className="divide-y divide-line">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4 px-5 py-4">
            <span className="tnum mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-xs border border-line-strong text-[11px] font-semibold text-ink-3">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{step.title}</p>
              <div className="mt-1 text-[12.5px] leading-[1.6] text-ink-2">
                {step.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
