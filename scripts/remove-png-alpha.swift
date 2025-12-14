import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Options {
  let input: URL
  let output: URL
  let background: (r: UInt8, g: UInt8, b: UInt8)
}

func parseHexColor(_ value: String) -> (UInt8, UInt8, UInt8)? {
  var hex = value
  if hex.hasPrefix("#") { hex.removeFirst() }
  guard hex.count == 6, let int = Int(hex, radix: 16) else { return nil }
  let r = UInt8((int >> 16) & 0xFF)
  let g = UInt8((int >> 8) & 0xFF)
  let b = UInt8(int & 0xFF)
  return (r, g, b)
}

func parseArgs() -> Options {
  var inputPath: String?
  var outputPath: String?
  var background = (r: UInt8(0), g: UInt8(0), b: UInt8(0))

  var idx = 1
  let args = CommandLine.arguments
  while idx < args.count {
    let arg = args[idx]
    switch arg {
    case "--input":
      idx += 1
      inputPath = idx < args.count ? args[idx] : nil
    case "--output":
      idx += 1
      outputPath = idx < args.count ? args[idx] : nil
    case "--background":
      idx += 1
      if idx < args.count, let rgb = parseHexColor(args[idx]) {
        background = (rgb.0, rgb.1, rgb.2)
      }
    default:
      break
    }
    idx += 1
  }

  guard let inputPath, let outputPath else {
    fputs("Usage: swift scripts/remove-png-alpha.swift --input <path> --output <path> [--background #000000]\n", stderr)
    exit(2)
  }

  return Options(input: URL(fileURLWithPath: inputPath), output: URL(fileURLWithPath: outputPath), background: background)
}

let options = parseArgs()

guard let src = CGImageSourceCreateWithURL(options.input as CFURL, nil) else {
  fputs("Failed to read PNG: \(options.input.path)\n", stderr)
  exit(1)
}

guard let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  fputs("Failed to decode PNG: \(options.input.path)\n", stderr)
  exit(1)
}

let width = image.width
let height = image.height

let colorSpace = CGColorSpaceCreateDeviceRGB()
let bytesPerPixel = 4
let bytesPerRow = width * bytesPerPixel
let bitsPerComponent = 8

let bitmapInfo = CGBitmapInfo.byteOrder32Big.union(CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue))

guard let ctx = CGContext(
  data: nil,
  width: width,
  height: height,
  bitsPerComponent: bitsPerComponent,
  bytesPerRow: bytesPerRow,
  space: colorSpace,
  bitmapInfo: bitmapInfo.rawValue
) else {
  fputs("Failed to create CGContext\n", stderr)
  exit(1)
}

// Fill background.
ctx.setFillColor(
  red: CGFloat(options.background.r) / 255.0,
  green: CGFloat(options.background.g) / 255.0,
  blue: CGFloat(options.background.b) / 255.0,
  alpha: 1.0
)
ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

// Draw image on top.
ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

guard let flattened = ctx.makeImage() else {
  fputs("Failed to create output image\n", stderr)
  exit(1)
}

let outputDir = options.output.deletingLastPathComponent()
try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

guard let dest = CGImageDestinationCreateWithURL(options.output as CFURL, UTType.png.identifier as CFString, 1, nil) else {
  fputs("Failed to create PNG destination: \(options.output.path)\n", stderr)
  exit(1)
}

CGImageDestinationAddImage(dest, flattened, nil)
if !CGImageDestinationFinalize(dest) {
  fputs("Failed to write PNG: \(options.output.path)\n", stderr)
  exit(1)
}

print("Wrote: \(options.output.path)")
