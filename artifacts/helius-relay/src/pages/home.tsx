import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Webhook,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  getGetRelayEventsQueryKey,
  getGetRelayStatusQueryKey,
  getHealthCheckQueryKey,
  useGetRelayEvents,
  useGetRelayStatus,
  useHealthCheck,
  type RelayEvent,
} from '@workspace/api-client-react';

function formatTime(value: string | null | undefined) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatRelative(value: string | null | undefined) {
  if (!value) return 'No delivery recorded';
  const difference = Date.now() - new Date(value).getTime();
  if (difference < 60_000) return 'Just now';
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  return formatTime(value);
}

function StatusDot({ tone = 'good', pulse = false }: { tone?: 'good' | 'warn' | 'bad' | 'muted'; pulse?: boolean }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center ${pulse ? 'relay-pulse' : ''}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${
        tone === 'good' ? 'bg-[#bce84d]' : tone === 'warn' ? 'bg-[#e6ae52]' : tone === 'bad' ? 'bg-[#e46b5d]' : 'bg-[#8292a0]'
      }`} />
      {pulse && <span className={`absolute h-4 w-4 rounded-full border ${
        tone === 'good' ? 'border-[#bce84d]/40' : tone === 'bad' ? 'border-[#e46b5d]/40' : 'border-[#e6ae52]/40'
      }`} />}
    </span>
  );
}

function SectionLabel({ eyebrow, title, detail, action }: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="relay-mono mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#188b90]">{eyebrow}</p>
        <h2 className="font-semibold tracking-[-0.03em] text-[#172638] text-xl">{title}</h2>
        {detail && <p className="mt-1 text-sm text-[#687986]">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-[#d2e0e1] bg-[#f2f8f7] p-4">
      <div className="h-3 w-20 rounded bg-[#dbe8e7]" />
      <div className="mt-4 h-7 w-28 rounded bg-[#dbe8e7]" />
      <div className="mt-3 h-2 w-24 rounded bg-[#dbe8e7]" />
    </div>
  );
}

function ErrorNotice({ title, message, onRetry, testId }: {
  title: string;
  message: string;
  onRetry: () => void;
  testId: string;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-[#edc6bf] bg-[#fff8f5] p-5 sm:flex-row sm:items-center sm:justify-between" data-testid={testId}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-[#f8dfd8] p-2 text-[#b84e43]"><TriangleAlert size={17} /></span>
        <div>
          <p className="font-semibold text-[#713d39]">{title}</p>
          <p className="mt-1 text-sm text-[#95635d]">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg border border-[#dca9a0] bg-[#fffdfa] px-3 py-2 text-xs font-semibold text-[#87453e] transition hover:bg-[#fbedeb] focus:outline-none focus:ring-2 focus:ring-[#e46b5d]/30"
        data-testid={`button-retry-${testId}`}
      >
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  );
}

function ConfigRow({ label, configured, hint }: { label: string; configured: boolean; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#dce7e5] py-3.5 last:border-0">
      <div>
        <p className="text-sm font-medium text-[#203344]">{label}</p>
        <p className="mt-0.5 text-xs text-[#778991]">{hint}</p>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        configured ? 'bg-[#e2f2b8] text-[#476521]' : 'bg-[#f8e5df] text-[#a15147]'
      }`} data-testid={`status-config-${label.toLowerCase().replaceAll(' ', '-')}`}>
        {configured ? <Check size={12} strokeWidth={3} /> : <XCircle size={12} />}
        {configured ? 'Ready' : 'Missing'}
      </span>
    </div>
  );
}

