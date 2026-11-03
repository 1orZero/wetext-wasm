declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

declare module "*.fst" {
  const data: ArrayBuffer;
  export default data;
}
