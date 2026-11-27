// The Tasks widget: header, optional goals, tappable rows and a pager.
// Heights are fixed so the number of rows follows from the space the device gives.
// iPhone 15: small 158x158, medium 338x158, large 338x354 points.
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

    private let goalHeight: CGFloat = 23
    private let sectionHeight: CGFloat = 15
    private var rowHeight: CGFloat {
        switch layout {
        case .large: return 36
        case .medium: return 31
        case .small: return 30
        }
    }
    private var headerHeight: CGFloat { layout == .large ? 28 : 32 }
    private var inset: CGFloat { 12 }
    private var titleSize: CGFloat {
        switch layout {
        case .large: return 19
        case .medium: return 17
        case .small: return 16
        }
    }
    private var rowTitleSize: CGFloat {
        switch layout {
        case .large: return 16
        case .medium: return 15
        case .small: return 14
        }
    }
    /// A narrow row has no room for trailing text; only "due" is allowed there.
    private var narrowRows: Bool { layout == .small }

    private var categoryColor: Color? { model.color.flatMap { Color(css: $0) } }

    var body: some View {
        GeometryReader { geometry in
            let height = max(geometry.size.height - inset * 2 - headerHeight - 4, 0)
            let capacity = max(Int(height / rowHeight), 1)
            // Small and medium page from the header, so every line holds a task.
            let headerPaged: Page<TaskRowModel>? = layout == .large ? nil : WidgetLogic.page(
                model.rows, capacity: capacity, requested: page, reservePager: false)
            VStack(alignment: .leading, spacing: 4) {
                header(headerPaged)
                content(height: height)
                Spacer(minLength: 0)
            }
            .padding(inset)
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
        }
    }

    private func header(_ paged: Page<TaskRowModel>?) -> some View {
        HStack(spacing: 4) {
            // The only place a category colour is allowed: a 7pt dot by its name.
            if let dot = categoryColor {
                Circle().fill(dot).frame(width: 7, height: 7)
            }
            Text(model.title)
                .font(.system(size: titleSize, weight: .bold))
                .foregroundColor(palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 2)
            if offline {
                Text("offline")
                    .font(.system(size: 12))
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            if let paged = paged, paged.count > 1 {
                // A small widget has room for the title and the two buttons only.
                if layout != .small {
                    countText
                    Text("\(paged.index + 1)/\(paged.count)")
                        .font(.system(size: 12, weight: .medium).monospacedDigit())
                        .foregroundColor(palette.muted)
                        .lineLimit(1)
                }
                pagerChevron("chevron.up", tap: .previousPage, label: "Previous page")
                pagerChevron("chevron.down", tap: .nextPage, label: "Next page")
            } else {
                countText
            }
        }
        .frame(height: headerHeight)
    }

    private var countText: some View {
        let text = model.openCount == 0
            ? "Done"
            : (layout == .small ? "\(model.openCount)" : "\(model.openCount) left")
        return Text(text)
            .font(.system(size: 13).monospacedDigit())
            .foregroundColor(palette.muted)
            .lineLimit(1)
    }

    private func pagerChevron(_ systemName: String, tap: WidgetTap, label: String) -> some View {
        interact(tap, AnyView(
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(palette.muted)
                .frame(width: layout == .small ? 26 : 44, height: 32)
                .contentShape(Rectangle())
                .accessibilityLabel(label)
        ))
    }

    @ViewBuilder
    private func content(height: CGFloat) -> some View {
        if !model.goals.isEmpty && layout == .medium {
            // Side by side: goals stay in view while the tasks page.
            HStack(alignment: .top, spacing: 10) {
                goalList(limit: max(Int((height - sectionHeight) / goalHeight), 1))
                    .frame(width: 104, alignment: .leading)
                Rectangle().fill(palette.faint.opacity(0.35)).frame(width: 1, height: height - 4)
                taskList(height: height)
            }
        } else if !model.goals.isEmpty && layout == .large {
            let room = model.rows.isEmpty ? 7 : 4
            let shown = min(model.goals.count, room)
            let extra: CGFloat = model.goals.count > shown ? goalHeight : 0
            let goalsHeight = sectionHeight + CGFloat(shown) * goalHeight + extra
            let tasksHeight = height - goalsHeight - sectionHeight - 4
            VStack(alignment: .leading, spacing: 2) {
                goalList(limit: model.goals.count > room ? room + 1 : room)
                sectionTitle("TASKS")
                taskList(height: tasksHeight)
            }
        } else if !model.goals.isEmpty && layout == .small && model.rows.isEmpty {
            goalList(limit: max(Int((height - sectionHeight) / goalHeight), 1))
        } else {
            taskList(height: height)
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.8)
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
                HStack(spacing: 6) {
                    // A plain dot, never a target or a seal.
                    if goal.done {
                        Circle().fill(palette.muted).frame(width: 5, height: 5)
                    } else {
                        Circle().stroke(palette.faint, lineWidth: 1).frame(width: 5, height: 5)
                    }
                    Text(goal.title)
                        .font(.system(size: 13.5))
                        .strikethrough(goal.done)
                        .foregroundColor(goal.done ? palette.faint : palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                .frame(height: goalHeight)
            }
            if all.count > shown {
                Text("+\(all.count - shown) more")
                    .font(.system(size: 12))
                    .foregroundColor(palette.faint)
                    .frame(height: goalHeight)
            }
        }
    }

    @ViewBuilder
    private func taskList(height: CGFloat) -> some View {
        if model.rows.isEmpty {
            Text("All clear")
                .font(.system(size: layout == .large ? 16 : 14, weight: .medium))
                .foregroundColor(palette.muted)
                .frame(maxWidth: .infinity, maxHeight: max(height, 0), alignment: .top)
        } else {
            let room = max(Int(height / rowHeight), 1)
            let result = WidgetLogic.page(model.rows, capacity: room, requested: page,
                                          reservePager: layout == .large)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(result.items) { row in
                    interact(.toggle(taskId: row.id, done: !row.done), AnyView(taskRow(row)))
                }
                if result.count > 1 && layout == .large {
                    pager(result.index, result.count)
                }
            }
        }
    }

    /// The large widget's bottom row: up on the left, page numbers, down on the right.
    private func pager(_ index: Int, _ count: Int) -> some View {
        HStack(spacing: 4) {
            pagerChevron("chevron.up", tap: .previousPage, label: "Previous page")
            Spacer(minLength: 0)
            Text("\(index + 1) / \(count)")
                .font(.system(size: 13, weight: .medium).monospacedDigit())
                .foregroundColor(palette.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
            pagerChevron("chevron.down", tap: .nextPage, label: "Next page")
        }
        .frame(height: rowHeight)
    }

    private func taskRow(_ row: TaskRowModel) -> some View {
        HStack(spacing: 8) {
            // Matches the app: a faint circle, filled with a background tick when done.
            ZStack {
                if row.done {
                    Circle().fill(palette.muted)
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(palette.bg)
                } else {
                    Circle().strokeBorder(palette.faint, lineWidth: 1.6)
                }
            }
            .frame(width: 19, height: 19)

            Text(row.title)
                .font(.system(size: rowTitleSize))
                .strikethrough(row.done)
                .foregroundColor(row.done ? palette.faint : palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 2)
            if !row.done && (row.deadline || row.overdue) {
                Text("due")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(palette.warning)
                    .lineLimit(1)
            } else if !narrowRows && !row.detail.isEmpty {
                Text(row.detail)
                    .font(.system(size: 12).monospacedDigit())
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
            }
        }
        .frame(height: rowHeight)
        .contentShape(Rectangle())
    }
}
