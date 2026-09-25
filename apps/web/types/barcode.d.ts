export {}

declare global {
  interface DetectedBarcode {
    rawValue: string
  }

  interface BarcodeDetectorInstance {
    detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
  }

  declare class BarcodeDetector {
    constructor(options?: { formats?: string[] })
    detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
  }

  interface Window {
    BarcodeDetector?: typeof BarcodeDetector
  }
}
