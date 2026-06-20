export async function cloneRepo(opts: { url: string; branch: string; dest: string }): Promise<string> {
  return opts.dest;
}
export async function commitChanges(_opts: { message: string }): Promise<string> {
  return "";
}
export async function pushBranch(_opts: { branch: string }): Promise<void> {}
