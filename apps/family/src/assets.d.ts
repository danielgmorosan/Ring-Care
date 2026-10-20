/** Bundled images resolve to a Metro asset id (a number) for <Image source>. */
declare module '*.jpg' {
  const asset: number;
  export default asset;
}
