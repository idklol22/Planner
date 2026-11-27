// Colours come from the theme chosen in Planner. Plain SwiftUI (also rendered on macOS for previews).
import SwiftUI

struct WidgetPalette {
    var bg: Color
    var surface: Color
    var text: Color
    var muted: Color
    var faint: Color
    var accent: Color
    var accentText: Color
    var warning: Color

    init(_ spec: ThemeSpec?) {
        // Planner's default "Wabi" theme.
        let fallback = ThemeSpec(bg: "#0b0b0a", surface: "#121210", text: "#e9e6dd", muted: "#a5a296",
                                 faint: "#807d72", accent: "#6df0a0", accentContrast: "#06120b", dark: true)
        let theme = spec ?? fallback
        bg = Color(css: theme.bg) ?? Color(css: fallback.bg)!
        surface = Color(css: theme.surface) ?? Color(css: fallback.surface)!
        text = Color(css: theme.text) ?? Color(css: fallback.text)!
        muted = Color(css: theme.muted) ?? Color(css: fallback.muted)!
        faint = Color(css: theme.faint) ?? Color(css: fallback.faint)!
        accent = Color(css: theme.accent) ?? Color(css: fallback.accent)!
        accentText = Color(css: theme.accentContrast) ?? Color(css: fallback.accentContrast)!
        warning = theme.dark ? Color(css: "#e8b765")! : Color(css: "#a15c00")!
    }
}

extension Color {
    /// "#rgb", "#rrggbb", "#rrggbbaa", "rgb(r, g, b)" or "rgba(r, g, b, a)".
    init?(css: String) {
        let value = css.trimmingCharacters(in: .whitespaces).lowercased()
        if value.hasPrefix("#") {
            var hex = String(value.dropFirst())
            if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
            guard hex.count == 6 || hex.count == 8, let number = UInt64(hex, radix: 16) else { return nil }
            let alpha = hex.count == 8 ? Double(number & 0xff) / 255 : 1
            let rgb = hex.count == 8 ? number >> 8 : number
            self.init(.sRGB,
                      red: Double((rgb >> 16) & 0xff) / 255,
                      green: Double((rgb >> 8) & 0xff) / 255,
                      blue: Double(rgb & 0xff) / 255,
                      opacity: alpha)
            return
        }
        if value.hasPrefix("rgb"), let open = value.firstIndex(of: "("), let close = value.lastIndex(of: ")") {
            let parts = value[value.index(after: open)..<close]
                .split(separator: ",")
                .compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            guard parts.count >= 3 else { return nil }
            self.init(.sRGB, red: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255,
                      opacity: parts.count > 3 ? parts[3] : 1)
            return
        }
        return nil
    }
}

/// Something the user can tap. The widget turns it into a button; previews show the label as it is.
enum WidgetTap {
    case toggle(taskId: String, done: Bool)
    case addCalories(Int)
    case undoCalories(entryId: String)
    case nextPage
    case previousPage
    case open(URL)
}

typealias WidgetInteraction = (WidgetTap, AnyView) -> AnyView

/// A centred explanation: setup steps, errors, empty states. Words, no decorative icon.
struct WidgetMessageView: View {
    var title: String
    var detail: String
    var palette: WidgetPalette

    var body: some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(palette.text)
                .multilineTextAlignment(.center)
            Text(detail)
                .font(.system(size: 12))
                .foregroundColor(palette.muted)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
