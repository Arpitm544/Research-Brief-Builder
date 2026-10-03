declare module "html-encoding-sniffer" {
  export default function sniffHTMLEncoding(bytes: Uint8Array, options?: {
    xml?: boolean;
    transportLayerEncodingLabel?: string;
    defaultEncoding?: string;
  }): string;
}
