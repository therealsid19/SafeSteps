// onnxruntime-react-native is native only; detection runs on iOS and Android.
import type { Info } from "./vision";

const unavailable = () => new Error("Object detection is only available in the iOS and Android app.");

export async function loadModels(): Promise<never> {
  throw unavailable();
}

export async function look(_pixels: Uint8Array, _frameW: number, _frameH: number): Promise<Info> {
  throw unavailable();
}