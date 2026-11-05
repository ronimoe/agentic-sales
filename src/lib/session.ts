/** Until real login exists, cookies may only switch business or role on the local sample database. */
export function resolveSession<W extends { id: string }, M extends { id: string }>(workspaces: W[], membersOf: (w: W) => M[], cookies: { ws?: string; member?: string }, hasRealDatabase: boolean) {
  const workspace = (!hasRealDatabase && workspaces.find((w) => w.id === cookies.ws)) || workspaces[0];
  const members = membersOf(workspace);
  const member = (!hasRealDatabase && members.find((m) => m.id === cookies.member)) || members[0];
  return { workspace, member, visibleWorkspaces: hasRealDatabase ? [workspace] : workspaces, visibleMembers: hasRealDatabase ? [member] : members };
}
