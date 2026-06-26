import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon — what iOS uses when the user saves the page to the
// home screen. SVG isn't honoured there, so Next builds this into a PNG
// at compile time via ImageResponse. Same anvil mark as app/icon.svg,
// upscaled to 180x180 with the brand navy backdrop.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1A1F2E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
        }}
      >
        <svg
          width={120}
          height={120}
          viewBox="129 7 46.07 32.13"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M175.07 17.6667V10.1628V7H169.469H137.709V10.1628H129C129 17.007 132.474 20.2729 137.709 21.6839V26.8429H147.36C147.36 31.6528 147.36 31.6509 142.988 31.6509H137.709V34.0667C137.663 34.1052 137.709 35.9333 137.709 35.9333V37.5333V39.1333H175.07V31.6528H169.469C165.43 31.6528 165.43 31.6528 165.43 26.8448C165.43 26.8448 168.006 26.8448 171.906 21.6839L175.07 17.6667Z"
            fill="#FF8C32"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
