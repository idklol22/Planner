// The Tasks widget: header, optional goals, tappable rows and a pager.
// Heights are fixed so the number of rows follows from the space the device gives.
import SwiftUI

enum TasksLayout {
    case small, medium, large
}

struct TasksWidgetView: View {
    var model: TasksModel
    var layout: TasksLayout
    var page: Int
    var offline: Bool
    var palette: WidgetPalette
    var interact: WidgetInteraction

    private let goalHeight: CGFloat = 19
    private let sectionHeight: CGFloat = 17
    private var rowHeight: CGFloat { layout == .large ? 26 : 25 }
    private var headerHeight: CGFloat { layout == .large ? 24 : 22 }
    private var inset: CGFloat { layout == .large ? 14 : 12 }
    /// Narrow rows give the whole width to the title.
    private var narrowRows: Bool { layout == .small || (layout == .medium && !model.goals.isEmpty) }

    private var accent: Color {
        model.color.flatMap { Color(css: $0) } ?? palette.accent
    }

    var body: some View {
        GeometryReader { geometry in
            let height = geometry.size.height - inset * 2 - headerHeight - 4
            // Small and medium widgets page from the header, so every line holds a task.
            let paged = layout == .large ? nil : WidgetLogic.page(
                model.rows, capacity: Int((height + 1) / rowHeight), requested: page, reservePager: false)
            VStack(alignment: .leading, spacing: 4) {
                header(paged)
                content(height: height)
                Spacer(minLength: 0)
            }
            .padding(inset)
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
        }
    }

