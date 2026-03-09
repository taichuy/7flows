type ServiceCheck = {
  name: string;
  status: string;
  detail?: string | null;
};

type StatusCardProps = {
  service: ServiceCheck;
};

export function StatusCard({ service }: StatusCardProps) {
  const healthy = service.status === "up";

  return (
    <article className="status-card">
      <div className="status-header">
        <span className="status-meta">Service</span>
        <span className={`status-dot ${healthy ? "up" : "down"}`} />
      </div>
      <h3 className="status-name">{service.name}</h3>
      <p className="status-description">
        {healthy ? "连接正常，当前可以参与本地开发链路。" : service.detail ?? "服务未就绪。"}
      </p>
    </article>
  );
}
