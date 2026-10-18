// onnxruntime-react-native is native only; detection runs on iOS and Android.
import type { Info } from "./vision";

export interface Frame {
  data: Uint8Array;
  w: number;
  h: number;
}

const unavailable = () => new Error("Object detection is only available in the iOS and Android app.");

export async function loadModels(): Promise<never> {
  throw unavailable();
}

export async function look(_frame: Frame): Promise<Info> {
  throw unavailable();
}