    private func header(_ paged: Page<TaskRowModel>?) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2)
                .fill(accent)
                .frame(width: 4, height: 15)
            Text(model.title)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(palette.text)
                .lineLimit(1)
            Spacer(minLength: 4)
            if offline {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(palette.warning)
            }
            if let paged = paged, paged.count > 1 {
                interact(.nextPage, AnyView(
                    badge("\(countText) · \(paged.index + 1)/\(paged.count)", chevron: true)))
            } else {
                badge(countText, chevron: false)
            }
        }
        .frame(height: headerHeight)
    }

    private var countText: String {
        if model.openCount == 0 { return "Done" }
        return layout == .small ? "\(model.openCount)" : "\(model.openCount) left"
    }

    private func badge(_ text: String, chevron: Bool) -> some View {
        HStack(spacing: 3) {
            Text(text)
                .font(.system(size: 11, weight: .bold).monospacedDigit())
                .lineLimit(1)
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .heavy))
            }
        }
        .foregroundColor(accent)
        .padding(.horizontal, 8)
        .frame(height: 20)
        .background(accent.opacity(0.16))
        .clipShape(Capsule())
        .fixedSize()
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func content(height: CGFloat) -> some View {
        if !model.goals.isEmpty && layout == .medium {
            // Side by side: goals stay in view while the tasks page.
            HStack(alignment: .top, spacing: 10) {
                goalList(limit: max(Int((height - sectionHeight) / goalHeight), 1))
                    .frame(width: 104, alignment: .leading)
                Rectangle().fill(palette.faint.opacity(0.25)).frame(width: 1, height: height - 4)
                taskList(height: height)
            }
        } else if !model.goals.isEmpty && layout == .large {
            let room = model.rows.isEmpty ? 8 : 4
            let shown = min(model.goals.count, room)
            let extra: CGFloat = model.goals.count > shown ? goalHeight : 0
            let goalsHeight = sectionHeight + CGFloat(shown) * goalHeight + extra
            VStack(alignment: .leading, spacing: 4) {
                goalList(limit: model.goals.count > room ? room + 1 : room)
                sectionTitle("TASKS")
                taskList(height: height - goalsHeight - sectionHeight - 8)
            }
        } else if !model.goals.isEmpty && layout == .small && model.rows.isEmpty {
            goalList(limit: max(Int((height - sectionHeight) / goalHeight), 1))
        } else {
            taskList(height: height)
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 9.5, weight: .heavy))
            .tracking(1.1)
            .foregroundColor(palette.faint)
            .frame(height: sectionHeight, alignment: .bottomLeading)
    }

    /// `limit` counts lines, including the "+N more" line.
    private func goalList(limit: Int) -> some View {
        let all = model.goals
        let shown = all.count <= limit ? all.count : max(limit - 1, 1)
        return VStack(alignment: .leading, spacing: 0) {
            sectionTitle("GOALS")
            ForEach(Array(all.prefix(shown).enumerated()), id: \.offset) { _, goal in
                HStack(spacing: 5) {
                    Image(systemName: goal.done ? "checkmark.seal.fill" : "target")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(goal.done ? palette.faint : accent)
                        .frame(width: 12)
                    Text(goal.title)
                        .font(.system(size: 11.5, weight: .medium))
                        .strikethrough(goal.done)
                        .foregroundColor(goal.done ? palette.faint : palette.text)
                        .lineLimit(1)
                }
                .frame(height: goalHeight)
            }
            if all.count > shown {
                Text("+\(all.count - shown) more")
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(palette.faint)
                    .frame(height: goalHeight)
            }
        }
    }

    @ViewBuilder
    private func taskList(height: CGFloat) -> some View {
        if model.rows.isEmpty {
            VStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: layout == .large ? 30 : 22))
                    .foregroundColor(accent)
                Text("All clear")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(palette.muted)
            }
            .frame(maxWidth: .infinity, maxHeight: max(height, 0))
        } else {
            let result = WidgetLogic.page(model.rows, capacity: Int((height + 1) / rowHeight), requested: page,
                                          reservePager: layout == .large)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(result.items) { row in
                    interact(.toggle(taskId: row.id, done: !row.done), AnyView(taskRow(row)))
                }
                if result.count > 1 && layout == .large {
                    interact(.nextPage, AnyView(pager(result.index, result.count, result.hidden)))
                }
            }
        }
    }

    private func taskRow(_ row: TaskRowModel) -> some View {
        let tint = row.color.flatMap { Color(css: $0) } ?? accent
        return HStack(spacing: 8) {
            // The same tile as in the app: outlined while open, filled with a tick once done.
            ZStack {
                let tile = RoundedRectangle(cornerRadius: 5, style: .continuous)
                if row.done {
                    tile.fill(tint)
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundColor(palette.text)
                        .shadow(color: palette.bg, radius: 0.5)
                        .offset(x: 2, y: -2)
                } else {
                    tile.fill(tint.opacity(0.12))
                    tile.strokeBorder(tint, lineWidth: 1.6)
                }
            }
            .frame(width: 16, height: 16)
            Text(row.title)
                .font(.system(size: 13, weight: .medium))
                .strikethrough(row.done)
                .foregroundColor(row.done ? palette.faint : palette.text)
                .lineLimit(1)
            Spacer(minLength: 4)
            if row.deadline && !row.done {
                Image(systemName: "flag.fill")
                    .font(.system(size: 9))
                    .foregroundColor(palette.warning)
            }
            // Narrow rows keep their width for titles; a late task still shows a mark.
            if narrowRows {
                if row.overdue && !row.deadline { Circle().fill(palette.warning).frame(width: 5, height: 5) }
            } else if !row.detail.isEmpty {
                Text(row.detail)
                    .font(.system(size: 10.5, weight: .semibold).monospacedDigit())
                    .foregroundColor(row.overdue ? palette.warning : palette.faint)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .frame(height: rowHeight)
        .contentShape(Rectangle())
    }

    private func pager(_ index: Int, _ count: Int, _ hidden: Int) -> some View {
        HStack(spacing: 4) {
            Spacer(minLength: 0)
            Text("+\(hidden) more · \(index + 1)/\(count)")
                .font(.system(size: 10.5, weight: .bold).monospacedDigit())
            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .heavy))
        }
        .foregroundColor(accent)
        .frame(height: rowHeight)
        .contentShape(Rectangle())
    }
}
