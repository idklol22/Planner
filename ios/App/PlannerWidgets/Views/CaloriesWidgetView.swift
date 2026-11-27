// The Calories widget: today's total against the goal and one-tap logging.
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
    private var progress: Double { goal > 0 ? min(calories.eaten / goal, 1) : 0 }
    private var over: Bool { goal > 0 && calories.eaten > goal * 1.1 }
    private var tint: Color { over ? palette.warning : palette.accent }

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
            Image(systemName: "flame.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(Color(css: "#f2a65a")!)
            Text("Calories")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(palette.muted)
                .lineLimit(1)
            if offline {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(palette.warning)
            }
            Spacer(minLength: 2)
            if let last = calories.lastWidgetEntry {
                interact(.undoCalories(entryId: last.id), AnyView(
                    HStack(spacing: 2) {
                        Image(systemName: "arrow.uturn.backward")
                        Text(WidgetLogic.number(last.kcal))
                    }
                    .font(.system(size: 10, weight: .bold).monospacedDigit())
                    .foregroundColor(palette.muted)
                    .padding(.horizontal, 6)
                    .frame(height: 20)
                    .background(palette.text.opacity(0.09))
                    .clipShape(Capsule())
                    .contentShape(Rectangle())
                ))
            }
        }
        .frame(height: 20)
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 5) {
            title
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(WidgetLogic.number(calories.eaten))
                    .font(.system(size: 31, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundColor(palette.text)
                if goal > 0 {
                    Text("/ \(WidgetLogic.number(goal))")
                        .font(.system(size: 11, weight: .semibold).monospacedDigit())
                        .foregroundColor(palette.faint)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(palette.text.opacity(0.1))
                    Capsule().fill(tint).frame(width: max(geometry.size.width * progress, progress > 0 ? 6 : 0))
                }
            }
            .frame(height: 6)
            Text(remaining)
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundColor(over ? palette.warning : palette.muted)
            Spacer(minLength: 0)
            buttons(height: 32)
        }
    }

    private var wideBody: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle().stroke(palette.text.opacity(0.1), lineWidth: 10)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(tint, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text(WidgetLogic.number(calories.eaten))
                        .font(.system(size: 25, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundColor(palette.text)
                    if goal > 0 {
                        Text("of \(WidgetLogic.number(goal))")
                            .font(.system(size: 10.5, weight: .semibold).monospacedDigit())
                            .foregroundColor(palette.faint)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 12)
            }
            .frame(width: 112, height: 112)
            VStack(alignment: .leading, spacing: 5) {
                title
                Text(remaining)
                    .font(.system(size: 18, weight: .bold).monospacedDigit())
                    .foregroundColor(over ? palette.warning : palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let activity = activity {
                    Text(activity)
                        .font(.system(size: 11, weight: .medium).monospacedDigit())
                        .foregroundColor(palette.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
                buttons(height: 34)
                interact(.open(URL(string: "planner://calories")!), AnyView(
                    Text("Other amount…")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(palette.accent)
                        .frame(maxWidth: .infinity)
                ))
            }
        }
    }

    private func buttons(height: CGFloat) -> some View {
        HStack(spacing: 6) {
            ForEach(Array(amounts.enumerated()), id: \.offset) { _, amount in
                interact(.addCalories(amount), AnyView(
                    Text("+\(amount)")
                        .font(.system(size: 13, weight: .bold).monospacedDigit())
                        .foregroundColor(palette.accent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                        .frame(height: height)
                        .background(palette.accent.opacity(0.16))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .contentShape(Rectangle())
                ))
            }
        }
    }
}
