export function WorkspaceMemberAdminSidebar() {
  return (
    <aside
      className="settings-sidebar-panel settings-sidebar-panel-dify"
      data-component="workspace-member-admin-sidebar"
    >
      <p className="workspace-eyebrow">Team</p>
      <h1>成员与角色</h1>
      <p className="workspace-muted workspace-copy-wide">
        先看 roster，再决定调整角色或新增成员，最后回工作台继续创建和编排应用。
      </p>
      <nav aria-label="Settings" className="settings-nav">
        <span className="settings-nav-group">工作台设置</span>
        <span className="settings-nav-item active">成员管理</span>
      </nav>
      <div aria-label="成员管理重点" className="settings-sidebar-focus-list">
        <span className="settings-sidebar-focus-item">先看成员</span>
        <span className="settings-sidebar-focus-item">再调角色</span>
        <span className="settings-sidebar-focus-item">新增并返回工作台</span>
      </div>
    </aside>
  );
}
