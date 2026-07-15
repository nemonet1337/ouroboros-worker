// wrangler.toml の [[rules]] Text により .css は文字列モジュールとして import される
declare module "*.css" {
  const css: string;
  export default css;
}
