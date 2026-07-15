import { usePluginData, type PluginPageProps } from "@paperclipai/plugin-sdk/ui";

type ControlRoomStatus = {
  status: "ready";
  startedAt: string;
  checkedAt: string;
};

/**
 * This is deliberately limited to worker-backed information. Founder business
 * cards are added only alongside their real, tenant-scoped data contracts.
 */
export function ControlRoomPage(_props: PluginPageProps) {
  const { data, loading, error } = usePluginData<ControlRoomStatus>("control-room-status");

  if (loading) return <main aria-busy="true" />;
  if (error) return <main role="alert">Unable to verify Foundry worker health: {error.message}</main>;
  if (!data) return <main role="status">Foundry worker has not supplied company data.</main>;

  return (
    <main>
      <h1>Foundry</h1>
      <p>Plugin worker verified at {new Date(data.checkedAt).toLocaleString()}.</p>
    </main>
  );
}
