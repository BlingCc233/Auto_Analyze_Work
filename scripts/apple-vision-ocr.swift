import AppKit
import Foundation
import Vision

func recognizeText(_ cgImage: CGImage) throws -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["zh-Hans", "en-US"]
  request.usesLanguageCorrection = true
  try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
  return (request.results ?? [])
    .compactMap { $0.topCandidates(1).first?.string }
    .joined(separator: "\n")
}

func recognizeClockText(_ cgImage: CGImage) throws -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["en-US"]
  request.usesLanguageCorrection = false
  request.minimumTextHeight = 0.08
  try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
  return (request.results ?? [])
    .compactMap { $0.topCandidates(1).first?.string }
    .joined(separator: "\n")
}

struct ClockCandidate {
  let value: String
  let exact: Bool
}

func clockCandidate(_ raw: String) -> ClockCandidate? {
  let source = raw
    .replacingOccurrences(of: "O", with: "0")
    .replacingOccurrences(of: "o", with: "0")
    .replacingOccurrences(of: "I", with: "1")
    .replacingOccurrences(of: "l", with: "1")
    .replacingOccurrences(of: "|", with: "1")
  let range = NSRange(source.startIndex..<source.endIndex, in: source)
  let separated = try? NSRegularExpression(
    pattern: "(?<![0-9])([0-2]?[0-9])\\s*[:.·-]\\s*([0-5][0-9])(?![0-9])"
  )
  if let match = separated?.firstMatch(in: source, range: range),
     let hourRange = Range(match.range(at: 1), in: source),
     let minuteRange = Range(match.range(at: 2), in: source) {
    let hour = Int(source[hourRange]) ?? -1
    let minute = Int(source[minuteRange]) ?? -1
    if hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 {
      return ClockCandidate(
        value: String(format: "%02d:%02d", hour, minute),
        exact: true
      )
    }
  }

  let compact = source.filter(\.isNumber)
  let nonDigits = source.filter { !$0.isNumber && !$0.isWhitespace && !"\"'".contains($0) }
  if compact.count == 4 && nonDigits.isEmpty {
    let hour = Int(compact.prefix(2)) ?? -1
    let minute = Int(compact.suffix(2)) ?? -1
    if hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 {
      return ClockCandidate(
        value: String(format: "%02d:%02d", hour, minute),
        exact: false
      )
    }
  }
  return nil
}

func recognizeClock(_ image: CGImage) throws -> String {
  struct Vote {
    var count = 0
    var exactCount = 0
  }
  var votes: [String: Vote] = [:]
  let cropWidth = min(250, image.width)
  let cropHeight = min(220, image.height)
  for ratio in [0.50, 0.53, 0.56, 0.59, 0.62, 0.65] {
    let top = Int((Double(image.height) * ratio).rounded())
    guard top + cropHeight <= image.height,
          let crop = image.cropping(to: CGRect(
            x: 0,
            y: top,
            width: cropWidth,
            height: cropHeight
          )) else { continue }
    let raw = try recognizeClockText(crop)
    for line in raw.split(whereSeparator: \.isNewline) {
      guard let candidate = clockCandidate(String(line)) else { continue }
      var vote = votes[candidate.value] ?? Vote()
      vote.count += 1
      if candidate.exact { vote.exactCount += 1 }
      votes[candidate.value] = vote
    }
  }
  let selected = votes
    .filter { _, vote in vote.exactCount > 0 || vote.count >= 2 }
    .sorted { left, right in
      if left.value.count != right.value.count {
        return left.value.count > right.value.count
      }
      if left.value.exactCount != right.value.exactCount {
        return left.value.exactCount > right.value.exactCount
      }
      return left.key < right.key
    }
    .first
  return selected?.key ?? ""
}

func relativeCrop(
  _ image: CGImage,
  x: CGFloat,
  y: CGFloat,
  width: CGFloat,
  height: CGFloat
) -> CGImage? {
  let rect = CGRect(
    x: CGFloat(image.width) * x,
    y: CGFloat(image.height) * y,
    width: CGFloat(image.width) * width,
    height: CGFloat(image.height) * height
  ).integral
  return image.cropping(to: rect)
}

func recognize(_ path: String) -> [String: String] {
  guard let image = NSImage(contentsOfFile: path) else {
    return ["file": path, "text": "", "error": "无法读取图片"]
  }

  var rect = NSRect(origin: .zero, size: image.size)
  guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    return ["file": path, "text": "", "error": "无法转换图片"]
  }

  do {
    let text = try recognizeText(cgImage)
    let timeText = try recognizeClock(cgImage)
    return ["file": path, "text": text, "timeText": timeText]
  } catch {
    return ["file": path, "text": "", "error": error.localizedDescription]
  }
}

let results = CommandLine.arguments.dropFirst().map(recognize)
let data = try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data([10]))
