import { MetricCard } from "../components/MetricCard.tsx";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";
import { formatGigabytes, formatPercent, formatUptime } from "../lib/format.ts";

export function SystemPage() {
  const { stats, health } = useAstra();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="CPU"
          value={formatPercent(stats?.cpu_percent ?? null)}
          hint={stats ? `${stats.cpu_count} logical processors` : "Waiting for the local service"}
          percent={stats?.cpu_percent ?? null}
        />
        <MetricCard
          label="RAM"
          value={formatPercent(stats?.ram_percent ?? null)}
          hint={stats ? `${formatGigabytes(stats.ram_used_gb)} of ${formatGigabytes(stats.ram_total_gb)}` : "Waiting for the local service"}
          percent={stats?.ram_percent ?? null}
        />
        <MetricCard
          label="BATTERY"
          value={formatPercent(stats?.battery_percent ?? null)}
          hint={
            stats?.battery_percent == null
              ? "No battery sensor on this computer"
              : stats.battery_plugged
                ? "Plugged in"
                : "On battery"
          }
          percent={stats?.battery_percent ?? null}
        />
        <MetricCard
          label="DISK"
          value={formatPercent(stats?.disk_percent ?? null)}
          hint={
            stats
              ? `${formatGigabytes(stats.disk_free_gb)} free of ${formatGigabytes(stats.disk_total_gb)} on ${stats.disk_path}`
              : "Waiting for the local service"
          }
          percent={stats?.disk_percent ?? null}
        />
      </div>
      <Panel title={health?.cloud_deployment ? "THIS DEVICE" : "HOST"}>
        {health?.cloud_deployment ? (
          <p className="mb-3 text-sm text-astra-muted">
            {stats
              ? "Live readings come from the computer running the paired ASTRA companion."
              : "Pair the local ASTRA companion to show this device's live CPU, RAM, disk, and host details. No sensor permissions are required; the companion can read standard system metrics."}
          </p>
        ) : null}
        {stats ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-astra-muted">Hostname</dt>
              <dd>{stats.hostname}</dd>
            </div>
            <div>
              <dt className="text-astra-muted">Platform</dt>
              <dd>{stats.platform}</dd>
            </div>
            <div>
              <dt className="text-astra-muted">Python</dt>
              <dd>{stats.python}</dd>
            </div>
            <div>
              <dt className="text-astra-muted">System uptime</dt>
              <dd>{formatUptime(stats.system_uptime_seconds)}</dd>
            </div>
            <div>
              <dt className="text-astra-muted">Backend uptime</dt>
              <dd>{formatUptime(stats.app_uptime_seconds)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-astra-muted">System readings appear after the local backend answers.</p>
        )}
      </Panel>
    </div>
  );
}
