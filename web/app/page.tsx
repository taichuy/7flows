import { StatusCard } from "@/components/status-card";
import { getSystemOverview } from "@/lib/get-system-overview";

const highlights = [
  "Dify 风格的本地源码开发路径",
  "FastAPI + Celery 运行时骨架",
  "Docker 中间件环境与全容器模式并存"
];

export default async function HomePage() {
  const overview = await getSystemOverview();

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">7Flows Studio</p>
          <h1>为多 Agent 工作流准备的丝滑起步架构</h1>
          <p className="hero-text">
            当前首页已经接上后端概览接口，用来直观看到中间件、运行时与对象存储是否就绪。
            后续接入 xyflow 编辑器、调试面板和插件代理时，可以直接在这套结构上继续生长。
          </p>
          <div className="pill-row">
            {highlights.map((item) => (
              <span className="pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-label">Environment</div>
          <div className="panel-value">{overview.environment}</div>
          <p className="panel-text">
            API 状态：<strong>{overview.status}</strong>
          </p>
          <p className="panel-text">已声明能力：{overview.capabilities.join(" / ")}</p>
        </div>
      </section>

      <section className="grid">
        {overview.services.map((service) => (
          <StatusCard key={service.name} service={service} />
        ))}
      </section>

      <section className="roadmap">
        <div>
          <p className="eyebrow">Next Moves</p>
          <h2>这套初始化已经为后续模块留好了位置</h2>
        </div>
        <ul className="roadmap-list">
          <li>工作流定义与版本管理</li>
          <li>xyflow 可视化编排器</li>
          <li>Dify 插件兼容代理</li>
          <li>沙盒代码节点与 MCP 查询节点</li>
        </ul>
      </section>
    </main>
  );
}
