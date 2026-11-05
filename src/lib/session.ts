/** Until real login exists, cookies may only switch business or role on the local sample database. */
export function resolveSession<W extends { id: string }, M extends { id: string; role?: string }>(workspaces: W[], membersOf: (w: W) => M[], cookies: { ws?: string; member?: string }, hasRealDatabase: boolean) {
  const workspace = (!hasRealDatabase && workspaces.find((w) => w.id === cookies.ws)) || workspaces[0];
  const members = membersOf(workspace);
  // A real database has one shared login for now, so it always acts as the owner, whatever the row order.
  const member = hasRealDatabase ? members.find((m) => m.role === "owner") : members.find((m) => m.id === cookies.member) ?? members[0];
  if (!member) throw new Error("Tidak ada pemilik untuk bisnis ini");
  return { workspace, member, visibleWorkspaces: hasRealDatabase ? [workspace] : workspaces, visibleMembers: hasRealDatabase ? [member] : members };
}
