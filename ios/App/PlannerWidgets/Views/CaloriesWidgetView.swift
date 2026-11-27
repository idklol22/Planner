// The Calories widget: today's total against the goal and one-tap logging.
// Quiet and monochrome: no flame, no tinted pills, every button stays tappable.
import SwiftUI

struct CaloriesWidgetView: View {
    var calories: CalorieSummary
    var amounts: [Int]
    /// Wide layout: a ring beside the buttons. Otherwise the small square.
    var wide: Bool
    var offline: Bool
    var palette: WidgetPalette
    var interact: WidgetInteraction

    private var goal: Double { calories.goal ?? 0 }
    private var progress: Double { goal > 0 ? min(max(calories.eaten / goal, 0), 1) : 0 }
    private var over: Bool { goal > 0 && calories.eaten > goal * 1.1 }
    private var fill: Color { palette.muted }

    private var remaining: String {
        guard goal > 0 else { return "kcal today" }
        let left = goal - calories.eaten
        return left >= 0 ? "\(WidgetLogic.number(left)) left" : "\(WidgetLogic.number(-left)) over"
    }

    private var activity: String? {
        var parts: [String] = []
        if let burned = calories.burned { parts.append("\(WidgetLogic.number(burned)) burned") }
        if let steps = calories.steps { parts.append("\(WidgetLogic.number(steps)) steps") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        Group {
            if wide { wideBody } else { smallBody }
        }
        .padding(14)
    }

    private var title: some View {
        HStack(spacing: 4) {
            Text("Calories")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(palette.muted)
                .lineLimit(1)
            if offline {
                Text("offline")
                    .font(.system(size: 12))
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 2)
            if let last = calories.lastWidgetEntry {
                interact(.undoCalories(entryId: last.id), AnyView(
                    Text(wide ? "Undo \(WidgetLogic.number(last.kcal))" : "Undo")
                        .font(.system(size: 14, weight: .medium).monospacedDigit())
                        .foregroundColor(palette.muted)
                        .frame(height: 32)
                        .contentShape(Rectangle())
                ))
            }
        }
        .frame(height: 20)
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 2) {
            title
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(WidgetLogic.number(calories.eaten))
                    .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(palette.text)
                if goal > 0 {
                    Text("/ \(WidgetLogic.number(goal))")
                        .font(.system(size: 12).monospacedDigit())
                        .foregroundColor(palette.faint)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(palette.faint.opacity(0.25))
                    Capsule().fill(fill).frame(width: max(geometry.size.width * progress, progress > 0 ? 6 : 0))
                }
            }
            .frame(height: 5)
            Text(remaining)
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundColor(over ? palette.warning : palette.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
            buttons(height: 34)
        }
    }

    private var wideBody: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle().stroke(palette.faint.opacity(0.25), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(fill, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text(WidgetLogic.number(calories.eaten))
                        .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(palette.text)
                    if goal > 0 {
                        Text("of \(WidgetLogic.number(goal))")
                            .font(.system(size: 12).monospacedDigit())
                            .foregroundColor(palette.faint)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 10)
            }
            .frame(width: 108, height: 108)
            VStack(alignment: .leading, spacing: 2) {
                title
                Text(remaining)
                    .font(.system(size: 16, weight: .semibold).monospacedDigit())
                    .foregroundColor(over ? palette.warning : palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if let activity = activity {
                    Text(activity)
                        .font(.system(size: 12).monospacedDigit())
                        .foregroundColor(palette.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
                buttons(height: 34)
                interact(.open(URL(string: "planner://calories")!), AnyView(
                    Text("Other amount…")
                        .font(.system(size: 14))
                        .foregroundColor(palette.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 28)
                        .contentShape(Rectangle())
                ))
            }
        }
    }

    private func buttons(height: CGFloat) -> some View {
        HStack(spacing: 6) {
            ForEach(Array(amounts.enumerated()), id: \.offset) { _, amount in
                interact(.addCalories(amount), AnyView(
                    Text("+\(amount)")
                        .font(.system(size: 14, weight: .semibold).monospacedDigit())
                        .foregroundColor(palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .frame(height: height)
                        .contentShape(Rectangle())
                ))
            }
        }
    }
}