function EventRow({ event }: { event: RelayEvent }) {
  const isDelivered = event.status === 'delivered';
  return (
    <div className="group grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-[#e1e9e8] px-1 py-4 transition last:border-0 hover:bg-[#f4f9f8] sm:grid-cols-[auto_minmax(0,1fr)_minmax(118px,auto)_auto] sm:items-center sm:gap-4" data-testid={`row-relay-event-${event.id}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isDelivered ? 'bg-[#e5f2bd] text-[#567429]' : 'bg-[#f9e3df] text-[#ad5148]'}`}>
        {isDelivered ? <Send size={14} /> : <AlertCircle size={14} />}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[#203344]" title={event.summary}>{event.summary}</p>
          <span className="hidden rounded bg-[#e8f0ef] px-1.5 py-0.5 text-[10px] font-medium text-[#577074] sm:inline">{event.eventType}</span>
        </div>
        <p className="relay-mono mt-1 truncate text-[10px] text-[#8b9b9e]" title={event.signature ?? event.id}>
          {event.signature ? `${event.signature.slice(0, 12)}…${event.signature.slice(-8)}` : `event/${event.id.slice(0, 12)}`}
        </p>
        {!isDelivered && event.error && <p className="mt-1 truncate text-xs text-[#b35349]" title={event.error}>{event.error}</p>}
      </div>
      <p className="col-start-2 text-xs text-[#778991] sm:col-start-auto" data-testid={`text-event-time-${event.id}`}>
        {formatRelative(event.receivedAt)}
      </p>
      <span className={`col-start-3 row-start-1 inline-flex items-center gap-1.5 text-[11px] font-semibold sm:col-start-auto sm:row-start-auto ${isDelivered ? 'text-[#567429]' : 'text-[#b35349]'}`}>
        <StatusDot tone={isDelivered ? 'good' : 'bad'} />
        <span className="hidden sm:inline">{isDelivered ? 'Delivered' : 'Failed'}</span>
      </span>
    </div>
  );
}

function Home() {
  const [copied, setCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const health = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30_000 },
  });
  const relay = useGetRelayStatus({
    query: { queryKey: getGetRelayStatusQueryKey(), refetchInterval: 15_000 },
  });
  const events = useGetRelayEvents({
    query: { queryKey: getGetRelayEventsQueryKey(), refetchInterval: 15_000 },
  });

  const hasServiceIssue = health.isError || relay.isError;
  const webhookUrl = useMemo(() => {
    if (!relay.data) return '';
    return `${window.location.origin}${relay.data.endpointPath}`;
  }, [relay.data]);

  const refreshAll = useCallback(() => {
    void health.refetch();
    void relay.refetch();
    void events.refetch();
  }, [events.refetch, health.refetch, relay.refetch]);

  const copyEndpoint = useCallback(async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [webhookUrl]);

  const eventList = events.data ?? [];
  const deliveredCount = eventList.filter((event) => event.status === 'delivered').length;
  const failedCount = eventList.filter((event) => event.status === 'failed').length;
  const deliveryRate = eventList.length ? Math.round((deliveredCount / eventList.length) * 100) : 0;

  return (
    <div className="relay-noise min-h-[100dvh] bg-[#eaf3f2] text-[#172638]">
      <div className="flex min-h-[100dvh]">
        <aside className="hidden w-[238px] shrink-0 flex-col bg-[#142536] px-4 py-5 text-[#cfdddb] md:flex">
          <Link href="/" className="mb-10 flex items-center gap-3 px-2" data-testid="link-brand">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c8ed52] text-[#142536] shadow-[0_0_0_5px_rgba(200,237,82,0.10)]">
              <Radio size={19} strokeWidth={2.5} />
            </span>
            <span>
              <span className="block text-[15px] font-bold tracking-[-0.04em] text-[#f0f7ee]">helius relay</span>
              <span className="relay-mono block text-[9px] uppercase tracking-[0.16em] text-[#86a09e]">ops console</span>
            </span>
          </Link>

          <div className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6e8989]">Workspace</div>
          <nav className="space-y-1" aria-label="Primary navigation">
            <a href="#overview" className="flex items-center gap-3 rounded-xl bg-[#21394a] px-3 py-2.5 text-sm font-medium text-[#c8ed52] transition hover:bg-[#294559]" data-testid="link-overview">
              <LayoutDashboard size={16} /> Overview <ChevronRight className="ml-auto opacity-60" size={14} />
            </a>
            <a href="#endpoint" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#9eb3b1] transition hover:bg-[#21394a] hover:text-[#dce9e5]" data-testid="link-endpoint">
              <Webhook size={16} /> Webhook endpoint
            </a>
            <a href="#activity" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#9eb3b1] transition hover:bg-[#21394a] hover:text-[#dce9e5]" data-testid="link-activity">
              <Inbox size={16} /> Delivery activity
            </a>
          </nav>

          <div className="mt-auto">
            <div className="mb-5 rounded-2xl border border-[#2c4a59] bg-[#1b3142] p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <span className="relay-mono text-[9px] uppercase tracking-[0.16em] text-[#85a19f]">Signal path</span>
                <StatusDot tone={hasServiceIssue ? 'bad' : 'good'} pulse={!hasServiceIssue} />
              </div>
              <p className="text-sm font-semibold text-[#e9f3ec]">{hasServiceIssue ? 'Needs attention' : 'Operational'}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#91aaa8]">Polling health and delivery state every 15 seconds.</p>
            </div>
            <div className="flex items-center gap-2 border-t border-[#294050] px-2 pt-4 text-xs text-[#819a98]">
              <Settings2 size={14} /> Environment <span className="ml-auto rounded bg-[#274555] px-1.5 py-0.5 font-mono text-[9px] text-[#b9d0cb]">LIVE</span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="relative flex min-h-[72px] items-center justify-between border-b border-[#d5e3e1] bg-[#edf6f4]/90 px-5 backdrop-blur md:px-10">
            <div className="flex items-center gap-3 md:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#142536] text-[#c8ed52]"><Radio size={16} /></span>
              <span className="text-sm font-bold tracking-[-0.04em] text-[#172638]">helius relay</span>
            </div>
            <div className="hidden items-center gap-2 text-xs text-[#708286] md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#188b90]" /> Solana mainnet
              <span className="mx-1 text-[#b6c8c6]">/</span>
              <span className="relay-mono text-[10px]">RELAY-01</span>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-4">
              <span className="hidden items-center gap-2 text-xs text-[#708286] sm:flex">
                <Clock3 size={14} /> Auto-refresh 15s
              </span>
              <button
                type="button"
                onClick={refreshAll}
                className="inline-flex items-center gap-2 rounded-lg border border-[#c8dad8] bg-[#f5faf8] px-3 py-2 text-xs font-semibold text-[#34666a] transition hover:border-[#8bb7b3] hover:bg-[#e8f4f1] focus:outline-none focus:ring-2 focus:ring-[#188b90]/25"
                data-testid="button-refresh-all"
              >
                <RefreshCw size={14} className={health.isFetching || relay.isFetching || events.isFetching ? 'animate-spin' : ''} /> Refresh
              </button>
              <button type="button" onClick={() => setHelpOpen((open) => !open)} className="rounded-lg p-2 text-[#71888b] transition hover:bg-[#dcebe8] hover:text-[#244d50] focus:outline-none focus:ring-2 focus:ring-[#188b90]/25" aria-label="Help" data-testid="button-help">
                <CircleHelp size={18} />
              </button>
            </div>
            {helpOpen && (
              <div className="absolute right-5 top-[62px] z-20 w-[min(300px,calc(100vw-2.5rem))] rounded-xl border border-[#c7dcd8] bg-[#f8fcfa] p-4 text-xs leading-relaxed text-[#587074] shadow-[0_14px_30px_rgba(20,55,62,0.14)] md:right-10" data-testid="popover-help">
                <p className="font-semibold text-[#203344]">How to read this console</p>
                <p className="mt-1.5">Helius posts to the public endpoint. The relay records the event, then attempts Telegram delivery. Status and activity refresh automatically.</p>
              </div>
            )}
          </header>

          <div className="relay-grid relative overflow-hidden px-5 pb-12 pt-8 md:px-10 md:pt-10">
            <div className="relative mx-auto max-w-[1400px]">
              <section id="overview" className="relay-rise mb-9">
                <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                  <div>
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#c7dad4] bg-[#f1f8f4] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#4b7072]">
                      <StatusDot tone={hasServiceIssue ? 'bad' : 'good'} pulse={!hasServiceIssue} /> Live signal path
                    </div>
                    <h1 className="max-w-[680px] text-4xl font-semibold leading-[0.98] tracking-[-0.065em] text-[#172638] sm:text-5xl lg:text-[62px]">
                      Blockchain activity,<br /><span className="text-[#188b90]">delivered with proof.</span>
                    </h1>
                    <p className="mt-5 max-w-[580px] text-[15px] leading-relaxed text-[#667b80]">
                      Your Helius webhook is the source. This console watches every handoff to Telegram so you know the signal made it through.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 border-l-2 border-[#c8ed52] pl-4 lg:mb-1">
                    <HeartPulse size={18} className={hasServiceIssue ? 'text-[#c05b4f]' : 'text-[#188b90]'} />
                    <div>
                      <p className="relay-mono text-[10px] uppercase tracking-[0.15em] text-[#668083]">System status</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#203344]" data-testid="status-system">
                        {health.isLoading || relay.isLoading ? 'Checking signal…' : hasServiceIssue ? 'Connection interrupted' : 'All systems nominal'}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="relay-rise relay-rise-1 mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Relay metrics">
                {health.isLoading || relay.isLoading ? (
                  <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></>
                ) : (
                  <>
                    <div className="rounded-2xl border border-[#c9dcda] bg-[#f4faf7] p-4 shadow-[0_2px_0_rgba(20,37,54,0.02)] transition hover:-translate-y-0.5 hover:border-[#9fc6bf]">
                      <div className="flex items-center justify-between text-[#637d7e]"><span className="relay-mono text-[10px] uppercase tracking-[0.12em]">Service health</span><Server size={16} /></div>
                      <p className={`mt-4 text-2xl font-semibold tracking-[-0.05em] ${health.isError ? 'text-[#b35349]' : 'text-[#315e5f]'}`} data-testid="metric-health">{health.isError ? 'Unavailable' : (health.data?.status ?? 'Unknown')}</p>
                      <p className="mt-1 text-xs text-[#78908e]">{health.isError ? 'Retry to reconnect' : 'API heartbeat responding'}</p>
                    </div>
                    <div className="rounded-2xl border border-[#c9dcda] bg-[#f4faf7] p-4 shadow-[0_2px_0_rgba(20,37,54,0.02)] transition hover:-translate-y-0.5 hover:border-[#9fc6bf]">
                      <div className="flex items-center justify-between text-[#637d7e]"><span className="relay-mono text-[10px] uppercase tracking-[0.12em]">Configuration</span><ShieldCheck size={16} /></div>
                      <p className={`mt-4 text-2xl font-semibold tracking-[-0.05em] ${relay.data?.configured ? 'text-[#315e5f]' : 'text-[#a15a45]'}`} data-testid="metric-configuration">{relay.data?.configured ? 'Ready' : 'Incomplete'}</p>
                      <p className="mt-1 text-xs text-[#78908e]">{relay.data?.configured ? 'Telegram handoff armed' : 'Credentials need attention'}</p>
                    </div>
                    <div className="rounded-2xl border border-[#c9dcda] bg-[#f4faf7] p-4 shadow-[0_2px_0_rgba(20,37,54,0.02)] transition hover:-translate-y-0.5 hover:border-[#9fc6bf]">
                      <div className="flex items-center justify-between text-[#637d7e]"><span className="relay-mono text-[10px] uppercase tracking-[0.12em]">Recent events</span><Activity size={16} /></div>
                      <p className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-[#315e5f]" data-testid="metric-recent-events">{relay.data?.recentEventCount ?? eventList.length}</p>
                      <p className="mt-1 text-xs text-[#78908e]">Held in relay memory</p>
                    </div>
                    <div className="rounded-2xl border border-[#c9dcda] bg-[#f4faf7] p-4 shadow-[0_2px_0_rgba(20,37,54,0.02)] transition hover:-translate-y-0.5 hover:border-[#9fc6bf]">
                      <div className="flex items-center justify-between text-[#637d7e]"><span className="relay-mono text-[10px] uppercase tracking-[0.12em]">Last delivery</span><Send size={16} /></div>
                      <p className={`mt-4 text-2xl font-semibold tracking-[-0.05em] ${relay.data?.lastDeliveryStatus === 'failed' ? 'text-[#b35349]' : 'text-[#315e5f]'}`} data-testid="metric-last-delivery">
                        {formatRelative(relay.data?.lastDeliveryAt)}
                      </p>
                      <p className="mt-1 text-xs text-[#78908e]">{relay.data?.lastDeliveryStatus === 'failed' ? 'Delivery failed' : 'Telegram destination'}</p>
                    </div>
                  </>
                )}
              </section>

              {health.isError && (
                <div className="relay-rise-2 mb-6">
                  <ErrorNotice title="Health check is not responding" message="The relay API did not answer. Delivery state may be stale." onRetry={() => void health.refetch()} testId="notice-health-error" />
                </div>
              )}
              {relay.isError && (
                <div className="relay-rise-2 mb-6">
                  <ErrorNotice title="Relay status unavailable" message="We could not read Telegram configuration or the latest delivery." onRetry={() => void relay.refetch()} testId="notice-relay-error" />
                </div>
              )}

              <section className="relay-rise relay-rise-2 mb-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <div id="endpoint" className="relay-scanline relative overflow-hidden rounded-2xl border border-[#b8d3ce] bg-[#172e3e] p-5 text-[#e1f1e9] shadow-[0_14px_35px_rgba(25,58,67,0.12)] sm:p-6">
                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="relay-mono text-[10px] uppercase tracking-[0.18em] text-[#95b6ae]">Ingress / Helius</p>
                        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#f0f7ee]">Public webhook endpoint</h2>
                      </div>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#294858] text-[#c8ed52]"><Webhook size={18} /></span>
                    </div>
                    <div className="mt-7 rounded-xl border border-[#426271] bg-[#112534] p-3">
                      <p className="relay-mono break-all text-[12px] leading-relaxed text-[#d5ebe3]" data-testid="text-webhook-endpoint">
                        {relay.isLoading ? 'Loading endpoint…' : webhookUrl || 'Endpoint unavailable'}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-xs text-[#9ab5b0]"><ExternalLink size={13} /> Accepts Helius webhook POSTs</p>
                      <button type="button" onClick={copyEndpoint} disabled={!webhookUrl} className="inline-flex items-center gap-2 rounded-lg bg-[#c8ed52] px-3 py-2 text-xs font-bold text-[#172638] transition hover:bg-[#d7f57c] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#c8ed52]/40" data-testid="button-copy-endpoint">
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy endpoint'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#c9dcda] bg-[#f7fbf9] p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="relay-mono text-[10px] uppercase tracking-[0.18em] text-[#188b90]">Egress / Telegram</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#172638]">Destination readiness</h2>
                    </div>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${relay.data?.configured ? 'bg-[#e5f2bd] text-[#567429]' : 'bg-[#f8e5df] text-[#a15147]'}`}>
                      <Send size={17} />
                    </span>
                  </div>
                  {relay.isLoading ? (
                    <div className="mt-5 space-y-2 animate-pulse"><div className="h-10 rounded-lg bg-[#e2efec]" /><div className="h-10 rounded-lg bg-[#e2efec]" /><div className="h-10 rounded-lg bg-[#e2efec]" /></div>
                  ) : relay.data ? (
                    <div className="mt-4">
                      <ConfigRow label="Bot token" configured={relay.data.tokenConfigured} hint="TELEGRAM_BOT_TOKEN" />
                      <ConfigRow label="Chat ID" configured={relay.data.chatIdConfigured} hint="TELEGRAM_CHAT_ID" />
                      <ConfigRow label="Relay armed" configured={relay.data.configured} hint="Both credentials present" />
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl bg-[#f8e5df] p-3 text-sm text-[#9b5148]">Configuration details could not be loaded.</div>
                  )}
                </div>
              </section>

              <section id="activity" className="relay-rise relay-rise-3 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
                <div className="rounded-2xl border border-[#c9dcda] bg-[#f7fbf9] p-5 sm:p-6">
                  <SectionLabel
                    eyebrow="Relay stream"
                    title="Recent delivery activity"
                    detail="The latest webhook events received by this relay."
                    action={<span className="relay-mono rounded-full bg-[#e2efec] px-2.5 py-1 text-[10px] text-[#547375]" data-testid="text-event-count">{eventList.length} observed</span>}
                  />
                  {events.isLoading ? (
                    <div className="space-y-1">{[1, 2, 3].map((item) => <div key={item} className="flex animate-pulse items-center gap-3 border-b border-[#e1e9e8] py-4"><div className="h-8 w-8 rounded-lg bg-[#e2efec]" /><div className="flex-1"><div className="h-3 w-2/3 rounded bg-[#e2efec]" /><div className="mt-2 h-2 w-1/3 rounded bg-[#e2efec]" /></div><div className="h-3 w-16 rounded bg-[#e2efec]" /></div>)}</div>
                  ) : events.isError ? (
                    <ErrorNotice title="Activity stream unavailable" message="Recent events could not be retrieved." onRetry={() => void events.refetch()} testId="notice-events-error" />
                  ) : eventList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#c6dad7] bg-[#f1f8f5] px-5 py-12 text-center" data-testid="empty-relay-events">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dcefeb] text-[#438489]"><Inbox size={20} /></span>
                      <h3 className="mt-4 text-sm font-semibold text-[#2d4e54]">Listening for the first signal</h3>
                      <p className="mt-1 max-w-[290px] text-xs leading-relaxed text-[#78908e]">Once Helius posts an event, its handoff to Telegram will appear here.</p>
                    </div>
                  ) : (
                    <div>{eventList.map((event) => <EventRow key={event.id} event={event} />)}</div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#c9dcda] bg-[#f7fbf9] p-5 sm:p-6">
                  <SectionLabel eyebrow="At a glance" title="Delivery signal" detail="Based on observed relay events." />
                  <div className="relative mx-auto mt-5 flex h-40 w-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(#188b90 ${deliveryRate}%, #dce9e6 ${deliveryRate}% 100%)` }} data-testid="chart-delivery-signal">
                    <div className="flex h-[126px] w-[126px] flex-col items-center justify-center rounded-full bg-[#f7fbf9]">
                      <span className="text-3xl font-semibold tracking-[-0.07em] text-[#203344]">{eventList.length ? `${deliveryRate}%` : '—'}</span>
                      <span className="relay-mono mt-1 text-[9px] uppercase tracking-[0.13em] text-[#78908e]">delivered</span>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-[#6f8385]"><StatusDot tone="good" /> Delivered</span><strong className="relay-mono text-xs text-[#315e5f]" data-testid="text-delivered-count">{deliveredCount}</strong></div>
                    <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-[#6f8385]"><StatusDot tone="bad" /> Failed</span><strong className="relay-mono text-xs text-[#b35349]" data-testid="text-failed-count">{failedCount}</strong></div>
                  </div>
                  {relay.data?.lastDeliveryStatus === 'failed' && relay.data.lastDeliveryError && (
                    <div className="mt-5 rounded-xl border border-[#edc6bf] bg-[#fff5f2] p-3" data-testid="notice-last-delivery-error">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#a54f47]"><AlertCircle size={12} /> Last failure</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#9d6962]">{relay.data.lastDeliveryError}</p>
                    </div>
                  )}
                </div>
              </section>

              <footer className="relay-rise relay-rise-4 mt-10 flex flex-col gap-2 border-t border-[#d4e2e0] pt-5 text-[11px] text-[#829394] sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2"><Code2 size={13} /> Helius webhook relay / operational view</p>
                <p className="relay-mono" data-testid="text-last-synced">Last checked {formatTime(new Date().toISOString())}</p>
              </footer>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Home;